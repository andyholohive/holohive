/**
 * Vector Store Service
 *
 * Handles all vector embedding operations for RAG (Retrieval-Augmented Generation)
 * Uses OpenAI text-embedding-ada-002 model for generating embeddings
 * Stores embeddings in Supabase with pgvector extension
 *
 * Key Features:
 * - Generate embeddings for KOLs, campaigns, and clients
 * - Semantic search using cosine similarity
 * - Batch processing with rate limiting
 * - Automatic metadata extraction
 *
 * @author AI Assistant
 * @date 2025-10-02
 */

import OpenAI from 'openai';
import { supabase } from './supabase';
import { supabaseScript } from './supabase-script';
import { MasterKOL } from './kolService';

// Use script client in Node.js environment, browser client otherwise
const getSupabaseClient = () => {
  if (typeof window === 'undefined' && !process.env.NEXT_RUNTIME) {
    return supabaseScript;
  }
  return supabase;
};

// Initialize OpenAI client
const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OpenAI API key not found in environment variables');
  }

  return new OpenAI({ apiKey });
};

// Types
export interface EmbeddingResult {
  id: string;
  embedding: number[];
  metadata: Record<string, any>;
}

export interface SearchResult {
  id: string;
  similarity: number;
  metadata: Record<string, any>;
}

export interface BatchProgress {
  total: number;
  processed: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

/**
 * Vector Store Service
 * Main class for vector operations
 */
export class VectorStore {
  private static readonly EMBEDDING_MODEL = 'text-embedding-ada-002';
  private static readonly EMBEDDING_DIMENSION = 1536;
  private static readonly BATCH_SIZE = 100; // Process 100 items at a time
  private static readonly RATE_LIMIT_DELAY = 1000; // 1 second between batches

  // ============================================================================
  // Embedding Generation
  // ============================================================================

  /**
   * Generate embedding for arbitrary text
   * @param text Text to embed
   * @returns Embedding vector (1536 dimensions)
   */
  static async generateEmbedding(text: string): Promise<number[]> {
    try {
      const openai = getOpenAIClient();

      // Clean and truncate text (ada-002 max: 8191 tokens, ~32K chars)
      const cleanText = text.replace(/\s+/g, ' ').trim().slice(0, 30000);

      if (!cleanText) {
        throw new Error('Text is empty after cleaning');
      }

      const response = await openai.embeddings.create({
        model: this.EMBEDDING_MODEL,
        input: cleanText,
      });

      const embedding = response.data[0].embedding;

      if (embedding.length !== this.EMBEDDING_DIMENSION) {
        throw new Error(`Unexpected embedding dimension: ${embedding.length}`);
      }

      return embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * Respects rate limits by adding delays
   */
  static async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    // Process in chunks to respect rate limits
    for (let i = 0; i < texts.length; i += this.BATCH_SIZE) {
      const batch = texts.slice(i, i + this.BATCH_SIZE);

      try {
        const openai = getOpenAIClient();

        const response = await openai.embeddings.create({
          model: this.EMBEDDING_MODEL,
          input: batch.map(t => t.replace(/\s+/g, ' ').trim().slice(0, 30000)),
        });

        embeddings.push(...response.data.map(d => d.embedding));

        // Rate limit delay
        if (i + this.BATCH_SIZE < texts.length) {
          await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY));
        }
      } catch (error) {
        console.error(`Error in batch ${i}-${i + batch.length}:`, error);
        throw error;
      }
    }

    return embeddings;
  }

  // ============================================================================
  // KOL Operations
  // ============================================================================

  /**
   * Create searchable text representation of a KOL
   */
  private static kolToText(kol: MasterKOL): string {
    const parts = [
      kol.name,
      kol.region ? `Region: ${kol.region}` : '',
      kol.platform?.length ? `Platforms: ${kol.platform.join(', ')}` : '',
      kol.followers ? `Followers: ${kol.followers}` : '',
      kol.creator_type?.length ? `Creator Types: ${kol.creator_type.join(', ')}` : '',
      kol.content_type?.length ? `Content Types: ${kol.content_type.join(', ')}` : '',
      kol.deliverables?.length ? `Deliverables: ${kol.deliverables.join(', ')}` : '',
      kol.pricing ? `Pricing: ${kol.pricing}` : '',
      kol.community ? 'Has community' : '',
      kol.group_chat ? 'Has group chat' : '',
      kol.in_house ? `In-house: ${kol.in_house}` : '',
      kol.description || '',
    ];

    return parts.filter(Boolean).join('. ');
  }

