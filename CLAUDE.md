# CLAUDE.md — AceTech 2026 Lead Capture (The Sleep Company)

Read this file before you change anything in this repo. It is the source of truth for scope, design, and integration rules.

---

## 1. Product brief

**Context.** The Sleep Company (TSC) has a booth at **AceTech 2026**. Visitors (architects, interior designers, builders, hospitality and corporate buyers) scan a printed **QR code** at the booth. The QR opens a mobile landing page where they enter their details. Each submission creates a **lead + activity in LeadSquared**. The visitor then sees a thank-you screen.

**What "QR code scanner" means here.** The visitor scans with their phone's own camera app. **We do not build an in-app camera scanner.** We build:
1. The landing page the QR points to.
2. A script that generates the QR code for print (see §8).

**User flow (single page, two states):**

```
Scan QR ──▶ Landing / Form ──submit──▶ POST /api/lead
                  ▲                         │
                  │                         ▼
                  │            1. LSQ RetrieveLeadByPhoneNumber
                  │                ├─ found ──────▶ 2a. CreateCustom: activity 232 (repeat visit) ──▶ "Welcome back" state
                  │                ├─ not found ─┐
                  │                └─ lookup failed ─┤ (fail-open: never lose a lead)
                  │                                  ▼
                  │            2b. CreateCustom: new lead (+Source) + activity 231 ──▶ Thank-you state
                  └──── error (inline, form keeps input, retry) ◀── LSQ failure (either path)
```

**Existing-lead rule (in scope):** before writing anything, look the phone number up in LeadSquared.
- **Already exists:** don't create a new lead. Log the **repeat-visit activity (232)** on the existing lead and show the "Welcome back" state. Don't send `Source`, so the lead's original source is kept.
- **Not found:** create the lead with `Source = "AceTech 2026 QR"` and activity 231.
- **Lookup errors** (timeout or 5xx): treat the visitor as new, because a possible duplicate is better than a lost lead.

**Form fields (all required):**

| UI label            | Input                       | LeadSquared mapping                   |
|---------------------|-----------------------------|---------------------------------------|
| Full Name           | text, `autocomplete="name"` | `LeadDetails[].Attribute = FirstName` |
| Phone Number        | tel, `inputmode="numeric"`  | `LeadDetails[].Attribute = Phone`     |
| Organisation / Firm | text, `autocomplete="organization"` | `Activity.Fields[].SchemaName = mx_Custom_6` (shown as **"Firm Name"** in LSQ, type String) |

**Success copy (exact):**
> **Thank you for visiting us at The Sleep Company – AceTech Event 2026**

Below it, a short secondary line, e.g. "Our team will get in touch with you shortly."

**Existing-lead copy (phone already in LSQ), in `components/LeadForm.tsx` `COPY.existing`:**
> **Welcome back, {FirstName}!**
> Looks like you're already part of The Sleep Company family — we have your details with us.
> Thank you for stopping by at AceTech 2026. Our team will reach out to you shortly.

It uses a heart icon (navy on aqua) instead of the green check, and the same contact block. Also show the brochure contact details: Sleep Expert **+91 98119 81911**, **care@thesleepcompany.in**, and **thesleepcompany.in**.

**Success metrics.** Fewer than 20 seconds from scan to submit. Zero lost leads. At least 99% of submissions reach LSQ, with the rest recoverable from logs.

**Out of scope (v1):** admin dashboard, OTP verification, an in-app camera scanner, multiple languages.

---

## 2. Tech stack and defaults

- **Next.js (App Router) + TypeScript (strict)**, deployed on **Vercel** (Node.js runtime, Fluid Compute). Do **not** use `runtime = 'edge'`.
- **Tailwind CSS** for styling, with tokens from §4 in the Tailwind theme / CSS variables.
- **zod** for validation. Share one schema between client and server.
- Use `next/font` for fonts and `next/image` for images.
- No database in v1. LeadSquared is the system of record. Server logs are the fallback audit trail (§6).

Suggested structure:
```
app/
  page.tsx               # landing: form + thank-you state (client component for the form)
  layout.tsx             # fonts, metadata, theme
  api/lead/route.ts      # POST → validates → calls LeadSquared
lib/
  lead-schema.ts         # zod schema + normalisers (shared)
  leadsquared.ts         # buildPayload() + createLeadWithActivity()
public/brand/            # logo, grid pattern, og image
scripts/generate-qr.ts   # print-ready QR (SVG + PNG)
```

---

## 3. LeadSquared integration (server only)

