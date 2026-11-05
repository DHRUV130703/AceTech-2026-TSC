import { beforeEach, describe, expect, it, vi } from 'vitest';

const createLeadWithActivity = vi.fn();
const findLeadByPhone = vi.fn();
vi.mock('@/lib/leadsquared', () => ({
  createLeadWithActivity: (...a: unknown[]) => createLeadWithActivity(...a),
  findLeadByPhone: (...a: unknown[]) => findLeadByPhone(...a),
  readConfig: () => ({ host: 'h', accessKey: 'a', secretKey: 's', activityEvent: 231 }),
  fingerprint: async (v: string) => ({ len: v.length }),
}));

const { POST } = await import('./route');

let ipCounter = 0;
const req = (body: unknown) =>
  new Request('http://localhost/api/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.0.0.${++ipCounter}` },
    body: JSON.stringify(body),
  });

const valid = { name: 'Priya Sharma', phone: '9876543210', organisation: 'Studio Co' };

describe('POST /api/lead', () => {
  beforeEach(() => {
    createLeadWithActivity.mockReset();
    findLeadByPhone.mockReset().mockResolvedValue({ status: 'not_found' });
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('creates a new lead when phone is not in LSQ', async () => {
    createLeadWithActivity.mockResolvedValue({ ok: true, status: 200 });
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, existing: false });
    expect(findLeadByPhone).toHaveBeenCalledWith('9876543210');
    expect(createLeadWithActivity).toHaveBeenCalledWith(valid);
  });

  it('skips creating lead/activity when phone already exists', async () => {
    findLeadByPhone.mockResolvedValue({ status: 'found', prospectId: 'abc' });
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, existing: true });
    expect(createLeadWithActivity).not.toHaveBeenCalled();
  });

  it('falls through to create when the lookup fails', async () => {
    findLeadByPhone.mockResolvedValue({ status: 'unknown', detail: 'timeout' });
    createLeadWithActivity.mockResolvedValue({ ok: true, status: 200 });
    const res = await POST(req(valid));
    expect(await res.json()).toEqual({ ok: true, existing: false });
    expect(createLeadWithActivity).toHaveBeenCalledOnce();
  });

  it('returns 400 with field errors on invalid input', async () => {
    const res = await POST(req({ ...valid, phone: '123' }));
    expect(res.status).toBe(400);
    expect((await res.json()).fields.phone).toBeTruthy();
    expect(createLeadWithActivity).not.toHaveBeenCalled();
  });

  it('returns 502 and logs lead for backfill when LSQ fails', async () => {
    createLeadWithActivity.mockResolvedValue({ ok: false, status: 500, detail: 'boom' });
    const res = await POST(req(valid));
    expect(res.status).toBe(502);
    const logged = JSON.parse((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(logged.backfill).toEqual(valid);
  });

  it('silently accepts honeypot submissions without calling LSQ', async () => {
    const res = await POST(req({ ...valid, website: 'spam.com' }));
    expect(res.status).toBe(200);
    expect(createLeadWithActivity).not.toHaveBeenCalled();
  });

  it('returns 400 on malformed JSON', async () => {
    const res = await POST(new Request('http://localhost/api/lead', { method: 'POST', body: '{nope' }));
    expect(res.status).toBe(400);
  });
});
