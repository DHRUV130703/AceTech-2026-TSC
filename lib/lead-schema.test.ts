import { describe, expect, it } from 'vitest';
import { leadSchema, maskPhone, normalisePhone, SOURCES } from './lead-schema';

describe('normalisePhone', () => {
  it.each([
    ['9876543210', '9876543210'],
    ['+91 98765 43210', '9876543210'],
    ['91-9876543210', '9876543210'],
    ['09876543210', '9876543210'],
    ['98765-43210', '9876543210'],
  ])('%s → %s', (input, out) => expect(normalisePhone(input)).toBe(out));
});

describe('leadSchema', () => {
  const ok = { name: '  Priya   Sharma ', phone: '+91 98765 43210', organisation: ' Studio  Co ', source: 'Architect', city: ' Navi  Mumbai ', remarks: ' Wants  hotel  mattresses ' };

  it('normalises valid input', () => {
    expect(leadSchema.parse(ok)).toEqual({ name: 'Priya Sharma', phone: '9876543210', organisation: 'Studio Co', source: 'Architect', city: 'Navi Mumbai', remarks: 'Wants hotel mattresses' });
  });

  it('only phone and source are required', () => {
    expect(leadSchema.parse({ phone: '9876543210', source: 'End Client' })).toEqual({
      name: '',
      phone: '9876543210',
      organisation: '',
      source: 'End Client',
      city: '',
      remarks: '',
    });
  });

  it('source values match the LSQ mx_Custom_32 dropdown exactly', () => {
    expect(SOURCES).toEqual(['End Client', 'Others', 'Architect', 'Interior Designer']);
  });

  it.each(['1234567890', '0000000000', '5876543210'])('accepts any 10-digit phone %s', (phone) => {
    expect(leadSchema.safeParse({ ...ok, phone }).success).toBe(true);
  });

  it.each(['12345', '98765432101', 'abcdefghij', ''])('rejects phone %j (not 10 digits)', (phone) => {
    expect(leadSchema.safeParse({ ...ok, phone }).success).toBe(false);
  });

  it.each(['', 'end client', 'Builder', undefined])('rejects source %j', (source) => {
    expect(leadSchema.safeParse({ ...ok, source }).success).toBe(false);
  });

  it('never fails on optional fields — trims and caps length instead', () => {
    const r = leadSchema.parse({ ...ok, name: '123 !!', organisation: 'x'.repeat(150), city: 'y'.repeat(80), remarks: 'z'.repeat(600) });
    expect(r.name).toBe('123 !!');
    expect(r.organisation).toHaveLength(100);
    expect(r.city).toHaveLength(60);
    expect(r.remarks).toHaveLength(500);
  });
});

it('masks phone for logs', () => {
  expect(maskPhone('9876543210')).toBe('98XXXXXX10');
});
