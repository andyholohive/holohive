import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import mammoth from 'mammoth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/specs/extract
 *
 * Spec Tracker — AI-powered spec doc ingestion.
 * Built 2026-06-11 in response to: "when we submit the doc, it should
 * take all the functions and what is working and not working in
 * detail as well."
 *
 * Flow:
 *   1. Receive uploaded .docx (or .md/.txt) file
 *   2. Extract raw text via mammoth (for .docx)
 *   3. Send to Claude with a structured prompt to identify the spec
 *      name, summary, and hierarchical features
 *   4. Persist as specs + spec_features rows
 *   5. Return the new specId for the UI to navigate into
 *
 * Auth: super_admin via existing requireSuperAdmin guard.
 */
export async function POST(request: Request) {
  // Auth
  const { requireSuperAdmin } = await import('@/lib/requireSuperAdmin');
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  const userId = (guard as any).user?.id || null;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, error: 'ANTHROPIC_API_KEY not configured on the server.' },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid multipart body.' }, { status: 400 });
  }
  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ ok: false, error: 'Missing file.' }, { status: 400 });
  }

  // ─── Extract raw text ────────────────────────────────────────────
  let rawText = '';
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (file.name.toLowerCase().endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value;
    } else {
      // .md / .txt — read as UTF-8
      rawText = buffer.toString('utf-8');
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: `Failed to read file: ${err?.message}` },
      { status: 400 },
    );
  }

  if (!rawText.trim()) {
    return NextResponse.json(
      { ok: false, error: 'The file contains no readable text.' },
      { status: 400 },
    );
  }

  // ─── Call Claude with structured extraction prompt ──────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are a spec-document feature extractor. You receive the full text of a product spec and return a structured JSON object describing it.

Your output MUST be a single JSON object matching this exact schema:

{
  "name": "Short spec name, 2-6 words. Strip prefixes like 'HHP' if present.",
  "summary": "One-sentence summary, max 30 words.",
  "status": "in_progress" | "planned" | "shipped" | "paused",
  "features": [
    {
      "name": "Short feature name, 2-8 words",
      "description": "1-2 sentence explanation. Cite the spec section if numbered (e.g. '§ 4.2').",
      "children": [
        { "name": "Sub-feature name", "description": "Optional 1-line note." }
      ]
    }
  ]
}

Guidelines:
- Identify discrete, testable features the spec describes.
- Each "Section X" / "X.Y" heading typically maps to one feature.
- Nested bullet lists under a feature should become children.
- Skip purely organizational items (executive summary, dependencies, build plan).
- Aim for 5-20 top-level features for a typical spec.
- Default status: "in_progress" unless the doc explicitly says shipped/planned/paused.
- Be exhaustive — every concrete functionality mentioned should appear.
- Do NOT include any prose outside the JSON object. The response must parse as JSON.`;

  const userPrompt = `Spec text:

${rawText.slice(0, 50_000)}`; // truncate ultra-long docs to fit context

  let extracted: any;
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const textBlock = msg.content.find(b => b.type === 'text') as any;
    if (!textBlock?.text) {
      throw new Error('Empty response from Claude');
    }
    // Extract JSON from possibly fenced response
    const text = textBlock.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found in response');
    extracted = JSON.parse(jsonMatch[0]);
  } catch (err: any) {
    console.error('[specs/extract] Claude call failed:', err);
    return NextResponse.json(
      { ok: false, error: `AI extraction failed: ${err?.message}` },
      { status: 500 },
    );
  }

  if (!extracted?.name || !Array.isArray(extracted?.features)) {
    return NextResponse.json(
      { ok: false, error: 'AI returned invalid structure (no name or features array).' },
      { status: 500 },
    );
  }

  // ─── Persist to DB ──────────────────────────────────────────────
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const { data: specRow, error: sErr } = await (supabase as any)
      .from('specs')
      .insert({
        name: extracted.name,
        summary: extracted.summary ?? null,
        status: extracted.status || 'in_progress',
        metadata: {
          source_file: file.name,
          extracted_at: new Date().toISOString(),
          raw_byte_size: file.size,
        },
        created_by: userId,
      })
      .select('id')
      .single();
    if (sErr) throw sErr;
    const specId = (specRow as { id: string }).id;

    let featureCount = 0;
    for (let i = 0; i < extracted.features.length; i++) {
      const f = extracted.features[i];
      if (!f?.name) continue;
      const { data: topRow, error: tErr } = await (supabase as any)
        .from('spec_features')
        .insert({
          spec_id: specId,
          name: f.name,
          description: f.description ?? null,
          sort_order: i,
          build_status: 'not_started',
          test_status: 'untested',
          created_by: userId,
        })
        .select('id')
        .single();
      if (tErr) throw tErr;
      featureCount++;
      const parentId = (topRow as { id: string }).id;
      const children = Array.isArray(f.children) ? f.children : [];
      for (let j = 0; j < children.length; j++) {
        const c = children[j];
        if (!c?.name) continue;
        await (supabase as any).from('spec_features').insert({
          spec_id: specId,
          parent_feature_id: parentId,
          name: c.name,
          description: c.description ?? null,
          sort_order: j,
          build_status: 'not_started',
          test_status: 'untested',
          created_by: userId,
        });
        featureCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      specId,
      featureCount,
      name: extracted.name,
    });
  } catch (err: any) {
    console.error('[specs/extract] DB write failed:', err);
    return NextResponse.json(
      { ok: false, error: `Persist failed: ${err?.message}` },
      { status: 500 },
    );
  }
}
