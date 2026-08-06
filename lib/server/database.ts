import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getDatabaseConfig } from "./runtime-config";

let poolPromise: Promise<Pool> | undefined;

async function createPool(): Promise<Pool> {
  const config = await getDatabaseConfig();
  const pool = new Pool({
    ...config,
    application_name: "epito-web",
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
  });

  pool.on("error", (error) => {
    console.error("PostgreSQL idle client error", error);
  });
  return pool;
}

export function getPool(): Promise<Pool> {
  poolPromise ??= createPool();
  return poolPromise;
}

export async function checkDatabase() {
  const startedAt = performance.now();
  const pool = await getPool();
  await pool.query("select 1");
  return { latencyMs: Math.round(performance.now() - startedAt) };
}

export async function withTenantTransaction<T>(
  tenantId: string,
  userId: string,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      "select set_config('app.current_tenant_id', $1, true), set_config('app.current_user_id', $2, true)",
      [tenantId, userId],
    );
    const result = await operation(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function tenantQuery<Row extends QueryResultRow>(
  tenantId: string,
  userId: string,
  text: string,
  values: unknown[] = [],
) {
  return withTenantTransaction(tenantId, userId, (client) =>
    client.query<Row>(text, values),
  );
}
