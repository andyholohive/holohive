-- Migration 005: Add pgvector support for RAG (Retrieval-Augmented Generation)
-- This enables semantic search for KOLs, campaigns, and clients using vector embeddings
--
-- Prerequisites: pgvector extension must be enabled in Supabase Dashboard
-- Go to: Database → Extensions → Enable 'vector'
--
-- Author: AI Assistant
-- Date: 2025-10-02

-- Enable pgvector extension (may already be enabled via dashboard)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- KOL Embeddings Table
-- ============================================================================
-- Stores vector embeddings of KOL data for semantic search
-- Each KOL gets a 1536-dimensional vector from OpenAI text-embedding-ada-002
CREATE TABLE IF NOT EXISTS kol_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kol_id UUID NOT NULL REFERENCES master_kols(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL, -- OpenAI ada-002 embedding dimension
  metadata JSONB DEFAULT '{}'::jsonb, -- Store searchable metadata (name, region, etc)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one embedding per KOL
  CONSTRAINT unique_kol_embedding UNIQUE(kol_id)
);

-- ============================================================================
-- Campaign Embeddings Table
-- ============================================================================
-- Stores vector embeddings of campaign data for semantic search
CREATE TABLE IF NOT EXISTS campaign_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb, -- Store searchable metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_campaign_embedding UNIQUE(campaign_id)
);

-- ============================================================================
-- Client Embeddings Table
-- ============================================================================
-- Stores vector embeddings of client data for semantic search
CREATE TABLE IF NOT EXISTS client_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb, -- Store searchable metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_client_embedding UNIQUE(client_id)
);

-- ============================================================================
-- Vector Indexes
-- ============================================================================
-- Create IVFFlat indexes for fast approximate nearest neighbor search
-- Lists = 100 is good for up to 10,000 rows (adjust if dataset grows larger)

-- Index for KOL embeddings
CREATE INDEX IF NOT EXISTS kol_embeddings_vector_idx
  ON kol_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index for Campaign embeddings
CREATE INDEX IF NOT EXISTS campaign_embeddings_vector_idx
  ON campaign_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index for Client embeddings
CREATE INDEX IF NOT EXISTS client_embeddings_vector_idx
  ON client_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Additional indexes for common queries
CREATE INDEX IF NOT EXISTS kol_embeddings_kol_id_idx ON kol_embeddings(kol_id);
CREATE INDEX IF NOT EXISTS campaign_embeddings_campaign_id_idx ON campaign_embeddings(campaign_id);
CREATE INDEX IF NOT EXISTS client_embeddings_client_id_idx ON client_embeddings(client_id);

-- ============================================================================
-- Similarity Search Functions
-- ============================================================================

-- Function: match_kols
-- Purpose: Find similar KOLs using vector similarity search
-- Parameters:
--   query_embedding: The vector to search for (from user's query)
--   match_threshold: Minimum similarity score (0-1, default 0.7)
--   match_count: Maximum number of results (default 10)
-- Returns: Table of kol_id, similarity score, and metadata
CREATE OR REPLACE FUNCTION match_kols(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  kol_id UUID,
  similarity float,
  metadata JSONB
)
LANGUAGE sql STABLE
AS $$
  SELECT
    kol_id,
    1 - (embedding <=> query_embedding) AS similarity,
    metadata
  FROM kol_embeddings
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Function: match_campaigns
-- Purpose: Find similar campaigns using vector similarity search
CREATE OR REPLACE FUNCTION match_campaigns(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  campaign_id UUID,
  similarity float,
  metadata JSONB
)
LANGUAGE sql STABLE
AS $$
  SELECT
    campaign_id,
    1 - (embedding <=> query_embedding) AS similarity,
    metadata
  FROM campaign_embeddings
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Function: match_clients
-- Purpose: Find similar clients using vector similarity search
CREATE OR REPLACE FUNCTION match_clients(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  client_id UUID,
  similarity float,
  metadata JSONB
)
LANGUAGE sql STABLE
AS $$
  SELECT
    client_id,
    1 - (embedding <=> query_embedding) AS similarity,
    metadata
  FROM client_embeddings
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to update the updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for automatic timestamp updates
CREATE TRIGGER update_kol_embeddings_updated_at
  BEFORE UPDATE ON kol_embeddings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaign_embeddings_updated_at
  BEFORE UPDATE ON campaign_embeddings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_embeddings_updated_at
  BEFORE UPDATE ON client_embeddings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
-- Enable RLS on embedding tables

ALTER TABLE kol_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_embeddings ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read embeddings (needed for semantic search)
CREATE POLICY "Allow read access to kol_embeddings" ON kol_embeddings
  FOR SELECT USING (true);

CREATE POLICY "Allow read access to campaign_embeddings" ON campaign_embeddings
  FOR SELECT USING (true);

CREATE POLICY "Allow read access to client_embeddings" ON client_embeddings
  FOR SELECT USING (true);

-- Policy: Only authenticated users can insert/update/delete
CREATE POLICY "Allow authenticated insert on kol_embeddings" ON kol_embeddings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated update on kol_embeddings" ON kol_embeddings
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated delete on kol_embeddings" ON kol_embeddings
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated insert on campaign_embeddings" ON campaign_embeddings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated update on campaign_embeddings" ON campaign_embeddings
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated delete on campaign_embeddings" ON campaign_embeddings
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated insert on client_embeddings" ON client_embeddings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated update on client_embeddings" ON client_embeddings
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated delete on client_embeddings" ON client_embeddings
  FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================================
-- Completion
-- ============================================================================

COMMENT ON TABLE kol_embeddings IS 'Stores vector embeddings of KOL data for semantic search via RAG';
COMMENT ON TABLE campaign_embeddings IS 'Stores vector embeddings of campaign data for semantic search via RAG';
COMMENT ON TABLE client_embeddings IS 'Stores vector embeddings of client data for semantic search via RAG';

-- Migration complete!
-- Next steps:
-- 1. Run: npx tsx scripts/index-embeddings.ts (to index existing data)
-- 2. Test: npx tsx scripts/test-vector-search.ts (to verify search quality)
