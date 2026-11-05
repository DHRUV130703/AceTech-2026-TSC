-- AceTech 2026 — secondary log of every valid form submission.
-- LeadSquared is the system of record; this table is the independent audit / backfill source.
-- Idempotent: safe to run repeatedly (npm run db:migrate).

CREATE TABLE IF NOT EXISTS acetech_leads (
  id              BIGSERIAL PRIMARY KEY,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  name            TEXT        NOT NULL,
  phone           TEXT        NOT NULL,                 -- normalised 10-digit Indian mobile
  organisation    TEXT        NOT NULL,
  lead_kind       TEXT        NOT NULL CHECK (lead_kind IN ('new', 'existing')),
  lsq_outcome     TEXT        NOT NULL CHECK (lsq_outcome IN ('created', 'activity_logged', 'failed')),
  lsq_status      INTEGER,                              -- HTTP status from LSQ (null = network error)
  lsq_prospect_id TEXT,                                 -- known for existing leads
  lsq_activity_event INTEGER,                           -- 231 (new) / 232 (existing)
  lsq_error       TEXT,                                 -- redacted LSQ error body on failure
  source          TEXT        NOT NULL DEFAULT 'AceTech 2026 QR',
  user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS acetech_leads_created_at_idx ON acetech_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS acetech_leads_phone_idx      ON acetech_leads (phone);
CREATE INDEX IF NOT EXISTS acetech_leads_failed_idx     ON acetech_leads (created_at) WHERE lsq_outcome = 'failed';
