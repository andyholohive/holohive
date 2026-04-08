import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/prospects/score — Recalculate ICP scores for all prospects
 * Uses the settings from prospect_settings table
 */
export async function POST() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch settings
    const { data: settingsData } = await supabase
      .from('prospect_settings')
      .select('key, value');

    const settings: Record<string, any> = {};
    (settingsData || []).forEach(row => { settings[row.key] = row.value; });

    const categoryTiers = settings.category_tiers || { tier1: [], tier2: [], tier3: [], skip: [] };
    const marketCapRange = settings.market_cap_range || { min: 0, max: 0 };
    const disqualifyKeywords: string[] = settings.disqualify_keywords || [];

    // Fetch all prospects (include current status so we don't overwrite promoted)
    const { data: prospects, error } = await supabase
      .from('prospects')
      .select('id, name, category, market_cap, website_url, twitter_url, telegram_url, status');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let scored = 0;
    const batchSize = 100;
    const updates: { id: string; icp_score: number; status: string | null; currentStatus: string | null }[] = [];

    for (const p of prospects || []) {
      let score = 0;
      const nameLower = (p.name || '').toLowerCase();
      const catLower = (p.category || '').toLowerCase();

      // Check disqualify keywords
      const disqualified = disqualifyKeywords.some(kw => {
        const kwLower = kw.toLowerCase();
        return nameLower.includes(kwLower) || catLower.includes(kwLower);
      });

      if (!disqualified) {
        // Category scoring (0-40)
        const tier1Cats = (categoryTiers.tier1 || []).map((c: string) => c.toLowerCase());
        const tier2Cats = (categoryTiers.tier2 || []).map((c: string) => c.toLowerCase());
        const tier3Cats = (categoryTiers.tier3 || []).map((c: string) => c.toLowerCase());
        const skipCats = (categoryTiers.skip || []).map((c: string) => c.toLowerCase());

        let catScore = 0;
        let catReason = 'No category';
        if (skipCats.some((c: string) => catLower.includes(c))) {
          catScore = 0; catReason = `Category "${p.category}" is in Skip tier`;
        } else if (tier1Cats.some((c: string) => catLower.includes(c))) {
          catScore = 40; catReason = `Category "${p.category}" is Tier 1`;
        } else if (tier2Cats.some((c: string) => catLower.includes(c))) {
          catScore = 25; catReason = `Category "${p.category}" is Tier 2`;
        } else if (tier3Cats.some((c: string) => catLower.includes(c))) {
          catScore = 10; catReason = `Category "${p.category}" is Tier 3`;
        } else if (p.category) {
          catScore = 20; catReason = `Category "${p.category}" not assigned to a tier`;
        }
        score += catScore;

        // Market cap scoring (0-35)
        const mc = Number(p.market_cap) || 0;
        const mcMin = Number(marketCapRange.min) || 0;
        const mcMax = Number(marketCapRange.max) || 0;
        let mcScore = 0;
        let mcReason = 'No market cap data';
        if (mcMin > 0 || mcMax > 0) {
          if (mc > 0) {
            if (mcMin > 0 && mcMax > 0 && mc >= mcMin && mc <= mcMax) {
              mcScore = 35; mcReason = `Market cap $${(mc/1e6).toFixed(0)}M in sweet spot`;
            } else if (mcMin > 0 && mc >= mcMin && mcMax === 0) {
              mcScore = 25; mcReason = `Market cap $${(mc/1e6).toFixed(0)}M above minimum`;
            } else if (mc > 0 && mc < mcMin) {
              mcScore = 10; mcReason = `Market cap $${(mc/1e6).toFixed(0)}M below minimum`;
            } else if (mcMax > 0 && mc > mcMax) {
              mcScore = 15; mcReason = `Market cap $${(mc/1e9).toFixed(1)}B above maximum`;
            }
          }
        } else if (mc > 0) {
          mcScore = 20; mcReason = `Has market cap, no range configured`;
        }
        score += mcScore;

        // Bonus: Has links (0-15 total — bonus, not penalty for missing)
        let linkScore = 0;
        let linkReason = 'No links';
        if (p.website_url) { linkScore += 5; }
        if (p.twitter_url) { linkScore += 5; }
        if (p.telegram_url) { linkScore += 5; }
        if (linkScore > 0) linkReason = `Has ${[p.website_url && 'website', p.twitter_url && 'Twitter', p.telegram_url && 'Telegram'].filter(Boolean).join(', ')}`;
        score += linkScore;

        // Base points (10)
        score += 10;
      }

      const finalScore = Math.min(score, 100);

      // Auto-assign status based on score
      // Skip prospects that have been manually promoted
      let autoStatus: string | null = null;
      if (p.status !== 'promoted') {
        if (finalScore >= 70) autoStatus = 'reviewed'; // Potential
        else if (finalScore >= 40) autoStatus = 'needs_review'; // Needs Review
        else autoStatus = 'dismissed'; // Low score
      }

      updates.push({ id: p.id, icp_score: finalScore, status: autoStatus, currentStatus: p.status });
      scored++;
    }

    // Step 1: Batch update scores (group by score value to minimize queries)
    const scoreGroups = new Map<number, string[]>();
    for (const u of updates) {
      if (!scoreGroups.has(u.icp_score)) scoreGroups.set(u.icp_score, []);
      scoreGroups.get(u.icp_score)!.push(u.id);
    }
    for (const [score, ids] of scoreGroups) {
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        await supabase
          .from('prospects')
          .update({ icp_score: score })
          .in('id', chunk);
      }
    }

    // Step 2: Bulk update statuses by score range (3 queries instead of 4000)
    const nonPromotedIds = updates.filter(u => u.currentStatus !== 'promoted').map(u => u.id);
    const potentialIds = updates.filter(u => u.currentStatus !== 'promoted' && u.icp_score >= 70).map(u => u.id);
    const needsReviewIds = updates.filter(u => u.currentStatus !== 'promoted' && u.icp_score >= 40 && u.icp_score < 70).map(u => u.id);
    const dismissedIds = updates.filter(u => u.currentStatus !== 'promoted' && u.icp_score < 40).map(u => u.id);

    for (let i = 0; i < potentialIds.length; i += 500) {
      await supabase.from('prospects').update({ status: 'reviewed' }).in('id', potentialIds.slice(i, i + 500));
    }
    for (let i = 0; i < needsReviewIds.length; i += 500) {
      await supabase.from('prospects').update({ status: 'needs_review' }).in('id', needsReviewIds.slice(i, i + 500));
    }
    for (let i = 0; i < dismissedIds.length; i += 500) {
      await supabase.from('prospects').update({ status: 'dismissed' }).in('id', dismissedIds.slice(i, i + 500));
    }

    // Cleanup: catch any remaining prospects with null/new status that have a score
    // This handles edge cases where the ID-based updates missed some rows
    await supabase
      .from('prospects')
      .update({ status: 'reviewed' })
      .or('status.eq.new,status.is.null')
      .gte('icp_score', 70)
      .neq('status', 'promoted');

    await supabase
      .from('prospects')
      .update({ status: 'needs_review' })
      .or('status.eq.new,status.is.null')
      .gte('icp_score', 40)
      .lt('icp_score', 70);

    await supabase
      .from('prospects')
      .update({ status: 'dismissed' })
      .or('status.eq.new,status.is.null')
      .lt('icp_score', 40)
      .gt('icp_score', 0);

    return NextResponse.json({
      success: true,
      scored,
      potential: potentialIds.length,
      needs_review: needsReviewIds.length,
      dismissed: dismissedIds.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
