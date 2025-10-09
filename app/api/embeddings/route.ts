/**
 * Embeddings API Route
 *
 * Server-side endpoint for generating embeddings
 * Keeps OpenAI API key secure on the server
 *
 * Endpoints:
 * - POST /api/embeddings/generate - Generate single embedding
 * - POST /api/embeddings/batch - Batch generate embeddings
 *
 * @author AI Assistant
 * @date 2025-10-02
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client on server side
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = 'text-embedding-ada-002';
const MAX_TOKENS = 8191; // Model's max token limit
const MAX_CHARS = 30000; // Approximate character limit (~4 chars per token)

/**
 * Clean and prepare text for embedding
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .slice(0, MAX_CHARS); // Truncate to safe length
}

/**
 * POST /api/embeddings/generate
 * Generate a single embedding
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, texts } = body;

    // Validate input
    if (!text && !texts) {
      return NextResponse.json(
        { error: 'Either "text" or "texts" is required' },
        { status: 400 }
      );
    }

    // Single text embedding
    if (text) {
      const cleanedText = cleanText(text);

      if (!cleanedText) {
        return NextResponse.json(
          { error: 'Text is empty after cleaning' },
          { status: 400 }
        );
      }

      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: cleanedText,
      });

      const embedding = response.data[0].embedding;
      const usage = response.usage;

      return NextResponse.json({
        embedding,
        dimension: embedding.length,
        usage: {
          prompt_tokens: usage.prompt_tokens,
          total_tokens: usage.total_tokens,
        },
        model: EMBEDDING_MODEL,
      });
    }

    // Batch text embeddings
    if (texts && Array.isArray(texts)) {
      if (texts.length === 0) {
        return NextResponse.json(
          { error: 'Texts array is empty' },
          { status: 400 }
        );
      }

      if (texts.length > 100) {
        return NextResponse.json(
          { error: 'Maximum 100 texts per batch' },
          { status: 400 }
        );
      }

      const cleanedTexts = texts.map(t => cleanText(t)).filter(Boolean);

      if (cleanedTexts.length === 0) {
        return NextResponse.json(
          { error: 'All texts are empty after cleaning' },
          { status: 400 }
        );
      }

      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: cleanedTexts,
      });

      const embeddings = response.data.map(d => d.embedding);
      const usage = response.usage;

      return NextResponse.json({
        embeddings,
        count: embeddings.length,
        dimension: embeddings[0]?.length || 0,
        usage: {
          prompt_tokens: usage.prompt_tokens,
          total_tokens: usage.total_tokens,
        },
        model: EMBEDDING_MODEL,
      });
    }

    return NextResponse.json(
      { error: 'Invalid request format' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('Embeddings API Error:', error);

    // Handle OpenAI API errors
    if (error.status) {
      return NextResponse.json(
        {
          error: 'OpenAI API error',
          message: error.message,
          status: error.status,
        },
        { status: error.status }
      );
    }

    // Generic error
    return NextResponse.json(
      {
        error: 'Failed to generate embedding',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/embeddings
 * Get API info
 */
export async function GET() {
  return NextResponse.json({
    service: 'Embeddings API',
    model: EMBEDDING_MODEL,
    dimension: 1536,
    maxTokens: MAX_TOKENS,
    endpoints: {
      generate: {
        method: 'POST',
        path: '/api/embeddings',
        description: 'Generate embeddings for text',
        body: {
          text: 'string (for single embedding)',
          texts: 'string[] (for batch embeddings, max 100)',
        },
      },
    },
    rateLimit: {
      requests: '3000 RPM',
      tokens: '1,000,000 TPM',
    },
  });
}
