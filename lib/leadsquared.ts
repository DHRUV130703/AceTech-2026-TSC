import 'server-only';
import type { Lead } from './lead-schema';

export const ACTIVITY_NOTE = 'Lead captured at AceTech 2026 via QR';
export const EXISTING_ACTIVITY_NOTE = 'Existing lead visited AceTech 2026 booth (QR)';
export const LEAD_SOURCE = 'AceTech 2026 QR';

/** Fixed activity fields for a repeat visitor (activity 232), as configured by the LSQ admin. */
export const EXISTING_ACTIVITY_FIELDS = [
  { SchemaName: 'mx_Custom_32', Value: 'End Client' },
  { SchemaName: 'mx_Custom_29', Value: 'Yes' },
  { SchemaName: 'mx_Custom_13', Value: 'Mattress' },
  { SchemaName: 'mx_Custom_1', Value: 'AceTech Event' },
] as const;

export type LeadKind = 'new' | 'existing';

/** LeadSquared API datetimes are UTC, formatted `yyyy-MM-dd HH:mm:ss`. */
export function formatUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * new      → lead (FirstName, Source, Phone) + activity `activityEvent` (231) with Firm Name.
 * existing → lead match (FirstName, Phone; Source NOT overwritten) + activity `activityEvent` (232)
 *            with the fixed repeat-visit fields.
 */
export function buildPayload(lead: Lead, opts: { kind?: LeadKind; activityEvent: number; now: Date }) {
  const kind = opts.kind ?? 'new';
  const note = kind === 'new' ? ACTIVITY_NOTE : EXISTING_ACTIVITY_NOTE;
  return {
    LeadDetails:
      kind === 'new'
        ? [
            { Attribute: 'FirstName', Value: lead.name },
            { Attribute: 'Source', Value: LEAD_SOURCE },
            { Attribute: 'Phone', Value: lead.phone },
          ]
        : [
            { Attribute: 'FirstName', Value: lead.name },
            { Attribute: 'Phone', Value: lead.phone },
          ],
    Activity: {
      ActivityEvent: opts.activityEvent,
      ActivityNote: note,
      ActivityDateTime: formatUtc(opts.now),
      Fields: [
        { SchemaName: 'ActivityEvent_Note', Value: note },
        ...(kind === 'new' ? [{ SchemaName: 'mx_Custom_6', Value: lead.organisation }] : EXISTING_ACTIVITY_FIELDS.map((f) => ({ ...f }))),
      ],
    },
  };
}

export type LsqResult = { ok: true; status: number } | { ok: false; status: number | null; detail: string };

type Config = { host: string; accessKey: string; secretKey: string; activityEvent: number; existingActivityEvent?: number };

/**
 * Normalises a credential pasted into a dashboard: trims whitespace/quotes and
 * decodes URL-encoding (keys copied from a cURL URL arrive as `u%24…` instead of `u$…`).
 */