**Step 1: duplicate check (`findLeadByPhone`)**
```
GET https://{LSQ_HOST}/v2/LeadManagement.svc/RetrieveLeadByPhoneNumber?phone={10-digit phone}
x-LSQ-AccessKey: {LSQ_ACCESS_KEY}
x-LSQ-SecretKey: {LSQ_SECRET_KEY}
```
- It returns a JSON **array**: `[]` means not found, otherwise lead objects with `ProspectID`, `Phone`, `Mobile`, and so on.
- LSQ stores phones as `+91-XXXXXXXXXX`, so we treat it as a match only when the last 10 digits of `Phone`/`Mobile` equal the input.
- Timeout is 5s. Any error returns `unknown`, which falls through to create (fail-open).
- It uses header auth, so the keys stay out of the URL.

**Step 2: write (`createLeadWithActivity(lead, { kind })`)**. Both paths use the same endpoint:
```
POST https://{LSQ_HOST}/v2/ProspectActivity.svc/CreateCustom?accessKey={LSQ_ACCESS_KEY}&secretKey={LSQ_SECRET_KEY}
Content-Type: application/json
```

**2b. New lead (`kind: 'new'`).** Build payloads only in `buildPayload()` in `lib/leadsquared.ts`:
```json
{
  "LeadDetails": [
    { "Attribute": "FirstName", "Value": "<name>" },
    { "Attribute": "Source",    "Value": "AceTech 2026 QR" },
    { "Attribute": "Phone",     "Value": "<10-digit phone>" }
  ],
  "Activity": {
    "ActivityEvent": 231,
    "ActivityNote": "Lead captured at AceTech 2026 via QR",
    "ActivityDateTime": "<UTC now, yyyy-MM-dd HH:mm:ss>",
    "Fields": [
      { "SchemaName": "ActivityEvent_Note", "Value": "Lead captured at AceTech 2026 via QR" },
      { "SchemaName": "mx_Custom_6",        "Value": "<organisation>" }
    ]
  }
}
```

**2a. Existing lead (`kind: 'existing'`): repeat-visit activity 232. No `Source`, no `mx_Custom_6`.**
```json
{
  "LeadDetails": [
    { "Attribute": "FirstName", "Value": "<name>" },
    { "Attribute": "Phone",     "Value": "<10-digit phone>" }
  ],
  "Activity": {
    "ActivityEvent": 232,
    "ActivityNote": "Existing lead visited AceTech 2026 booth (QR)",
    "ActivityDateTime": "<UTC now>",
    "Fields": [
      { "SchemaName": "ActivityEvent_Note", "Value": "Existing lead visited AceTech 2026 booth (QR)" },
      { "SchemaName": "mx_Custom_32", "Value": "End Client" },
      { "SchemaName": "mx_Custom_29", "Value": "Yes" },
      { "SchemaName": "mx_Custom_13", "Value": "Mattress" },
      { "SchemaName": "mx_Custom_1",  "Value": "AceTech Event" }
    ]
  }
}
```

- `FirstName`, `Phone`, and `mx_Custom_6` come from user input. `Source` and the activity-232 fields are fixed constants (`LEAD_SOURCE`, `EXISTING_ACTIVITY_FIELDS`), configured by the LSQ admin. Don't change them without confirmation.
- `ActivityDateTime` is the **server's current time in UTC** (LeadSquared stores API datetimes as UTC), formatted `yyyy-MM-dd HH:mm:ss`. Never trust a client timestamp.
- Activity codes come from env: `LSQ_ACTIVITY_EVENT` (default `231`) for new leads and `LSQ_EXISTING_ACTIVITY_EVENT` (default `232`) for repeat visits.

### Secrets: non-negotiable rules
- Keys live **only** in env vars: `.env.local` locally and Vercel project env in deployed environments. **Never** commit them, put them in this file, ship them to the client, or log them.
- The browser **never** calls LeadSquared directly. It only calls `/api/lead`.
- Env vars: `LSQ_HOST` (e.g. `api-in21.leadsquared.com`), `LSQ_ACCESS_KEY`, `LSQ_SECRET_KEY`, `LSQ_ACTIVITY_EVENT`.
- Keep a `.env.example` with these keys set to empty values. Make sure `.gitignore` covers `.env*.local`.
- When you log request URLs or errors, redact `accessKey` and `secretKey`.
- The access key contains a literal `$`. In `.env.local` it must be escaped as `\$`, but in the **Vercel dashboard** enter it unescaped (`u$…`). `readConfig()` tolerates `\$`, `%24`, quotes and whitespace. If LSQ ever returns 401 "Invalid User Details", the error log includes a `creds` fingerprint (length + sha256 prefix) to compare against the expected key.

### API route contract: `POST /api/lead`
- Request: `{ name, phone, organisation, website /* honeypot */ }`
- Re-validate with the shared zod schema. Never trust client validation.
- Responses:
  - `200 { ok: true, existing: false }`: new lead created in LSQ.
  - `200 { ok: true, existing: true }`: phone already in LSQ, and repeat-visit activity 232 was logged. The UI shows the "Welcome back" state.
  - If the activity-232 write fails, the response is `502`, the same as a failed new-lead write: logged for backfill, and the user can retry.
  - `400 { ok: false, error: "validation", fields: {...} }`: invalid input.
  - `502 { ok: false, error: "upstream" }`: LSQ failed. **Log the full normalised lead server-side** so it can be re-pushed manually. This is the "zero lost leads" guarantee.
