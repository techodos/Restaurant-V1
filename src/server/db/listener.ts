import { Client } from "pg";
import { logger } from "@/server/logger";

/**
 * Postgres LISTEN/NOTIFY fan-out. ONE dedicated connection per (database, channel)
 * for the whole server process serves every subscriber, so ten thousand open order
 * pages still cost the database a single connection, and nothing is polled: the
 * database pushes.
 *
 * LISTEN needs a session-mode (or direct) connection; a transaction pooler such as
 * Supabase's port 6543 cannot be used, hence the separate DATABASE_URL_LISTEN.
 *
 * If the connection drops it is re-established with back-off. Notifications sent in
 * the gap are lost by nature, so subscribers get `onReset` once it is back and are
 * expected to re-read whatever they follow.
 */

export interface ChannelHandlers {
  onNotify: (payload: string) => void;
  /** the connection was lost and restored: anything sent meanwhile was missed */
  onReset: () => void;
}

const IDLE_CLOSE_MS = 30_000;
const CONNECT_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;

// never log the error object itself: connection errors can echo connection details
const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

class ChannelHub {
  private client: Client | null = null;
  private starting: Promise<void> | null = null;
  private readonly subscribers = new Set<ChannelHandlers>();
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private attempt = 0;

  constructor(
    private readonly url: string,
    private readonly channel: string,
  ) {}

  async add(handlers: ChannelHandlers): Promise<() => void> {
    this.subscribers.add(handlers);
    clearTimeout(this.idleTimer);
    try {
      await this.ensureConnected();
    } catch (error) {
      this.subscribers.delete(handlers);
      this.scheduleIdleClose();
      throw error;
    }
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      this.subscribers.delete(handlers);
      if (this.subscribers.size === 0) this.scheduleIdleClose();
    };
  }

  private ensureConnected(): Promise<void> {
    if (this.client) return Promise.resolve();
    this.starting ??= this.connect().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async connect(): Promise<void> {
    const client = new Client({
      connectionString: this.url,
      application_name: "rp_listen",
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      keepAlive: true,
    });
    client.on("notification", (message) => {
      if (message.channel !== this.channel || !message.payload) return;
      for (const subscriber of [...this.subscribers]) {
        try {
          subscriber.onNotify(message.payload);
        } catch (error) {
          logger.error("db", "listen: subscriber failed", describe(error));
        }
      }
    });
    client.on("error", (error) => this.lost(client, error));
    client.on("end", () => this.lost(client));
    try {
      await client.connect();
      // channel names are ours (constants), never user input
      await client.query(`listen ${this.channel}`);
    } catch (error) {
      client.removeAllListeners();
      client.on("error", () => undefined);
      await client.end().catch(() => undefined);
      throw error;
    }
    this.client = client;
    this.attempt = 0;
  }

  private lost(client: Client, error?: unknown): void {
    if (this.client !== client) return;
    this.client = null;
    client.removeAllListeners();
    client.on("error", () => undefined);
    void client.end().catch(() => undefined);
    if (error) logger.warn("db", "listen connection lost; reconnecting", describe(error));
    if (this.subscribers.size > 0) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.retryTimer) return;
    const delay = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** this.attempt++);
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = undefined;
      if (this.subscribers.size === 0) return;
      try {
        await this.ensureConnected();
        for (const subscriber of [...this.subscribers]) {
          try {
            subscriber.onReset();
          } catch (error) {
            logger.error("db", "listen: reset handler failed", describe(error));
          }
        }
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
    this.retryTimer.unref?.();
  }

  private scheduleIdleClose(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.subscribers.size > 0) return;
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
      const client = this.client;
      this.client = null;
      if (client) {
        client.removeAllListeners();
        client.on("error", () => undefined);
        void client.end().catch(() => undefined);
      }
    }, IDLE_CLOSE_MS);
    this.idleTimer.unref?.();
  }
}

// One registry per process, kept on globalThis so dev-server hot reloads do not leak connections.
const registry = ((globalThis as { __rpListenHubs?: Map<string, ChannelHub> }).__rpListenHubs ??= new Map());

/** Subscribes to a NOTIFY channel. Resolves once LISTEN is active; call the returned function to unsubscribe. */
export function listenToChannel(url: string, channel: string, handlers: ChannelHandlers): Promise<() => void> {
  if (!/^[a-z_][a-z0-9_]*$/.test(channel)) throw new Error("Invalid channel name.");
  const key = `${channel}@${url}`;
  let hub = registry.get(key);
  if (!hub) {
    hub = new ChannelHub(url, channel);
    registry.set(key, hub);
  }
  return hub.add(handlers);
}
