import { NextResponse } from 'next/server';
import { RadarAgent } from '@/lib/agents/radarAgent';
import { AtlasAgent } from '@/lib/agents/atlasAgent';
import { MercuryAgent } from '@/lib/agents/mercuryAgent';
import { SentinelAgent } from '@/lib/agents/sentinelAgent';
import { ForgeAgent } from '@/lib/agents/forgeAgent';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/agents/scheduled?agent=RADAR|ATLAS|MERCURY|SENTINEL|FORGE
 *
 * Scheduled agent execution endpoint.
 * Secured by CRON_SECRET bearer token.
 * Called by external cron service (Vercel Cron, etc.)
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const agentName = searchParams.get('agent')?.toUpperCase();

  if (!agentName) {
    return NextResponse.json({ error: 'agent parameter required (RADAR, ATLAS, MERCURY, SENTINEL, FORGE)' }, { status: 400 });
  }

  try {
    let result;

    switch (agentName) {
      case 'RADAR': {
        const scanType = searchParams.get('scan_type') || 'morning';
        const agent = new RadarAgent();
        result = await agent.run({ scan_type: scanType }, 'scheduled');
        break;
      }
      case 'ATLAS': {
        const agent = new AtlasAgent();
        result = await agent.run({}, 'scheduled');
        break;
      }
      case 'MERCURY': {
        const agent = new MercuryAgent();
        result = await agent.run({}, 'scheduled');
        break;
      }
      case 'SENTINEL': {
        const reviewType = searchParams.get('review_type') || 'full';
        const agent = new SentinelAgent();
        result = await agent.run({ review_type: reviewType }, 'scheduled');
        break;
      }
      case 'FORGE': {
        const contentType = searchParams.get('content_type') || 'batch';
        const topic = searchParams.get('topic') || undefined;
        const agent = new ForgeAgent();
        result = await agent.run({ content_type: contentType, topic }, 'scheduled');
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown agent: ${agentName}` }, { status: 400 });
    }

    return NextResponse.json({
      agent: agentName,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    console.error(`Scheduled agent ${agentName} error:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