- Timeout for the LSQ call is 10s, with **one** retry on network error or 5xx. Never retry on a 4xx.
- If the honeypot field is filled, return `200` and skip LSQ silently.
- Light rate limit per IP: 20/min, in-memory per instance (`lib/rate-limit.ts`). The booth Wi-Fi may NAT everyone behind one IP, so don't set it too tight.

---

## 4. Design system

Design references: **thesleepcompany.in** and the **AceTech 2026 brochure** (`AceTech 2026.pdf`, provided by the team). The visual language is calm, premium, and clinical-clean: deep navy on soft aqua, with the **SmartGRID** square-grid motif as the brand signature.

### Colour tokens (sampled from the brochure)
| Token              | Hex       | Use |
|--------------------|-----------|-----|
| `--navy-900`       | `#1F2A4C` | Primary text, headings, primary button, logo |
| `--navy-800`       | `#253050` | Hover/pressed, dark bands (like the "Meet India's 1st…" banner) |
| `--aqua-300`       | `#A3CCDA` | SmartGRID pattern, accents |
| `--aqua-200`       | `#BBD7DC` | Page background (brochure page tone) |
| `--aqua-50`        | `#EAF3F5` | Card / input background, gradient end |
| `--white`          | `#FFFFFF` | Form card surface |
| `--error`          | `#B42318` | Validation errors (keep AA contrast on white) |
| `--success`        | `#1F7A4D` | Success check icon |

- The page background is a soft vertical gradient `--aqua-200 → --aqua-50`. Add an optional faint SmartGRID pattern (CSS `background-image` grid lines in `--aqua-300` at low opacity) in the header area.
- The form sits on a white card with a ~16px radius and a soft shadow.
- Text is always navy, never pure black.
- **Light theme only.** It's an event page, and the brochure palette is the brand.

### Typography
- The brochure uses a **bold geometric sans in ALL CAPS** for headings ("WHY US?", "SMART ORTHO ROYALE MATTRESS") and a light geometric sans for body text.
- Use **Montserrat** via `next/font/google` as a stand-in: 700–800 uppercase with slight letter-spacing for headings, 400/500 for body. If the brand team provides the official font files, swap them in through `next/font/local`.
- Minimum body size is 16px, so iOS doesn't zoom on input focus.

### Layout (mobile-first: assume a phone held in one hand, outdoors or bright-hall lighting)
1. **Header:** TSC logo (`public/brand/logo.svg`) centred on a navy band or the aqua grid.
2. **Hero line:** "WELCOME TO THE SLEEP COMPANY", then a subline: "Share your details and our team will connect with you." Optional small tag: "AceTech 2026".
3. **Form card:** three fields and a full-width primary button **"Submit"** (navy, white text, height ≥ 48px, radius 12px).
4. **Footer strip:** "MATTRESS | CHAIR | RECLINER BED | RECLINER SOFA | PILLOW" in small caps, like the brochure cover.
5. **Thank-you state:** replaces the form in place with no route change. Show a check icon, the exact success copy (§1), the contact block, and a "Visit thesleepcompany.in" link button.

- Max content width is about 440px, centred. On desktop the card floats centred on the aqua background.
- **Assets needed from the brand team:** the official logo (SVG), and optionally a SmartGRID texture and an OG image. Until they arrive, use a text wordmark placeholder and leave `TODO(brand)` comments. **Do not** recreate the logo by hand or use photos of the brand ambassador.

### Accessibility and UX
- Every input has a visible `<label>` (not placeholder-only). Errors are linked with `aria-describedby` and announced with `aria-live="polite"`.
- Validate on blur and on submit, not on every keystroke.
- On submit: disable the button and show a spinner with the text "Submitting…". This prevents double taps.
- Focus moves to the first invalid field, or to the thank-you heading on success.
- Every colour pair passes WCAG AA. Navy on aqua and white on navy both do.
- Respect `prefers-reduced-motion`. The only animation is a subtle fade/scale on the success state.

---

## 5. Validation rules (`lib/lead-schema.ts`)

| Field | Rules | Normalisation |
|---|---|---|
| name | 2–60 chars; letters, spaces, `.` `'` `-` | trim, collapse spaces |
| phone | Indian mobile: 10 digits starting with 6–9 | strip spaces/dashes, strip leading `+91` / `91` / `0` |
| organisation | 2–100 chars | trim, collapse spaces |

Error copy should be short and human, e.g. "Please enter a valid 10-digit mobile number."

