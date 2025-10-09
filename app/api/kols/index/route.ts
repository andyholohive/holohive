/**
 * KOL Indexing API Route
 *
 * Server-side endpoint for indexing KOLs into vector database
 * Keeps OpenAI API key secure on the server
 *
 * @author AI Assistant
 */

import { NextRequest, NextResponse } from 'next/server';
import { VectorStore } from '@/lib/vectorStore';
import { KOLService } from '@/lib/kolService';

/**
 * POST /api/kols/index
 * Index a single KOL by ID
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { kolId } = body;

    if (!kolId) {
      return NextResponse.json(
        { error: 'kolId is required' },
        { status: 400 }
      );
    }

    // Fetch KOL data
    const kols = await KOLService.getAllKOLs();
    const kol = kols.find(k => k.id === kolId);

    if (!kol) {
      return NextResponse.json(
        { error: 'KOL not found' },
        { status: 404 }
      );
    }

    // Index the KOL
    const embeddingId = await VectorStore.indexKOL(kol);

    return NextResponse.json({
      success: true,
      embeddingId,
      kolId: kol.id,
      kolName: kol.name,
    });

  } catch (error: any) {
    console.error('KOL indexing API error:', error);

    return NextResponse.json(
      {
        error: 'Failed to index KOL',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/kols/index
 * Get API info
 */
export async function GET() {
  return NextResponse.json({
    service: 'KOL Indexing API',
    description: 'Server-side KOL vector indexing for semantic search',
    endpoints: {
      index: {
        method: 'POST',
        path: '/api/kols/index',
        description: 'Index a single KOL by ID',
        body: {
          kolId: 'string (UUID)',
        },
      },
    },
  });
}
