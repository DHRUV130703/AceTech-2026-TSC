import { z } from 'zod';

/** Collapse runs of whitespace and trim. */
export const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Strip separators and an Indian country/trunk prefix: "+91 98765-43210" → "9876543210". */
export function normalisePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

export const leadSchema = z.object({
  name: z
    .string()
    .transform(collapse)
    .pipe(
      z
        .string()
        .min(2, 'Please enter your full name.')
        .max(60, 'Name is too long.')
        .regex(/^[\p{L}][\p{L} .'-]*$/u, 'Please use letters only.'),
    ),
  phone: z
    .string()
    .transform(normalisePhone)
    .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit mobile number.')),
  organisation: z
    .string()
    .transform(collapse)
    .pipe(
      z
        .string()
        .min(2, 'Please enter your organisation name.')
        .max(100, 'Organisation name is too long.'),
    ),
});

export type LeadInput = z.input<typeof leadSchema>;
export type Lead = z.output<typeof leadSchema>;
export type LeadField = keyof LeadInput;

/** Flatten zod issues to `{ field: firstMessage }`. */
export function fieldErrors(error: z.ZodError): Partial<Record<LeadField, string>> {
  const out: Partial<Record<LeadField, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as LeadField;
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** "9876543210" → "98XXXXXX10" for logs. */
export const maskPhone = (p: string) => (p.length >= 4 ? `${p.slice(0, 2)}${'X'.repeat(p.length - 4)}${p.slice(-2)}` : 'XXXX');
