#!/usr/bin/env bash
# snapshot-prod-to-staging.sh — CRM rebuild Day-0 (Yano's #1).
#
# Clones the PROD Supabase Postgres schema + data into the STAGING project so
# migration dry-runs and acceptance fixtures run against realistic data. Prod
# is read-only here (pg_dump only); everything destructive happens on staging.
#
# Prereqs:
#   - `pg_dump` / `psql` (Postgres client tools, v15+ to match Supabase).
#   - PROD_DB_URL and STAGING_DB_URL exported (see .env.staging.example).
#
# Usage:
#   set -a; source .env.staging; set +a
#   ./scripts/snapshot-prod-to-staging.sh
#
# Safety: refuses to run unless STAGING_DB_URL host contains "staging" or is
# explicitly whitelisted via ALLOW_NONSTAGING=1 — so you can't nuke prod by
# mixing up the two vars.
set -euo pipefail

: "${PROD_DB_URL:?set PROD_DB_URL (source .env.staging)}"
: "${STAGING_DB_URL:?set STAGING_DB_URL (source .env.staging)}"

if [[ "${ALLOW_NONSTAGING:-0}" != "1" && "$STAGING_DB_URL" != *staging* ]]; then
  echo "REFUSING: STAGING_DB_URL host does not contain 'staging'." >&2
  echo "This script drops+recreates the target's public schema. Double-check the URL." >&2
  echo "If the staging ref genuinely lacks 'staging', re-run with ALLOW_NONSTAGING=1." >&2
  exit 1
fi

DUMP="$(mktemp -t prod-snapshot-XXXX.sql)"
trap 'rm -f "$DUMP"' EXIT

echo "→ Dumping prod (schema + data, no ownership/ACL — Supabase manages roles)…"
pg_dump "$PROD_DB_URL" \
  --no-owner --no-privileges \
  --schema=public \
  --exclude-table-data='auth.*' \
  --exclude-table-data='storage.*' \
  -f "$DUMP"

echo "→ Resetting staging public schema…"
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'

echo "→ Restoring into staging…"
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f "$DUMP"

echo "✓ Staging now mirrors prod. Run migration dry-runs against STAGING_DB_URL."
