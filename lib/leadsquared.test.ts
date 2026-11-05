import { describe, expect, it, vi } from 'vitest';
import { buildPayload, createLeadWithActivity, formatUtc, redact } from './leadsquared';

const lead = { name: 'Priya Sharma', phone: '9876543210', organisation: 'Studio Co' };
const config = { host: 'api.test', accessKey: 'AK$1', secretKey: 'SK', activityEvent: 231 };
const now = new Date('2026-11-05T04:30:05.123Z');

describe('buildPayload', () => {
  it('matches the LeadSquared CreateCustom shape exactly', () => {
    expect(buildPayload(lead, { activityEvent: 231, now })).toEqual({
      LeadDetails: [
        { Attribute: 'FirstName', Value: 'Priya Sharma' },
        { Attribute: 'Phone', Value: '9876543210' },
      ],
      Activity: {
        ActivityEvent: 231,
        ActivityNote: 'Lead captured at AceTech 2026 via QR',
        ActivityDateTime: '2026-11-05 04:30:05',
        Fields: [
          { SchemaName: 'ActivityEvent_Note', Value: 'Lead captured at AceTech 2026 via QR' },
          { SchemaName: 'mx_Custom_6', Value: 'Studio Co' },
        ],
      },
    });
  });

  it('formats UTC datetime', () => expect(formatUtc(now)).toBe('2026-11-05 04:30:05'));
});

describe('createLeadWithActivity', () => {
  const res = (status: number, body = '{}') => new Response(body, { status });

  it('posts to CreateCustom with url-encoded keys', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, '{"Status":"Success"}'));
    const r = await createLeadWithActivity(lead, { config, now, fetchImpl });
    expect(r.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.test/v2/ProspectActivity.svc/CreateCustom?accessKey=AK%241&secretKey=SK');
  });

  it('retries once on 5xx then succeeds', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200));
    expect((await createLeadWithActivity(lead, { config, now, fetchImpl })).ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries once on network error / timeout', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('timeout'));
    const r = await createLeadWithActivity(lead, { config, now, fetchImpl });
    expect(r.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 4xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(400, '{"Status":"Error"}'));
    const r = await createLeadWithActivity(lead, { config, now, fetchImpl });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('treats 200 with Status=Error as failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, '{"Status":"Error","ExceptionMessage":"x"}'));
    expect((await createLeadWithActivity(lead, { config, now, fetchImpl })).ok).toBe(false);
  });
});

it('redacts credentials', () => {
  expect(redact('https://x?accessKey=abc&secretKey=def')).toBe('https://x?accessKey=REDACTED&secretKey=REDACTED');
});
