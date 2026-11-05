import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

vi.mock('./db', () => ({ getPool: () => null }));
const { logLeadToDb, INSERT_SQL } = await import('./lead-log');
const { poolConfig } = await vi.importActual<typeof import('./db')>('./db');

const lead = { name: 'Priya Sharma', phone: '9876543210', organisation: 'Studio Co' };

describe('logLeadToDb', () => {
  it('inserts one parameterised row', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const query = vi.fn().mockResolvedValue({});
    const ok = await logLeadToDb(
      { lead, kind: 'existing', outcome: 'activity_logged', lsqStatus: 200, prospectId: 'p1', activityEvent: 232, userAgent: 'UA' },
      { query } as unknown as Pool,
    );
    expect(ok).toBe(true);
    expect(query).toHaveBeenCalledWith(INSERT_SQL, ['Priya Sharma', '9876543210', 'Studio Co', 'existing', 'activity_logged', 200, 'p1', 232, null, 'UA']);
  });

  it('never throws when the DB fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const query = vi.fn().mockRejectedValue(new Error('connection refused'));
    await expect(logLeadToDb({ lead, kind: 'new', outcome: 'created', lsqStatus: 200 }, { query } as unknown as Pool)).resolves.toBe(false);
  });

  it('is a no-op when DATABASE_URL is not configured', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(logLeadToDb({ lead, kind: 'new', outcome: 'created', lsqStatus: 200 })).resolves.toBe(false);
  });
});

describe('poolConfig', () => {
  const url = 'postgres://u:p@db.example.com:26214/defaultdb?sslmode=require';

  it('returns null without DATABASE_URL', () => {
    expect(poolConfig({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('strips sslmode, encrypts without verify when no CA, keeps pool small', () => {
    const c = poolConfig({ DATABASE_URL: url } as unknown as NodeJS.ProcessEnv)!;
    expect(c.connectionString).toBe('postgres://u:p@db.example.com:26214/defaultdb');
    expect(c.ssl).toEqual({ rejectUnauthorized: false });
    expect(c.max).toBeLessThanOrEqual(3);
  });

  it('verifies the server cert when DATABASE_CA_CERT is set', () => {
    const c = poolConfig({ DATABASE_URL: url, DATABASE_CA_CERT: 'line1\\nline2' } as unknown as NodeJS.ProcessEnv)!;
    expect(c.ssl).toEqual({ ca: 'line1\nline2', rejectUnauthorized: true });
  });
});
