import 'server-only';
import { Pool, type PoolConfig } from 'pg';

/**
 * Aiven Postgres — secondary record of every form submission (LeadSquared stays the system of record).
 *
 * TLS: always encrypted. If DATABASE_CA_CERT (Aiven project CA, PEM) is set, the server cert is
 * fully verified; otherwise we encrypt without verifying (equivalent to libpq sslmode=require).
 */
/**
 * Accepts the URI as pasted from Aiven, including the Quick-connect form
 * `psql 'postgres://…'`, surrounding quotes and whitespace.
 */
export function cleanDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(/postgres(?:ql)?:\/\/[^\s'"]+/);
  return m?.[0];
}

export function poolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig | null {
  const raw = env.DATABASE_URL?.trim();
  if (!raw) return null;
  const cleaned = cleanDatabaseUrl(raw);
  if (!cleaned) throw new Error(`DATABASE_URL is not a postgres:// URI (len ${raw.length}, starts "${raw.slice(0, 4)}")`);
  const url = new URL(cleaned);
  // pg treats sslmode=require as verify-full; we configure TLS explicitly below instead.
  url.searchParams.delete('sslmode');
  const ca = env.DATABASE_CA_CERT?.replace(/\\n/g, '\n').trim();
  return {
    connectionString: url.toString(),
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
    // Aiven plan allows 15 connections; Fluid Compute reuses instances, so keep each pool tiny.
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
  };
}

const globalForPg = globalThis as unknown as { __acetechPool?: Pool | null };

export function getPool(): Pool | null {
  if (globalForPg.__acetechPool === undefined) {
    const cfg = poolConfig(); // throws on a malformed DATABASE_URL — caller logs it; retried next request
    globalForPg.__acetechPool = cfg ? new Pool(cfg) : null;
    globalForPg.__acetechPool?.on('error', (err) => console.error(JSON.stringify({ outcome: 'db_pool_error', detail: err.message })));
  }
  return globalForPg.__acetechPool;
}
