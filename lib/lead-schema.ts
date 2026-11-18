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

/**
 * Visitor type. Values must match the LSQ dropdown `mx_Custom_32` EXACTLY
 * (also sent as `mx_Custom_14` on activity 231). Order = order shown in the form.
 */
export const SOURCES = ['End Client', 'Others', 'Architect', 'Interior Designer'] as const;
export type Source = (typeof SOURCES)[number];

/** Optional free-text field: collapse whitespace and cap length — never fails validation. */
const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => collapse(v ?? '').slice(0, max));

/**
 * Only phone and source are mandatory. The UI shows NO error text (team decision) —
 * invalid fields just get a red outline — so messages here are for screen readers/logs only.
 */
export const leadSchema = z.object({
  name: optionalText(60),
  phone: z
    .string()
    .transform(normalisePhone)
    .pipe(z.string().regex(/^\d{10}$/, 'Phone number must be 10 digits.')),
  organisation: optionalText(100),
  source: z.enum(SOURCES, { error: 'Please select a source.' }),
  city: optionalText(60),
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
