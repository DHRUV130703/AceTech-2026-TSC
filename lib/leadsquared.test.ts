import { describe, expect, it, vi } from 'vitest';
import { buildPayload, cleanCredential, createLeadWithActivity, findLeadByPhone, formatUtc, readConfig, redact } from './leadsquared';

const lead = { name: 'Priya Sharma', phone: '9876543210', organisation: 'Studio Co' };
const config = { host: 'api.test', accessKey: 'AK$1', secretKey: 'SK', activityEvent: 231 };
const now = new Date('2026-11-05T04:30:05.123Z');

describe('buildPayload', () => {
  it('matches the LeadSquared CreateCustom shape exactly', () => {
    expect(buildPayload(lead, { activityEvent: 231, now })).toEqual({
      LeadDetails: [
        { Attribute: 'FirstName', Value: 'Priya Sharma' },
        { Attribute: 'Source', Value: 'AceTech 2026 QR' },
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

  it('builds the repeat-visit activity for existing leads (no Source overwrite)', () => {
    expect(buildPayload(lead, { kind: 'existing', activityEvent: 232, now })).toEqual({
      LeadDetails: [
        { Attribute: 'FirstName', Value: 'Priya Sharma' },
        { Attribute: 'Phone', Value: '9876543210' },
      ],
      Activity: {
        ActivityEvent: 232,
        ActivityNote: 'Existing lead visited AceTech 2026 booth (QR)',
        ActivityDateTime: '2026-11-05 04:30:05',
        Fields: [
          { SchemaName: 'ActivityEvent_Note', Value: 'Existing lead visited AceTech 2026 booth (QR)' },
          { SchemaName: 'mx_Custom_32', Value: 'End Client' },
          { SchemaName: 'mx_Custom_29', Value: 'Yes' },
          { SchemaName: 'mx_Custom_13', Value: 'Mattress' },
          { SchemaName: 'mx_Custom_1', Value: 'AceTech Event' },
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

  it('uses activity 232 (default) for existing leads, 231 for new', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200));
    await createLeadWithActivity(lead, { kind: 'existing', config, now, fetchImpl });
    await createLeadWithActivity(lead, { kind: 'new', config, now, fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).Activity.ActivityEvent).toBe(232);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).Activity.ActivityEvent).toBe(231);
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

describe('findLeadByPhone', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it('calls RetrieveLeadByPhoneNumber with header auth (no keys in URL)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json([]));
    await findLeadByPhone('9876543210', { config, fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.test/v2/LeadManagement.svc/RetrieveLeadByPhoneNumber?phone=9876543210');
    expect(url).not.toMatch(/Key/);
    expect(init.headers).toEqual({ 'x-LSQ-AccessKey': 'AK$1', 'x-LSQ-SecretKey': 'SK' });
  });

  it('found when a returned lead matches on last 10 digits', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json([{ ProspectID: 'p1', Phone: '+91-9876543210' }]));
    expect(await findLeadByPhone('9876543210', { config, fetchImpl })).toEqual({ status: 'found', prospectId: 'p1' });
  });

  it('not_found on empty array or non-matching phone', async () => {
    expect(await findLeadByPhone('9876543210', { config, fetchImpl: vi.fn().mockResolvedValue(json([])) })).toEqual({ status: 'not_found' });
    const other = vi.fn().mockResolvedValue(json([{ Phone: '+91-9876543211' }]));
    expect(await findLeadByPhone('9876543210', { config, fetchImpl: other })).toEqual({ status: 'not_found' });
  });

  it('unknown on HTTP error, bad JSON or network failure', async () => {
    expect((await findLeadByPhone('9876543210', { config, fetchImpl: vi.fn().mockResolvedValue(json({}, 500)) })).status).toBe('unknown');
    expect((await findLeadByPhone('9876543210', { config, fetchImpl: vi.fn().mockResolvedValue(new Response('<html>')) })).status).toBe('unknown');
    expect((await findLeadByPhone('9876543210', { config, fetchImpl: vi.fn().mockRejectedValue(new Error('x')) })).status).toBe('unknown');
  });
});

describe('readConfig', () => {
  it('decodes URL-encoded keys and trims quotes/whitespace/host scheme', () => {
    const c = readConfig({ LSQ_HOST: ' https://api.test/ ', LSQ_ACCESS_KEY: ' "u%24abc" ', LSQ_SECRET_KEY: 'sk\n' } as unknown as NodeJS.ProcessEnv);
    expect(c).toMatchObject({ host: 'api.test', accessKey: 'u$abc', secretKey: 'sk', activityEvent: 231, existingActivityEvent: 232 });
  });

  it('strips dotenv backslash escaping before $', () => {
    expect(cleanCredential('u\\$abc')).toBe('u$abc');
  });

  it('leaves plain keys untouched', () => {
    expect(cleanCredential('u$abc')).toBe('u$abc');
  });
});

it('redacts credentials', () => {
  expect(redact('https://x?accessKey=abc&secretKey=def')).toBe('https://x?accessKey=REDACTED&secretKey=REDACTED');
});
