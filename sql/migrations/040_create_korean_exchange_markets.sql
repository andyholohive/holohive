-- Migration 040: Korean Exchange Market Tracking
--
-- Tracks every market currently listed on Upbit and Bithumb so we can
-- detect new listings (and delistings) by diffing over time.
--
-- New listing detection:
--   On each cron run, fetch the current set of markets from each exchange.
--   Any (exchange, symbol) pair we haven't seen before → new listing → fire
--   a `korea_exchange_listing` signal in prospect_signals (Tier 1, weight 25).
--
-- Delisting detection:
--   Symbols whose `last_seen_at` is older than the most recent run had them
--   present → the exchange removed them → fire `korea_exchange_delisting`
--   signal (negative weight, disqualifier).

CREATE TABLE IF NOT EXISTS korean_exchange_markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  exchange TEXT NOT NULL,        -- 'upbit' | 'bithumb'
  symbol TEXT NOT NULL,          -- e.g. 'BTC', 'AVAX', 'TIA'
  market_pair TEXT NOT NULL,     -- e.g. 'KRW-BTC' (Upbit), 'BTC' (Bithumb returns just symbol)
  quote_currency TEXT,           -- 'KRW', 'BTC', 'USDT'

  -- Project metadata (best-effort, fills in opportunistically)
  korean_name TEXT,
  english_name TEXT,
  warning_flag BOOLEAN DEFAULT FALSE,  -- Upbit's market_warning field; true = investigation/caution

  -- Status tracking
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delisted_at TIMESTAMPTZ,             -- set when symbol disappears from exchange feed

  -- Signal tracking (so we don't fire repeated listing signals)
  listing_signal_fired_at TIMESTAMPTZ,
  delisting_signal_fired_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (exchange, market_pair)
);

CREATE INDEX IF NOT EXISTS idx_kem_symbol ON korean_exchange_markets (symbol);
CREATE INDEX IF NOT EXISTS idx_kem_exchange ON korean_exchange_markets (exchange);
CREATE INDEX IF NOT EXISTS idx_kem_last_seen ON korean_exchange_markets (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_kem_delisted ON korean_exchange_markets (delisted_at) WHERE delisted_at IS NOT NULL;

ALTER TABLE korean_exchange_markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read korean exchange markets" ON korean_exchange_markets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access on korean exchange markets" ON korean_exchange_markets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE korean_exchange_markets IS
  'Snapshot of every currently-listed market on Upbit and Bithumb. Updated by /api/cron/korean-exchange-listings hourly. Diff against last snapshot detects new listings and delistings, which fire prospect_signals.';