export function cleanCredential(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  // `\$` comes from copying a dotenv-escaped value (.env.local) into a dashboard.
  let v = raw.trim().replace(/^['"]|['"]$/g, '').trim().replace(/\\\$/g, '$');
  if (/%[0-9A-Fa-f]{2}/.test(v)) {
    try {
      v = decodeURIComponent(v);
    } catch {
      /* leave as-is */
    }
  }
  return v;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const host = cleanCredential(env.LSQ_HOST)?.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const accessKey = cleanCredential(env.LSQ_ACCESS_KEY);
  const secretKey = cleanCredential(env.LSQ_SECRET_KEY);
  if (!host || !accessKey || !secretKey) throw new Error('LeadSquared env vars are not configured');
  const num = (v: string | undefined, fallback: number) => {
    const n = Number(v ?? fallback);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    host,
    accessKey,
    secretKey,
    activityEvent: num(env.LSQ_ACTIVITY_EVENT, 231),
    existingActivityEvent: num(env.LSQ_EXISTING_ACTIVITY_EVENT, 232),
  };
}

/** Non-reversible fingerprint of a credential for diagnosing auth failures in logs. */
export async function fingerprint(v: string | undefined) {
  if (!v) return { len: 0 };
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { len: v.length, sha8: hex.slice(0, 8), hasDollar: v.includes('$'), hasPercent: v.includes('%'), hasSpace: /\s/.test(v) };
}

const TIMEOUT_MS = 10_000;

/** Removes credentials from any string before it is logged. */
export const redact = (s: string) => s.replace(/(accessKey|secretKey)=[^&\s"]+/gi, '$1=REDACTED');

async function attempt(url: string, body: string, fetchImpl: typeof fetch): Promise<LsqResult> {
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (res.ok) {
      // LSQ can return 200 with a Status: "Error" body.
      try {
        const json = JSON.parse(text);
        if (json?.Status && String(json.Status).toLowerCase() === 'error') {
          return { ok: false, status: res.status, detail: redact(text.slice(0, 500)) };
        }
      } catch {
        /* non-JSON 200 — treat as success */
      }
      return { ok: true, status: res.status };
    }
    return { ok: false, status: res.status, detail: redact(text.slice(0, 500)) };
  } catch (err) {
    return { ok: false, status: null, detail: redact(err instanceof Error ? err.message : String(err)) };
  }
}

export type LookupResult =
  | { status: 'found'; prospectId: string | null }
  | { status: 'not_found' }
  | { status: 'unknown'; detail: string }; // lookup failed — caller should fall through to create

const LOOKUP_TIMEOUT_MS = 5_000;

/**
 * Checks whether a lead with this phone already exists in LSQ.
 * Uses header auth (keys never in the URL). LSQ stores phones as "+91-XXXXXXXXXX",
 * so we match on the last 10 digits to guard against loose matching.
 */
export async function findLeadByPhone(
  phone: string,
  { config = readConfig(), fetchImpl = fetch }: { config?: Config; fetchImpl?: typeof fetch } = {},
): Promise<LookupResult> {
  const url = `https://${config.host}/v2/LeadManagement.svc/RetrieveLeadByPhoneNumber?phone=${encodeURIComponent(phone)}`;
  try {
    const res = await fetchImpl(url, {
      headers: { 'x-LSQ-AccessKey': config.accessKey, 'x-LSQ-SecretKey': config.secretKey },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) return { status: 'unknown', detail: `HTTP ${res.status}: ${redact(text.slice(0, 300))}` };
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return { status: 'unknown', detail: redact(text.slice(0, 300)) };
    const match = data.find((l: Record<string, unknown>) =>
      [l?.Phone, l?.Mobile].some((p) => typeof p === 'string' && p.replace(/\D/g, '').slice(-10) === phone),
    );
    return match ? { status: 'found', prospectId: (match.ProspectID as string) ?? null } : { status: 'not_found' };
  } catch (err) {
    return { status: 'unknown', detail: redact(err instanceof Error ? err.message : String(err)) };
  }
}

/**
 * POSTs to LSQ CreateCustom. One retry on network error / 5xx; never on 4xx.
 * kind 'new' → creates lead + activity 231; kind 'existing' → logs activity 232 on the existing lead.
 */
export async function createLeadWithActivity(
  lead: Lead,
  {
    kind = 'new',
    config = readConfig(),
    now = new Date(),
    fetchImpl = fetch,
  }: { kind?: LeadKind; config?: Config; now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<LsqResult> {
  const url =
    `https://${config.host}/v2/ProspectActivity.svc/CreateCustom` +
    `?accessKey=${encodeURIComponent(config.accessKey)}&secretKey=${encodeURIComponent(config.secretKey)}`;
  const activityEvent = kind === 'new' ? config.activityEvent : (config.existingActivityEvent ?? 232);
  const body = JSON.stringify(buildPayload(lead, { kind, activityEvent, now }));

  const first = await attempt(url, body, fetchImpl);
  if (first.ok) return first;
  const retryable = first.status === null || first.status >= 500;
  if (!retryable) return first;
  return attempt(url, body, fetchImpl);
}