  /**
   * Extract metadata from KOL for search results
   */
  private static kolToMetadata(kol: MasterKOL): Record<string, any> {
    return {
      name: kol.name,
      region: kol.region,
      platform: kol.platform,
      followers: kol.followers,
      creator_type: kol.creator_type,
      content_type: kol.content_type,
      pricing: kol.pricing,
      rating: kol.rating,
    };
  }

  /**
   * Index a single KOL
   * @param kol KOL data to index
   * @returns Embedding ID
   */
  static async indexKOL(kol: MasterKOL): Promise<string> {
    try {
      const text = this.kolToText(kol);
      const embedding = await this.generateEmbedding(text);
      const metadata = this.kolToMetadata(kol);

      // Upsert into database
      const { data, error } = await ((getSupabaseClient() as any))
        .from('kol_embeddings')
        .upsert({
          kol_id: kol.id,
          embedding: `[${embedding.join(',')}]`, // pgvector format
          metadata,
        }, {
          onConflict: 'kol_id'
        })
        .select()
        .single();

      if (error) throw error;

      return data.id;
    } catch (error) {
      console.error(`Error indexing KOL ${kol.id}:`, error);
      throw error;
    }
  }

  /**
   * Index multiple KOLs in batch
   * @param kols Array of KOLs to index
   * @returns Progress report
   */
  static async batchIndexKOLs(kols: MasterKOL[]): Promise<BatchProgress> {
    const progress: BatchProgress = {
      total: kols.length,
      processed: 0,
      failed: 0,
      errors: [],
    };

    console.log(`Starting batch indexing of ${kols.length} KOLs...`);

    // Process in batches
    for (let i = 0; i < kols.length; i += this.BATCH_SIZE) {
      const batch = kols.slice(i, i + this.BATCH_SIZE);

      console.log(`Processing batch ${Math.floor(i / this.BATCH_SIZE) + 1}/${Math.ceil(kols.length / this.BATCH_SIZE)}...`);

      // Generate embeddings for batch
      try {
        const texts = batch.map(kol => this.kolToText(kol));
        const embeddings = await this.generateEmbeddingsBatch(texts);

        // Insert into database
        const records = batch.map((kol, idx) => ({
          kol_id: kol.id,
          embedding: `[${embeddings[idx].join(',')}]`,
          metadata: this.kolToMetadata(kol),
        }));

        const { error } = await ((getSupabaseClient() as any))
          .from('kol_embeddings')
          .upsert(records, { onConflict: 'kol_id' });

        if (error) {
          console.error('Batch insert error:', error);
          progress.failed += batch.length;
          progress.errors.push({ id: 'batch', error: error.message });
        } else {
          progress.processed += batch.length;
        }
      } catch (error: any) {
        console.error('Batch processing error:', error);
        progress.failed += batch.length;
        progress.errors.push({ id: 'batch', error: error.message });
      }
    }

    console.log(`Batch indexing complete. Processed: ${progress.processed}, Failed: ${progress.failed}`);
    return progress;
  }

