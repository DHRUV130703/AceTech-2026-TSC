/**
 * Applies db/schema.sql to DATABASE_URL (idempotent).
 * Usage: npm run db:migrate   (reads .env.local)
 */
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const raw = process.env.DATABASE_URL;
if (!raw) throw new Error('DATABASE_URL is not set (check .env.local)');
const url = new URL(raw);
url.searchParams.delete('sslmode');
const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');

const client = new pg.Client({
  connectionString: url.toString(),
  ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  const { rows } = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'acetech_leads' ORDER BY ordinal_position`,
  );
  const { rows: v } = await client.query('SELECT version()');
  console.log(v[0].version.split(' on ')[0]);
  console.log(`acetech_leads ready (${rows.length} columns): ${rows.map((r) => r.column_name).join(', ')}`);
} finally {
  await client.end();
}
