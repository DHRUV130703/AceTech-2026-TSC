import 'server-only';
import type { Lead } from './lead-schema';

export const ACTIVITY_NOTE = 'Lead captured at AceTech 2026 via QR';

/** LeadSquared API datetimes are UTC, formatted `yyyy-MM-dd HH:mm:ss`. */
export function formatUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export function buildPayload(lead: Lead, opts: { activityEvent: number; now: Date }) {
  return {
    LeadDetails: [
      { Attribute: 'FirstName', Value: lead.name },
      { Attribute: 'Phone', Value: lead.phone },
    ],
    Activity: {
      ActivityEvent: opts.activityEvent,
      ActivityNote: ACTIVITY_NOTE,
      ActivityDateTime: formatUtc(opts.now),
      Fields: [
        { SchemaName: 'ActivityEvent_Note', Value: ACTIVITY_NOTE },
        { SchemaName: 'mx_Custom_6', Value: lead.organisation },
      ],
    },
  };
}

export type LsqResult = { ok: true; status: number } | { ok: false; status: number | null; detail: string };

type Config = { host: string; accessKey: string; secretKey: string; activityEvent: number };

/**
 * Normalises a credential pasted into a dashboard: trims whitespace/quotes and
 * decodes URL-encoding (keys copied from a cURL URL arrive as `u%24…` instead of `u$…`).
 */
export function cleanCredential(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  let v = raw.trim().replace(/^['"]|['"]$/g, '').trim();
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
  const activityEvent = Number(env.LSQ_ACTIVITY_EVENT ?? 231);
  return { host, accessKey, secretKey, activityEvent: Number.isFinite(activityEvent) ? activityEvent : 231 };
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

/** POSTs to LSQ CreateCustom. One retry on network error / 5xx; never on 4xx. */
export async function createLeadWithActivity(
  lead: Lead,
  { config = readConfig(), now = new Date(), fetchImpl = fetch }: { config?: Config; now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<LsqResult> {
  const url =
    `https://${config.host}/v2/ProspectActivity.svc/CreateCustom` +
    `?accessKey=${encodeURIComponent(config.accessKey)}&secretKey=${encodeURIComponent(config.secretKey)}`;
  const body = JSON.stringify(buildPayload(lead, { activityEvent: config.activityEvent, now }));

  const first = await attempt(url, body, fetchImpl);
  if (first.ok) return first;
  const retryable = first.status === null || first.status >= 500;
  if (!retryable) return first;
  return attempt(url, body, fetchImpl);
}
