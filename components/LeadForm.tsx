'use client';

import { useEffect, useRef, useState } from 'react';
import { leadSchema, fieldErrors, type LeadField, type LeadInput } from '@/lib/lead-schema';

type Status = 'idle' | 'submitting' | 'success' | 'existing';

const COPY = {
  success: {
    heading: 'Thank you for visiting us at The Sleep Company – AceTech Event 2026',
    body: ['Our team will get in touch with you shortly.'],
  },
  existing: {
    heading: (first: string) => `Welcome back${first ? `, ${first}` : ''}!`,
    body: [
      "Looks like you're already part of The Sleep Company family — we have your details with us.",
      'Thank you for stopping by at AceTech 2026. Our team will reach out to you shortly.',
    ],
  },
} as const;

const firstName = (name: string) => {
  const f = name.trim().split(/\s+/)[0] ?? '';
  return f ? f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() : '';
};
type Errors = Partial<Record<LeadField, string>>;

const FIELDS: {
  key: LeadField;
  label: string;
  type: string;
  autoComplete: string;
  inputMode?: 'numeric' | 'text';
  placeholder: string;
  enterKeyHint: 'next' | 'done';
  autoCapitalize: 'words' | 'off';
}[] = [
  { key: 'name', label: 'Full Name', type: 'text', autoComplete: 'name', placeholder: 'e.g. Priya Sharma', enterKeyHint: 'next', autoCapitalize: 'words' },
  { key: 'phone', label: 'Phone Number', type: 'tel', autoComplete: 'tel-national', inputMode: 'numeric', placeholder: '10-digit mobile', enterKeyHint: 'next', autoCapitalize: 'off' },
  { key: 'organisation', label: 'Organisation / Firm', type: 'text', autoComplete: 'organization', placeholder: 'e.g. Studio Design Co.', enterKeyHint: 'done', autoCapitalize: 'words' },
];

