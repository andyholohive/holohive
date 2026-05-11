-- Migration 052: 5-for-5 qualification + bookings attendance tracking
--
-- Adds:
--   1. Five qualification booleans on crm_opportunities (BANT+ default
--      labels, but the backing fields are abstract enough to relabel
--      via the UI later if HoloHive's framework changes):
--        qual_budget    — budget confirmed (or directional)
--        qual_dm        — decision-maker identified + engaged
--        qual_timeline  — timeline within ~90 days
--        qual_scope     — scope clarity
--        qual_fit       — strategic/vertical/region fit
--      "Qualified conversation" = >= 3 of 5 checked.
--
--   2. attendance_status on bookings — held / no_show, NULL = not yet
--      recorded. The /crm/meetings page will surface a "Mark held /
--      Mark no-show" UI for past confirmed bookings.

ALTER TABLE crm_opportunities
  ADD COLUMN IF NOT EXISTS qual_budget   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qual_dm       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qual_timeline BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qual_scope    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qual_fit      BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS attendance_status TEXT
    CHECK (attendance_status IN ('held', 'no_show'));

CREATE INDEX IF NOT EXISTS idx_bookings_attendance_status
  ON bookings (attendance_status) WHERE attendance_status IS NOT NULL;
