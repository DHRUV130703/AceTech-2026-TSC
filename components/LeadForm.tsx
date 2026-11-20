'use client';

import { useEffect, useRef, useState } from 'react';
import { leadSchema, fieldErrors, normalisePhone, SOURCES, type LeadField } from '@/lib/lead-schema';

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

type Values = Record<LeadField, string>;

type FieldDef = {
  key: LeadField;
  label: string;
  required?: boolean;
  placeholder: string;
} & (
  | {
      kind: 'input';
      type: string;
      autoComplete: string;
      inputMode?: 'numeric' | 'text';
      autoCapitalize: 'words' | 'off';
      maxLength: number;
    }
  | { kind: 'select'; options: readonly string[] }
  | { kind: 'textarea'; maxLength: number }
);

/** Order shown in the form. Only phone and source are mandatory. */
const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Full Name', kind: 'input', type: 'text', autoComplete: 'name', placeholder: 'e.g. Priya Sharma', autoCapitalize: 'words', maxLength: 60 },
  { key: 'phone', label: 'Phone Number', required: true, kind: 'input', type: 'tel', autoComplete: 'tel-national', inputMode: 'numeric', placeholder: '10-digit mobile', autoCapitalize: 'off', maxLength: 20 /* raw paste like '+91 98765 43210'; cleanPhoneInput caps at 10 digits */ },
  { key: 'organisation', label: 'Firm / Organisation', kind: 'input', type: 'text', autoComplete: 'organization', placeholder: 'e.g. Studio Design Co.', autoCapitalize: 'words', maxLength: 100 },
  { key: 'source', label: 'Source', required: true, kind: 'select', options: SOURCES, placeholder: 'Select source' },
  { key: 'city', label: 'City', kind: 'input', type: 'text', autoComplete: 'address-level2', placeholder: 'e.g. Mumbai', autoCapitalize: 'words', maxLength: 60 },
  // Stored in Postgres only — never sent to LeadSquared.
  { key: 'remarks', label: 'Remarks', kind: 'textarea', placeholder: 'Anything you would like us to know', maxLength: 500 },
];

/** Keep the phone box to 10 digits; autofilled "+91 98765 43210" / "098…" are normalised first. */
const cleanPhoneInput = (raw: string) => {
  const digits = raw.replace(/\D/g, '');
  return (digits.length > 10 ? normalisePhone(digits) : digits).slice(0, 10);
};

export function LeadForm() {
  const [values, setValues] = useState<Values>({ name: '', phone: '', organisation: '', source: '', city: '', remarks: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const inputs = useRef<Partial<Record<LeadField, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>>>({});
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
          <p className="font-semibold">Need help sooner? Write to us</p>
          <p className="mt-2">
            ✉️{' '}
            <a className="font-semibold break-all underline underline-offset-2" href="mailto:connect@thesleepcompany.in">
              connect@thesleepcompany.in
            </a>
          </p>
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
        {FIELDS.map((f, i) => {
          const invalid = !!errors[f.key];
          const id = `field-${f.key}`;
          const shared = {
            id,
            name: f.key,
            value: values[f.key],
            required: f.required,
            'aria-required': f.required,
            'aria-invalid': invalid,
            // No visible error text (team decision): the red outline marks the field, and a
            // screen-reader-only hint explains it.
            'aria-describedby': invalid ? `${id}-hint` : undefined,
            onBlur: () => f.required && values[f.key] && validateField(f.key),
          };
          const setValue = (v: string) => {
            setValues((s) => ({ ...s, [f.key]: f.key === 'phone' ? cleanPhoneInput(v) : v }));
            if (invalid) setErrors((x) => ({ ...x, [f.key]: undefined }));
          };
          const isLast = i === FIELDS.length - 1;
          return (
            <div key={f.key} className="mb-5">
              <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
                {f.label}
                {f.required ? (
                  <span className="text-error" aria-hidden="true">
                    {' '}
                    *
                  </span>
                ) : (
                  <span className="font-normal text-navy-800/60"> (optional)</span>
                )}
              </label>
              <div
                className={`relative flex ${f.kind === 'textarea' ? 'items-stretch' : 'h-12 items-center'} overflow-hidden rounded-xl border-2 bg-aqua-50 transition-colors focus-within:bg-white ${
                  invalid ? 'border-error' : 'border-transparent focus-within:border-navy-900'
                }`}
              >
                {f.key === 'phone' && (
                  <span className="pl-4 text-base font-semibold text-navy-800" aria-hidden="true">
                    +91
                  </span>
                )}
                {f.kind === 'select' ? (
                  <>
                    <select
                      {...shared}
                      ref={(el) => {
                        inputs.current[f.key] = el;
                      }}
                      onChange={(e) => setValue(e.target.value)}
                      className={`h-full w-full appearance-none bg-transparent pr-10 pl-4 text-base outline-none ${
                        values[f.key] ? 'text-navy-900' : 'text-navy-800/40'
                      }`}
                    >
                      <option value="" disabled>
                        {f.placeholder}
                      </option>
                      {f.options.map((o) => (
                        <option key={o} value={o} className="text-navy-900">
                          {o}
                        </option>
                      ))}
                    </select>
                    <svg
                      viewBox="0 0 20 20"
                      className="pointer-events-none absolute right-4 h-5 w-5 text-navy-800"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </>
                ) : f.kind === 'textarea' ? (
                  <textarea
                    {...shared}
                    ref={(el) => {
                      inputs.current[f.key] = el;
                    }}
                    rows={3}
                    autoCapitalize="sentences"
                    placeholder={f.placeholder}
                    maxLength={f.maxLength}
                    onChange={(e) => setValue(e.target.value)}
                    className="block w-full resize-none bg-transparent px-4 py-3 text-base text-navy-900 outline-none placeholder:text-navy-800/40"
                  />
                ) : (
                  <input
                    {...shared}
                    ref={(el) => {
                      inputs.current[f.key] = el;
                    }}
                    type={f.type}
                    inputMode={f.inputMode}
                    autoComplete={f.autoComplete}
                    autoCapitalize={f.autoCapitalize}
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint={isLast ? 'done' : 'next'}
                    onKeyDown={(e) => {
                      // "Next" on the mobile keyboard moves to the following field instead of submitting.
                      if (e.key === 'Enter' && !isLast) {
                        e.preventDefault();
                        inputs.current[FIELDS[i + 1].key]?.focus();
                      }
                    }}
                    placeholder={f.placeholder}
                    maxLength={f.maxLength}
                    onChange={(e) => setValue(e.target.value)}
                    className="h-full w-full bg-transparent px-4 text-base text-navy-900 outline-none placeholder:text-navy-800/40"
                  />
                )}
              </div>
              {invalid && (
                <span id={`${id}-hint`} className="sr-only">
                  {errors[f.key]}
                </span>
              )}
            </div>
          );
        })}

        {/* Honeypot — hidden from humans and assistive tech. */}
        <div className="absolute left-[-9999px] h-px w-px overflow-hidden" aria-hidden="true">
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