  /**
   * Search for KOLs using natural language query
   * @param query Natural language search query
   * @param options Search options
   * @returns Array of matching KOLs with similarity scores
   */
  static async searchKOLs(
    query: string,
    options: {
      threshold?: number;
      limit?: number;
    } = {}
  ): Promise<SearchResult[]> {
    try {
      const { threshold = 0.7, limit = 10 } = options;

      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);

      // Search using pgvector function
      const { data, error } = await ((getSupabaseClient() as any)).rpc('match_kols', {
        query_embedding: `[${queryEmbedding.join(',')}]`,
        match_threshold: threshold,
        match_count: limit,
      });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.kol_id,
        similarity: row.similarity,
        metadata: row.metadata,
      }));
    } catch (error) {
      console.error('Error searching KOLs:', error);
      throw error;
    }
  }

  // ============================================================================
  // Campaign Operations
  // ============================================================================

  /**
   * Create searchable text representation of a campaign
   */
  private static campaignToText(campaign: any): string {
    const parts = [
      campaign.name,
      campaign.description || '',
      campaign.budget ? `Budget: $${campaign.budget}` : '',
      campaign.target_regions?.length ? `Regions: ${campaign.target_regions.join(', ')}` : '',
      campaign.status ? `Status: ${campaign.status}` : '',
      campaign.campaign_type ? `Type: ${campaign.campaign_type}` : '',
    ];

    return parts.filter(Boolean).join('. ');
  }

  /**
   * Index a single campaign
   */
  static async indexCampaign(campaign: any): Promise<string> {
    try {
      const text = this.campaignToText(campaign);
      const embedding = await this.generateEmbedding(text);

      const metadata = {
        name: campaign.name,
        budget: campaign.budget,
        status: campaign.status,
        campaign_type: campaign.campaign_type,
      };

      const { data, error } = await ((getSupabaseClient() as any))
        .from('campaign_embeddings')
        .upsert({
          campaign_id: campaign.id,
          embedding: `[${embedding.join(',')}]`,
          metadata,
        }, {
          onConflict: 'campaign_id'
        })
        .select()
        .single();

      if (error) throw error;

      return data.id;
    } catch (error) {
      console.error(`Error indexing campaign ${campaign.id}:`, error);
      throw error;
    }
  }

  /**
   * Search for campaigns using natural language query
   */
  static async searchCampaigns(
    query: string,
    options: {
      threshold?: number;
      limit?: number;
    } = {}
  ): Promise<SearchResult[]> {
    try {
      const { threshold = 0.7, limit = 10 } = options;

      const queryEmbedding = await this.generateEmbedding(query);

      const { data, error } = await ((getSupabaseClient() as any)).rpc('match_campaigns', {
        query_embedding: `[${queryEmbedding.join(',')}]`,
        match_threshold: threshold,
        match_count: limit,
      });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.campaign_id,
        similarity: row.similarity,
        metadata: row.metadata,
      }));
    } catch (error) {
      console.error('Error searching campaigns:', error);
      throw error;
    }
  }

  // ============================================================================
  // Client Operations
  // ============================================================================

  /**
   * Create searchable text representation of a client
   */
  private static clientToText(client: any): string {
    const parts = [
      client.name,
      client.email || '',
      client.company || '',
      client.industry || '',
      client.notes || '',
    ];

    return parts.filter(Boolean).join('. ');
  }

  /**
   * Index a single client
   */
  static async indexClient(client: any): Promise<string> {
    try {
      const text = this.clientToText(client);
      const embedding = await this.generateEmbedding(text);

      const metadata = {
        name: client.name,
        email: client.email,
        company: client.company,
      };

      const { data, error } = await ((getSupabaseClient() as any))
        .from('client_embeddings')
        .upsert({
          client_id: client.id,
          embedding: `[${embedding.join(',')}]`,
          metadata,
        }, {
          onConflict: 'client_id'
        })
        .select()
        .single();

      if (error) throw error;

      return data.id;
    } catch (error) {
      console.error(`Error indexing client ${client.id}:`, error);
      throw error;
    }
  }

  /**
   * Search for clients using natural language query
   */
  static async searchClients(
    query: string,
    options: {
      threshold?: number;
      limit?: number;
    } = {}
  ): Promise<SearchResult[]> {
    try {
      const { threshold = 0.7, limit = 10 } = options;

      const queryEmbedding = await this.generateEmbedding(query);

      const { data, error } = await ((getSupabaseClient() as any)).rpc('match_clients', {
        query_embedding: `[${queryEmbedding.join(',')}]`,
        match_threshold: threshold,
        match_count: limit,
      });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.client_id,
        similarity: row.similarity,
        metadata: row.metadata,
      }));
    } catch (error) {
      console.error('Error searching clients:', error);
      throw error;
    }
  }

  // ============================================================================
  // Utility Functions
  // ============================================================================

  /**
   * Delete embedding for a KOL
   */
  static async deleteKOLEmbedding(kolId: string): Promise<void> {
    const { error } = await ((getSupabaseClient() as any))
      .from('kol_embeddings')
      .delete()
      .eq('kol_id', kolId);

    if (error) throw error;
  }

  /**
   * Delete embedding for a campaign
   */
  static async deleteCampaignEmbedding(campaignId: string): Promise<void> {
    const { error } = await ((getSupabaseClient() as any))
      .from('campaign_embeddings')
      .delete()
      .eq('campaign_id', campaignId);

    if (error) throw error;
  }

  /**
   * Delete embedding for a client
   */
  static async deleteClientEmbedding(clientId: string): Promise<void> {
    const { error } = await ((getSupabaseClient() as any))
      .from('client_embeddings')
      .delete()
      .eq('client_id', clientId);

    if (error) throw error;
  }

  /**
   * Get statistics about indexed data
   */
  static async getStats(): Promise<{
    kolCount: number;
    campaignCount: number;
    clientCount: number;
  }> {
    const [kolResult, campaignResult, clientResult] = await Promise.all([
      ((getSupabaseClient() as any)).from('kol_embeddings').select('id', { count: 'exact', head: true }),
      ((getSupabaseClient() as any)).from('campaign_embeddings').select('id', { count: 'exact', head: true }),
      ((getSupabaseClient() as any)).from('client_embeddings').select('id', { count: 'exact', head: true }),
    ]);

    return {
      kolCount: kolResult.count || 0,
      campaignCount: campaignResult.count || 0,
      clientCount: clientResult.count || 0,
    };
  }
}
