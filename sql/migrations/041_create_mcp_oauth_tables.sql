-- ─────────────────────────────────────────────────────────────────────
-- 041_create_mcp_oauth_tables
-- ─────────────────────────────────────────────────────────────────────
--
-- Tables for the MCP (Model Context Protocol) OAuth 2.0 server that lets
-- Claude.ai connect as a custom connector. Three-table standard layout:
--
--   1. mcp_oauth_clients     — registered OAuth clients (one per Claude
--                               install via Dynamic Client Registration)
--   2. mcp_oauth_auth_codes  — short-lived authorization codes issued
--                               during the consent step (10 min TTL)
--   3. mcp_oauth_access_tokens — bearer tokens Claude.ai presents on
--                               every MCP call (1 hour TTL, refreshable)
--
-- Why separate from any existing auth tables: this is a self-contained
-- OAuth server we run; it does NOT replace Supabase Auth. The user
-- authenticates to HoloHive normally (Supabase Auth), and the consent
-- screen for the MCP connector PIGGYBACKS on that session — the
-- /oauth/authorize page checks `auth.uid()` and binds the issued auth
-- code to that user. This way, only the actual logged-in HoloHive user
-- can grant Claude.ai access to their data.
--
-- Service-role-only access: the OAuth endpoints run with the service
-- role key, so RLS policies don't grant any client/anon access. We
-- still enable RLS as defense-in-depth (so accidentally exposing the
-- anon key wouldn't leak tokens).

-- ── 1. Clients (registered via DCR by Claude.ai) ─────────────────────
CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL UNIQUE,
  client_secret TEXT,                       -- nullable for public clients (PKCE)
  client_name TEXT,
  redirect_uris TEXT[] NOT NULL,            -- whitelisted callback URLs
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Authorization codes (short-lived, single-use) ─────────────────
CREATE TABLE IF NOT EXISTS mcp_oauth_auth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES mcp_oauth_clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,                    -- the Supabase auth.users.id
  user_email TEXT,                          -- copied for convenience / audit
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT,                      -- PKCE
  code_challenge_method TEXT,               -- 'S256' | 'plain'
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Access tokens (the bearer Claude.ai sends on each MCP call) ───
CREATE TABLE IF NOT EXISTS mcp_oauth_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES mcp_oauth_clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,                    -- Supabase auth.users.id this token represents
  user_email TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ                  -- bumped on each MCP request for audit
);

-- ── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mcp_auth_codes_code ON mcp_oauth_auth_codes (code);
CREATE INDEX IF NOT EXISTS idx_mcp_auth_codes_expires ON mcp_oauth_auth_codes (expires_at);
CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_token ON mcp_oauth_access_tokens (token);
CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_expires ON mcp_oauth_access_tokens (expires_at);

-- ── RLS ──────────────────────────────────────────────────────────────
-- Defense in depth: only service role should touch these tables.
ALTER TABLE mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_oauth_auth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_oauth_access_tokens ENABLE ROW LEVEL SECURITY;
-- No policies created → no client/anon access. Service role bypasses RLS.
