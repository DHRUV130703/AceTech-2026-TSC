import { NextResponse } from 'next/server';
import { leadSchema, fieldErrors, maskPhone, type Lead } from '@/lib/lead-schema';
import {
  activityEventFor as eventFor,
  createLeadWithActivity,
  findLeadByPhone,
  fingerprint,
  readConfig,
  type LeadKind,
  type LookupResult,
} from '@/lib/leadsquared';
import { logLeadToDb } from '@/lib/lead-log';
import { rateLimit } from '@/lib/rate-limit';

function activityEventFor(lead: Lead, kind: LeadKind): number | undefined {
  try {
    return eventFor(lead, kind, readConfig());
  } catch {
    return undefined;
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimit(ip)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'validation', fields: {} }, { status: 400 });
  }

  // Honeypot: real users never see or fill this field.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    console.info(JSON.stringify({ ts: new Date().toISOString(), outcome: 'honeypot' }));
    return NextResponse.json({ ok: true });
  }

  const parsed = leadSchema.safeParse({
    name: str(body.name),
    phone: str(body.phone),
    organisation: str(body.organisation),
    source: str(body.source),
    city: str(body.city),
    remarks: str(body.remarks), // Postgres only — buildPayload() never reads it
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'validation', fields: fieldErrors(parsed.error) }, { status: 400 });
  }

  const lead = parsed.data;

  // 1. Does this phone already exist in LSQ?
  //    If the lookup itself fails, treat as new — never lose a lead.
  let lookup: LookupResult;
  try {
    lookup = await findLeadByPhone(lead.phone);
  } catch (err) {
    lookup = { status: 'unknown', detail: err instanceof Error ? err.message : 'config error' };
  }
  if (lookup.status === 'unknown') {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), phoneMasked: maskPhone(lead.phone), outcome: 'lookup_failed', detail: lookup.detail }));
  }
  const kind: LeadKind = lookup.status === 'found' ? 'existing' : 'new';

  // 2. existing (any source) or End Client → activity 232; new Others/Architect/ID → activity 231.
  //    See activityTypeFor() in lib/leadsquared.ts.
  let result;
  try {
    result = await createLeadWithActivity(lead, { kind });
  } catch (err) {
    result = { ok: false as const, status: null, detail: err instanceof Error ? err.message : 'config error' };
  }

  const prospectId = lookup.status === 'found' ? lookup.prospectId : undefined;
  const outcome = result.ok ? (kind === 'new' ? 'created' : 'activity_logged') : 'failed';

  // 3. Secondary record in Postgres. Awaited (capped at 3s, never throws) so the row is
  //    guaranteed written before we answer; status exposed as `x-lead-db` for verification.
  const db = await logLeadToDb({
    lead,
    kind,
    outcome,
    lsqStatus: result.status,
    prospectId,
    activityEvent: activityEventFor(lead, kind),
    error: result.ok ? undefined : result.detail,
    userAgent: req.headers.get('user-agent'),
  });
  const headers = { 'x-lead-db': db };

  const base = {
    ts: new Date().toISOString(),
    kind,
    phoneMasked: maskPhone(lead.phone),
    source: lead.source,
    prospectId,
    lsqStatus: result.status,
  };
  if (result.ok) {
    console.info(JSON.stringify({ ...base, outcome, db }));
    return NextResponse.json({ ok: true, existing: kind === 'existing' }, { headers });
  }

  // On auth failure, log non-reversible key fingerprints to diagnose misconfigured env vars.
  let creds: unknown;
  if (result.status === 401) {
    try {
      const c = readConfig();
      creds = { host: c.host, accessKey: await fingerprint(c.accessKey), secretKey: await fingerprint(c.secretKey) };
    } catch {
      creds = 'missing';
    }
  }

  // Full lead logged ONLY on failure so it can be backfilled manually into LSQ.
  console.error(JSON.stringify({ ...base, outcome: 'upstream_failed', detail: result.detail, creds, db, backfill: lead }));
  return NextResponse.json({ ok: false, error: 'upstream' }, { status: 502, headers });
}
