import { NextResponse } from 'next/server';
import { leadSchema, fieldErrors, maskPhone } from '@/lib/lead-schema';
import { createLeadWithActivity, fingerprint, readConfig } from '@/lib/leadsquared';
import { rateLimit } from '@/lib/rate-limit';

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
    name: String(body.name ?? ''),
    phone: String(body.phone ?? ''),
    organisation: String(body.organisation ?? ''),
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'validation', fields: fieldErrors(parsed.error) }, { status: 400 });
  }

  const lead = parsed.data;
  let result;
  try {
    result = await createLeadWithActivity(lead);
  } catch (err) {
    result = { ok: false as const, status: null, detail: err instanceof Error ? err.message : 'config error' };
  }

  const base = { ts: new Date().toISOString(), phoneMasked: maskPhone(lead.phone), organisation: lead.organisation, lsqStatus: result.status };
  if (result.ok) {
    console.info(JSON.stringify({ ...base, outcome: 'created' }));
    return NextResponse.json({ ok: true });
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
  console.error(JSON.stringify({ ...base, outcome: 'upstream_failed', detail: result.detail, creds, backfill: lead }));
  return NextResponse.json({ ok: false, error: 'upstream' }, { status: 502 });
}
