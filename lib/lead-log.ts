import 'server-only';
import type { Pool } from 'pg';
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

/** logged | not_configured | config_invalid | error | timeout — surfaced as the `x-lead-db` response header. */
export type DbLogStatus = 'logged' | 'not_configured' | 'config_invalid' | 'error' | 'timeout';

export const INSERT_SQL = `INSERT INTO acetech_leads
  (name, phone, organisation, lead_kind, lsq_outcome, lsq_status, lsq_prospect_id, lsq_activity_event, lsq_error, user_agent)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;

const DB_BUDGET_MS = 3_000;

/**
 * Writes one row per valid submission to Postgres. Never throws and never waits more than
 * DB_BUDGET_MS: the DB is a secondary record and must never break the visitor's flow.
 * Failures are logged with the full lead for backfill.
 */
export async function logLeadToDb(entry: LeadLogEntry, injected?: Pick<Pool, 'query'> | null): Promise<DbLogStatus> {
  const fail = (status: DbLogStatus, detail: string) => {
    console.error(JSON.stringify({ outcome: `db_${status}`, detail, backfill: entry.lead, kind: entry.kind, lsqOutcome: entry.outcome }));
    return status;
  };

  let pool: Pick<Pool, 'query'> | null;
  try {
    pool = injected !== undefined ? injected : getPool();
  } catch (err) {
    return fail('config_invalid', err instanceof Error ? err.message : String(err));
  }
  if (!pool) {
    console.warn(JSON.stringify({ outcome: 'db_not_configured' }));
    return 'not_configured';
  }

  const insert = pool
    .query(INSERT_SQL, [
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
    ])
    .then(() => 'logged' as const)
    .catch((err: unknown) => fail('error', err instanceof Error ? err.message : String(err)));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<DbLogStatus>((resolve) => {
    timer = setTimeout(() => resolve(fail('timeout', `insert exceeded ${DB_BUDGET_MS}ms`)), DB_BUDGET_MS);
  });
  try {
    return await Promise.race([insert, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
