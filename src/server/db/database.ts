import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from "pg";

import type { RequestContext } from "@/server/context";

/**
 * Database provider: pooled connections and per-transaction request context.
 *
 * Two connection pools, mirroring the Supabase security model:
 *
 *  • runtime  → role without BYPASSRLS: every statement runs with RLS enforced.
 *               Used for all storefront and admin reads.
 *  • service  → privileged role (Supabase: service_role). Used only inside server
 *               code for authorised writes such as guest checkout.
 *
 * Request context (user, tenant, customer, cart token) is applied per
 * transaction with `set_config(..., true)` so it can never leak between
 * requests that share a pooled connection.
 *
 * Instances are created by the registry (`registry.ts`), never by repositories.
 */

export interface DbClient {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: readonly unknown[]): Promise<T[]>;
  queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params?: readonly unknown[]): Promise<T | null>;
  queryCount(text: string, params?: readonly unknown[]): Promise<number>;
}

class TxClient implements DbClient {
  constructor(private readonly client: PoolClient) {}

  async query<T extends QueryResultRow = QueryResultRow>(text: string, params: readonly unknown[] = []): Promise<T[]> {
    const result = await this.client.query<T>(text, params as unknown[]);
    return result.rows;
  }

  async queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }

  async queryCount(text: string, params: readonly unknown[] = []): Promise<number> {
    const row = await this.queryOne<{ count: string }>(text, params);
    return row ? Number.parseInt(row.count, 10) : 0;
  }
}

export class Database {
  private readonly runtimePool: Pool;
  private readonly servicePool: Pool;

  constructor(runtimeUrl: string, serviceUrl?: string, options: { poolMax?: number } = {}) {
    const poolMax = options.poolMax ?? 10;
    this.runtimePool = new Pool(buildConfig(runtimeUrl, "rp_runtime", poolMax));
    const privilegedUrl = serviceUrl?.trim();
    this.servicePool = privilegedUrl ? new Pool(buildConfig(privilegedUrl, "rp_service", poolMax)) : this.runtimePool;
  }

  /**
   * RLS-enforced transaction on the shared runtime role. Used for every
   * storefront/admin read AND for customer-scoped writes (carts, addresses)
   * where RLS policies already express the authorisation rule.
   */
  async asRuntime<T>(context: RequestContext, handler: (db: DbClient) => Promise<T>): Promise<T> {
    return this.transaction(this.runtimePool, context, handler, "app_runtime");
  }

  /** Alias kept for readability at call sites that only read. */
  async read<T>(context: RequestContext, handler: (db: DbClient) => Promise<T>): Promise<T> {
    return this.asRuntime(context, handler);
  }

  /** Convenience for one-shot RLS-enforced queries. */
  async query<T extends QueryResultRow = QueryResultRow>(
    context: RequestContext,
    text: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    return this.read(context, (db) => db.query<T>(text, params));
  }

  async queryOne<T extends QueryResultRow = QueryResultRow>(
    context: RequestContext,
    text: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    return this.read(context, (db) => db.queryOne<T>(text, params));
  }

  /**
   * Privileged transaction (Supabase: service_role) for operations whose
   * authorisation is enforced in application code — guest checkout, order
   * creation, admin mutations after a permission check.
   */
  async asService<T>(context: RequestContext, handler: (db: DbClient) => Promise<T>): Promise<T> {
    return this.transaction(this.servicePool, context, handler, "app_service");
  }

  /** Alias kept for readability at privileged write call sites. */
  async write<T>(context: RequestContext, handler: (db: DbClient) => Promise<T>): Promise<T> {
    return this.asService(context, handler);
  }

  private async transaction<T>(
    pool: Pool,
    context: RequestContext,
    handler: (db: DbClient) => Promise<T>,
    role = "app_runtime",
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await applyContext(client, context, role);
      const result = await handler(new TxClient(client));
      await client.query("commit");
      return result;
    } catch (error) {
      try {
        await client.query("rollback");
      } catch {
        /* connection already broken — the pool will discard it */
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /** True when a separate privileged connection string is configured. */
  get hasServiceRole(): boolean {
    return this.servicePool !== this.runtimePool;
  }

  async end(): Promise<void> {
    await this.runtimePool.end();
    if (this.hasServiceRole) await this.servicePool.end();
  }
}

function buildConfig(connectionString: string, applicationName: string, poolMax: number): PoolConfig {
  return {
    connectionString,
    application_name: applicationName,
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // money is returned as strings, never parsed into floats
    types: undefined,
  };
}

async function applyContext(client: PoolClient, context: RequestContext, role = "app_runtime"): Promise<void> {
  await client.query(`set local role ${role}`);
  await client.query(
    `select
       set_config('app.current_user_id', $1, true),
       set_config('app.current_restaurant_id', $2, true),
       set_config('app.current_customer_id', $3, true),
       set_config('app.cart_token', $4, true),
       set_config('app.actor', $5, true),
       set_config('request.jwt.claims', $6, true)`,
    [
      context.userId ?? "",
      context.restaurantId ?? "",
      context.customerId ?? "",
      context.cartToken ?? "",
      context.actor ?? "system",
      context.userId ? JSON.stringify({ sub: context.userId, role: "authenticated" }) : "{}",
    ],
  );
}
