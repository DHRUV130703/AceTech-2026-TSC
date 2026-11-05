/**
 * Exports acetech_leads to CSV.
 * Usage: npm run leads:export            → exports/acetech-leads-<date>.csv
 *        npm run leads:export -- failed  → only rows where the LeadSquared write failed (backfill list)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import pg from 'pg';

const raw = process.env.DATABASE_URL;
if (!raw) throw new Error('DATABASE_URL is not set (check .env.local)');
const url = new URL(raw);
url.searchParams.delete('sslmode');
const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');
const onlyFailed = process.argv[2] === 'failed';

const client = new pg.Client({ connectionString: url.toString(), ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows, fields } = await client.query(
    `SELECT id, created_at AT TIME ZONE 'Asia/Kolkata' AS created_at_ist, name, phone, organisation, lead_kind,
            lsq_outcome, lsq_status, lsq_prospect_id, lsq_activity_event, lsq_error
       FROM acetech_leads ${onlyFailed ? "WHERE lsq_outcome = 'failed'" : ''}
      ORDER BY created_at`,
  );
  const esc = (v: unknown) => {
    const s = v instanceof Date ? v.toISOString().replace('T', ' ').slice(0, 19) : v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [fields.map((f) => f.name).join(','), ...rows.map((r) => fields.map((f) => esc(r[f.name])).join(','))].join('\n');
  await mkdir('exports', { recursive: true });
  const file = `exports/acetech-leads${onlyFailed ? '-failed' : ''}-${new Date().toISOString().slice(0, 10)}.csv`;
  await writeFile(file, csv + '\n');
  console.log(`${rows.length} rows → ${file}`);
} finally {
  await client.end();
}