export function LeadForm() {
  const [values, setValues] = useState<LeadInput>({ name: '', phone: '', organisation: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const inputs = useRef<Partial<Record<LeadField, HTMLInputElement | null>>>({});
  const honeypot = useRef<HTMLInputElement>(null);
  const thanksHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (status === 'success' || status === 'existing') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      thanksHeading.current?.focus({ preventScroll: true });
    }
  }, [status]);

  function validateField(key: LeadField) {
    const result = leadSchema.shape[key].safeParse(values[key]);
    setErrors((e) => ({ ...e, [key]: result.success ? undefined : result.error.issues[0]?.message }));
  }

  function focusFirstError(errs: Errors) {
    const first = FIELDS.find((f) => errs[f.key]);
    if (first) inputs.current[first.key]?.focus();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'submitting') return;
    setFormError(null);

    const parsed = leadSchema.safeParse(values);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(errs);
      focusFirstError(errs);
      return;
    }

    setStatus('submitting');
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, website: honeypot.current?.value ?? '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setStatus(data.existing ? 'existing' : 'success');
        return;
      }
      setStatus('idle');
      if (data.error === 'validation' && data.fields) {
        setErrors(data.fields);
        focusFirstError(data.fields);
      } else if (res.status === 429) {
        setFormError('Too many attempts. Please wait a minute and try again.');
      } else {
        setFormError("We couldn't save your details. Please tap Submit again, or share them with our team at the booth.");
      }
    } catch {
      setStatus('idle');
      setFormError("Couldn't submit — check your connection and tap Submit again.");
    }
  }

  if (status === 'success' || status === 'existing') {
    const existing = status === 'existing';
    const heading = existing ? COPY.existing.heading(firstName(values.name)) : COPY.success.heading;
    const body = existing ? COPY.existing.body : COPY.success.body;
    return (
      <section className="animate-pop-in rounded-2xl bg-white px-5 py-7 text-center shadow-[0_12px_36px_rgb(31_42_76/0.14)] sm:px-7">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${existing ? 'bg-aqua-200/60' : 'bg-success/10'}`}>
          {existing ? (
            <svg viewBox="0 0 24 24" className="h-8 w-8 text-navy-900" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10z" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-9 w-9 text-success" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <h1 ref={thanksHeading} tabIndex={-1} className="mt-5 text-[22px] leading-snug font-extrabold text-balance outline-none">
          {heading}
        </h1>
        {body.map((line) => (
          <p key={line} className="mt-3 text-base text-pretty text-navy-800">
            {line}
          </p>
        ))}

        <div className="mt-6 rounded-xl bg-aqua-50 p-4 text-left text-sm">
          <p className="font-semibold">Need help sooner? Talk to our Sleep Expert</p>
          <ul className="mt-2 space-y-1.5">
            <li>
              📞{' '}
              <a className="font-semibold underline underline-offset-2" href="tel:+919811981911">
                +91 98119 81911
              </a>
            </li>
            <li>
              ✉️{' '}
              <a className="font-semibold underline underline-offset-2" href="mailto:care@thesleepcompany.in">
                care@thesleepcompany.in
              </a>
            </li>
          </ul>
        </div>

        <a
          href="https://thesleepcompany.in/"
          className="mt-6 flex h-12 w-full items-center justify-center rounded-xl border-2 border-navy-900 text-base font-bold text-navy-900 transition-colors hover:bg-navy-900 hover:text-white"
        >
          Visit thesleepcompany.in
        </a>
      </section>
    );
  }

  const submitting = status === 'submitting';

  return (
    <>
      <div className="text-center">
        <p className="inline-block rounded-full bg-navy-900 px-3.5 py-1 text-[11px] font-bold tracking-[0.25em] text-white uppercase">
          AceTech 2026
        </p>
        <h1 className="mt-4 text-[22px] leading-tight font-extrabold tracking-wide uppercase min-[360px]:text-[26px]">
          Welcome to
          <br />
          The Sleep Company
        </h1>
        <p className="mx-auto mt-2.5 max-w-[34ch] text-base text-navy-800">
          Share your details and our Sleep Experts will connect with you.
        </p>
      </div>

      <form
        noValidate
        onSubmit={onSubmit}
        className="mt-7 rounded-2xl bg-white p-5 shadow-[0_12px_36px_rgb(31_42_76/0.14)] min-[360px]:p-6"
        aria-describedby={formError ? 'form-error' : undefined}
      >
        {FIELDS.map((f) => {
          const err = errors[f.key];
          const id = `field-${f.key}`;
          return (
            <div key={f.key} className="mb-5">
              <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
                {f.label}
              </label>
              <div
                className={`flex h-12 items-center overflow-hidden rounded-xl border-2 bg-aqua-50 transition-colors focus-within:border-navy-900 focus-within:bg-white ${
                  err ? 'border-error' : 'border-transparent'
                }`}
              >
                {f.key === 'phone' && (
                  <span className="pl-4 text-base font-semibold text-navy-800" aria-hidden="true">
                    +91
                  </span>
                )}
                <input
                  ref={(el) => {
                    inputs.current[f.key] = el;
                  }}
                  id={id}
                  name={f.key}
                  type={f.type}
                  inputMode={f.inputMode}
                  autoComplete={f.autoComplete}
                  autoCapitalize={f.autoCapitalize}
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint={f.enterKeyHint}
                  onKeyDown={(e) => {
                    // "Next" on the mobile keyboard moves to the following field instead of submitting.
                    if (e.key === 'Enter' && f.enterKeyHint === 'next') {
                      e.preventDefault();
                      const i = FIELDS.findIndex((x) => x.key === f.key);
                      inputs.current[FIELDS[i + 1].key]?.focus();
                    }
                  }}
                  placeholder={f.placeholder}
                  maxLength={f.key === 'phone' ? 15 : f.key === 'name' ? 60 : 100}
                  value={values[f.key]}
                  onChange={(e) => {
                    const v = e.target.value;
                    setValues((s) => ({ ...s, [f.key]: v }));
                    if (err) setErrors((x) => ({ ...x, [f.key]: undefined }));
                  }}
                  onBlur={() => values[f.key] && validateField(f.key)}
                  aria-invalid={!!err}
                  aria-describedby={err ? `${id}-error` : undefined}
                  required
                  className="h-full w-full bg-transparent px-4 text-base text-navy-900 outline-none placeholder:text-navy-800/40"
                />
              </div>
              <p id={`${id}-error`} aria-live="polite" className="mt-1.5 min-h-0 text-sm font-medium text-error">
                {err}
              </p>
            </div>
          );
        })}

        {/* Honeypot — hidden from humans and assistive tech. */}
        <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input ref={honeypot} id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        {formError && (
          <p id="form-error" role="alert" className="mb-4 rounded-lg bg-error/10 px-3 py-2.5 text-sm font-medium text-error">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-navy-900 text-base font-bold tracking-wide text-white transition-colors hover:bg-navy-800 disabled:opacity-80"
        >
          {submitting && (
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          {submitting ? 'Submitting…' : 'Submit'}
        </button>

        <p className="mt-3.5 text-center text-xs text-navy-800/80">
          By submitting, you agree to be contacted by The Sleep Company.
        </p>
      </form>
    </>
  );
}
