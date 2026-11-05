# AceTech-2026-TSC

The Sleep Company's lead-capture page for the **AceTech 2026** booth. Visitors scan a QR code and enter their name, phone and organisation. Each submission creates a lead and an activity in **LeadSquared**.

**Live:** https://tsc-acetech-2026.vercel.app

## Stack
Next.js (App Router) · TypeScript · Tailwind CSS v4 · zod · Vitest · Vercel

## Setup
```bash
npm install
cp .env.example .env.local   # fill in LeadSquared keys (escape `$` as `\$`)
npm run dev
```

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm test` | Unit and route tests (LeadSquared is mocked) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production build |
| `npm run qr -- <url>` | Writes the print QR and booth poster to `public/qr/` |

## Environment variables
`LSQ_HOST`, `LSQ_ACCESS_KEY`, `LSQ_SECRET_KEY`, `LSQ_ACTIVITY_EVENT` (default `231`). These are server-only and must never be committed.

See [CLAUDE.md](CLAUDE.md) for the full product, design and integration spec.
