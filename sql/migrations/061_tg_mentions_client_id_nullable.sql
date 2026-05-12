-- Migration 061: Allow NULL client_id on tg_mentions.
--
-- Follow-up to migration 060. With the new mindshare_projects table,
-- project_id is the canonical pointer. client_id stays for backward
-- compat but must be nullable so we can record mentions on competitor
-- benchmark projects (no client behind them).

ALTER TABLE tg_mentions ALTER COLUMN client_id DROP NOT NULL;