---

## 6. Reliability and data handling

- **Conference Wi-Fi is bad.** If the request to `/api/lead` fails at the network level, keep the form filled in, show "Couldn't submit — check your connection and tap Submit again", and allow retry. Never clear the input on failure.
- Server-side, log a structured line for every attempt: `{ ts, outcome, phoneMasked: "98XXXXXX11", organisation, lsqStatus }`. On upstream failure, also log the full normalised lead (and only then) so it can be backfilled. Never log keys.
- **Privacy (India DPDP Act).** Put a one-line notice under the button: "By submitting, you agree to be contacted by The Sleep Company." Collect nothing beyond the three fields. No third-party trackers in v1.

---

## 6a. Postgres lead log (secondary record)

Every **valid** submission is also written to **Aiven Postgres** (table `acetech_leads`, schema in `db/schema.sql`). This record is independent of LeadSquared, for reporting and for backfill. LSQ stays the system of record.

- One row per submission. `lead_kind` is `new` or `existing`. `lsq_outcome` is `created`, `activity_logged` or `failed`. The row also stores `lsq_status`, `lsq_prospect_id`, `lsq_activity_event` (231/232), the redacted `lsq_error`, `user_agent`, and `created_at` (UTC).
- Invalid submissions and honeypot hits are **not** logged.
- The insert runs in `after()` (`next/server`), after the response is sent. It adds no latency and **never** affects the visitor. If the DB is down, `db_insert_failed` is logged with the full lead.
- Rows with `lsq_outcome = 'failed'` are the backfill list. Export them with `npm run leads:export -- failed`.
- Connection: `DATABASE_URL` (server-only). The pool uses `max: 3`, because the Aiven plan allows only 15 connections. TLS is always on. Set `DATABASE_CA_CERT` (the Aiven project CA, PEM) to verify the server cert; otherwise it encrypts without verifying, the same as `sslmode=require`.
- `npm run db:migrate` applies the schema (idempotent). `npm run leads:export` writes a CSV to `exports/` (git-ignored, times in IST).
- Phone numbers are PII. Never log them unmasked except in failure/backfill lines, and never commit exports.

Useful queries:
```sql
SELECT count(*) total, count(*) FILTER (WHERE lead_kind='new') new_leads,
       count(*) FILTER (WHERE lead_kind='existing') repeat_visits,
       count(*) FILTER (WHERE lsq_outcome='failed') lsq_failed
  FROM acetech_leads;
SELECT * FROM acetech_leads WHERE lsq_outcome = 'failed' ORDER BY created_at;
```

## 7. Commands and workflow

```bash
npm run dev        # local dev (needs .env.local — note: escape `$` in values as `\$`)
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run build
npm run qr -- https://tsc-acetech-2026.vercel.app   # print QR + poster → public/qr/
vercel deploy --prod --yes                          # project: dhruvs-projects-3e416bab/tsc-acetech-2026
```

**Production:** https://tsc-acetech-2026.vercel.app. LSQ env vars are set in Vercel (Production, Preview and Development).

**Git → Vercel:** the GitHub repo `DHRUV130703/AceTech-2026-TSC` is connected. Every push to `main` deploys to production automatically, and other branches get preview URLs. Run tests and the build before pushing to `main`.

- Unit tests are required for `lead-schema.ts` (normalisation and edge cases) and `buildPayload()` (exact LSQ JSON shape, UTC datetime format, `mx_Custom_6` mapping).
- Route tests mock `fetch` for success, 5xx-then-success retry, 4xx with no retry, timeout, and honeypot.
- **Never hit the real LeadSquared API from tests.** Do manual end-to-end checks against LSQ only with obviously fake test names (e.g. `Test AceTech`), and tell the LSQ admin so they can delete those leads.
- Before calling work done: lint, typecheck, and tests pass, and you've checked the page at a 375px width.

---

## 8. QR code

- `scripts/generate-qr.ts` uses the `qrcode` package and encodes the production URL with a source tag, e.g. `https://<domain>/?src=acetech-qr`.
- Output is SVG for print, plus a 1024px PNG. Use error-correction level **H**, a quiet zone of at least 4 modules, and navy `#1F2A4C` on white. Don't use aqua for the QR modules; the contrast is too low to scan reliably.
- Test the printed QR with both iOS and Android camera apps from about 1 m away before the event.

---

## 9. Guardrails for Claude

- Don't add features outside §1 scope without asking.
- Don't expose, hardcode, or echo LeadSquared credentials anywhere, including chat output.
- Don't change the LSQ payload shape or the `mx_Custom_6` mapping without confirmation. The LSQ admin owns that schema.
- Keep the page fast: aim for under 100 KB of JS on the landing route. No heavy UI kits or animation libraries.
- Prefer small, reviewable changes, and explain trade-offs briefly when you make them.
