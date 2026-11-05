import { describe, expect, it } from 'vitest';
import { leadSchema, maskPhone, normalisePhone } from './lead-schema';

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
  const ok = { name: '  Priya   Sharma ', phone: '+91 98765 43210', organisation: ' Studio  Co ' };

  it('normalises valid input', () => {
    expect(leadSchema.parse(ok)).toEqual({ name: 'Priya Sharma', phone: '9876543210', organisation: 'Studio Co' });
  });

  it('accepts names with dots, apostrophes and hyphens', () => {
    expect(leadSchema.safeParse({ ...ok, name: "D'Souza-Rao J." }).success).toBe(true);
  });

  it.each(['12345', '5876543210', '98765432101', 'abcdefghij', ''])('rejects phone %s', (phone) => {
    expect(leadSchema.safeParse({ ...ok, phone }).success).toBe(false);
  });

  it.each(['', 'A', '123 Name', 'x'.repeat(61)])('rejects name %j', (name) => {
    expect(leadSchema.safeParse({ ...ok, name }).success).toBe(false);
  });

  it.each(['', ' ', 'A', 'x'.repeat(101)])('rejects organisation %j', (organisation) => {
    expect(leadSchema.safeParse({ ...ok, organisation }).success).toBe(false);
  });
});

it('masks phone for logs', () => {
  expect(maskPhone('9876543210')).toBe('98XXXXXX10');
});
