import 'server-only';
import { getPool } from './db';
import type { Lead } from './lead-schema';
import type { LeadKind } from './leadsquared';

export type LeadLogEntry = {
  lead: Lead;
  kind: LeadKind;
  outcome: 'created' | 'activity_logged' | 'failed';
  lsqStatus: number | null;
  prospectId?: string | null;
  activityEvent?: number;
  error?: string;
  userAgent?: string | null;
};

export const INSERT_SQL = `INSERT INTO acetech_leads
  (name, phone, organisation, lead_kind, lsq_outcome, lsq_status, lsq_prospect_id, lsq_activity_event, lsq_error, user_agent)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;

/**
 * Writes one row per valid submission to Postgres. Never throws: the DB is a secondary record
 * and must never break the visitor's flow. Failures are logged (with the full lead) for backfill.
 */
export async function logLeadToDb(entry: LeadLogEntry, pool = getPool()): Promise<boolean> {
  if (!pool) {
    console.warn(JSON.stringify({ outcome: 'db_not_configured', hasEnv: process.env.DATABASE_URL !== undefined, envLen: process.env.DATABASE_URL?.length ?? 0 }));
    return false;
  }
  try {
    const t0 = Date.now();
    await pool.query(INSERT_SQL, [
      entry.lead.name,
      entry.lead.phone,
      entry.lead.organisation,
      entry.kind,
      entry.outcome,
      entry.lsqStatus,
      entry.prospectId ?? null,
      entry.activityEvent ?? null,
      entry.error?.slice(0, 1000) ?? null,
      entry.userAgent?.slice(0, 300) ?? null,
    ]);
    console.info(JSON.stringify({ outcome: 'db_logged', kind: entry.kind, lsqOutcome: entry.outcome, ms: Date.now() - t0 }));
    return true;
  } catch (err) {
    console.error(
      JSON.stringify({ outcome: 'db_insert_failed', detail: err instanceof Error ? err.message : String(err), backfill: entry.lead, kind: entry.kind, lsqOutcome: entry.outcome }),
    );
    return false;
  }
}
