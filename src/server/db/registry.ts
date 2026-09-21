import { config } from "@/server/config";
import { Database } from "./database";

/**
 * Restaurant → database routing.
 *
 *   restaurantId ──► directory.resolve() ──► DatabaseConfig ──► DatabaseManager ──► Database (pools)
 *
 * Today every restaurant lives in one database, so the directory returns the
 * same config for everyone and the manager keeps a single pair of pools. To give
 * a restaurant its own database, replace `SingleDatabaseDirectory` with a
 * directory backed by a config file or a central registry table — repositories,
 * services and actions do not change. See docs/skills/restaurant-platform/SKILL.md (section 13).
 */

export interface DatabaseConfig {
  /** stable, non-secret identifier; restaurants with the same key share pools */
  key: string;
  runtimeUrl: string;
  serviceUrl?: string;
  poolMax?: number;
}

export interface DatabaseDirectory {
  /**
   * `restaurantId` is null for platform-level lookups made before a restaurant
   * is known (slug resolution, sign-in). A multi-database directory decides
   * where those live; it should reject null for tenant-scoped repositories.
   */
  resolve(restaurantId: string | null): DatabaseConfig;
}

class SingleDatabaseDirectory implements DatabaseDirectory {
  resolve(): DatabaseConfig {
    const { url, serviceUrl, poolMax } = config.database;
    return { key: "default", runtimeUrl: url, serviceUrl, poolMax };
  }
}

export class DatabaseManager {
  private readonly databases = new Map<string, Database>();

  constructor(private readonly directory: DatabaseDirectory) {}

  forRestaurant(restaurantId: string | null | undefined): Database {
    const target = this.directory.resolve(restaurantId ?? null);
    let database = this.databases.get(target.key);
    if (!database) {
      database = new Database(target.runtimeUrl, target.serviceUrl, { poolMax: target.poolMax });
      this.databases.set(target.key, database);
    }
    return database;
  }

  async closeAll(): Promise<void> {
    const open = [...this.databases.values()];
    this.databases.clear();
    await Promise.all(open.map((database) => database.end()));
  }
}

/** What repositories pass to `getDb`: anything carrying the restaurant id. */
export interface TenantScope {
  restaurantId?: string | null;
}

// Kept on globalThis in development so hot reloads do not leak connection pools.
const globalForManager = globalThis as typeof globalThis & { __databaseManager?: DatabaseManager };

function manager(): DatabaseManager {
  globalForManager.__databaseManager ??= new DatabaseManager(new SingleDatabaseDirectory());
  return globalForManager.__databaseManager;
}

/** The only way repositories obtain a database. */
export function getDb(scope: TenantScope = {}): Database {
  return manager().forRestaurant(scope.restaurantId);
}

export function closeDatabases(): Promise<void> {
  return manager().closeAll();
}
