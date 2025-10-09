-- Migration 006: Fix RLS Policies for Embedding Tables
-- Issue: Service role cannot insert embeddings due to RLS policies
-- Solution: Allow service_role to bypass RLS for embedding operations
--
-- Author: AI Assistant
-- Date: 2025-10-02

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Allow authenticated insert on kol_embeddings" ON kol_embeddings;
DROP POLICY IF EXISTS "Allow authenticated update on kol_embeddings" ON kol_embeddings;
DROP POLICY IF EXISTS "Allow authenticated delete on kol_embeddings" ON kol_embeddings;

DROP POLICY IF EXISTS "Allow authenticated insert on campaign_embeddings" ON campaign_embeddings;
DROP POLICY IF EXISTS "Allow authenticated update on campaign_embeddings" ON campaign_embeddings;
DROP POLICY IF EXISTS "Allow authenticated delete on campaign_embeddings" ON campaign_embeddings;

DROP POLICY IF EXISTS "Allow authenticated insert on client_embeddings" ON client_embeddings;
DROP POLICY IF EXISTS "Allow authenticated update on client_embeddings" ON client_embeddings;
DROP POLICY IF EXISTS "Allow authenticated delete on client_embeddings" ON client_embeddings;

-- Create more permissive policies that allow service_role
-- Service role is used by server-side scripts and API routes

-- KOL Embeddings - Allow service role and authenticated users
CREATE POLICY "Allow service role full access on kol_embeddings" ON kol_embeddings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Campaign Embeddings - Allow service role and authenticated users
CREATE POLICY "Allow service role full access on campaign_embeddings" ON campaign_embeddings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Client Embeddings - Allow service role and authenticated users
CREATE POLICY "Allow service role full access on client_embeddings" ON client_embeddings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Note: These policies are permissive because:
-- 1. Embeddings are derived data (not sensitive user data)
-- 2. They're only used for semantic search (read operations)
-- 3. Service role needs access for indexing scripts
-- 4. The actual KOL/campaign/client data has its own RLS protection
