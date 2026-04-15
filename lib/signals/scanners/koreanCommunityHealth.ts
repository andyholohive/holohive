/**
 * Scanner: Korean Community Health Check
 * Checks for dead Korean Telegram channels and Upbit/Bithumb listings without Korean communities.
 * Signals: dead_korean_presence (-10), korea_exchange_no_community (+15)
 */

import type { ScannerModule, ScanContext, RawSignal } from '../types';
import { SIGNAL_WEIGHTS } from '../types';
import { fetchUpbitTokens } from './upbitListings';
import { fetchBithumbTokens } from './bithumbListings';
import { findProspectMatch, normalizeForMatch } from '../matching';

export const koreanCommunityHealthScanner: ScannerModule = {
  id: 'korean_community_health',
  name: 'Korean Community Health Check',
  cadence: 'weekly',
  requires: 'scraping',
  signalTypes: ['dead_korean_presence', 'korea_exchange_no_community'],

  async scan(ctx: ScanContext): Promise<RawSignal[]> {
    const signals: RawSignal[] = [];

    // Check top prospects for dead Korean TG channels
    const topProspects = ctx.prospects
      .filter(p => p.status !== 'dismissed')
      .slice(0, 30); // Cap to avoid too many requests

    for (const prospect of topProspects) {
      const normName = normalizeForMatch(prospect.name);
      const channelNames = [
        `${normName}_kr`,
        `${normName}_korea`,
        `${normName}kr`,
        `${normName}korean`,
      ];

      let hasKoreanTG = false;
      let isDead = false;

      for (const channelName of channelNames) {
        try {
          const res = await fetch(`https://t.me/s/${channelName}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            },
            signal: AbortSignal.timeout(8000),
          });

          if (res.ok) {
            const html = await res.text();
            // Check if it's a valid channel (not a 404/redirect)
            if (html.includes('tgme_page_title') || html.includes('tgme_channel_info')) {
              hasKoreanTG = true;

              // Check last post date
              const dateMatch = html.match(/datetime="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/g);
              if (dateMatch && dateMatch.length > 0) {
                const lastDateStr = dateMatch[dateMatch.length - 1].replace('datetime="', '');
                const lastPostDate = new Date(lastDateStr);
                const daysSincePost = (Date.now() - lastPostDate.getTime()) / (1000 * 60 * 60 * 24);
                if (daysSincePost > 30) {
                  isDead = true;
                }
              } else {
                // No posts found = dead channel
                isDead = true;
              }
              break; // Found a channel, no need to check other name variants
            }
          }
        } catch {
          // Timeout or network error — skip
        }
        await new Promise(r => setTimeout(r, 500)); // Rate limit
      }

      if (hasKoreanTG && isDead) {
        const config = SIGNAL_WEIGHTS.dead_korean_presence;
        signals.push({
          prospect_id: prospect.id,
          project_name: prospect.name,
          signal_type: 'dead_korean_presence',
          headline: `${prospect.name} has dead Korean Telegram (no posts 30+ days)`,
          snippet: `Korean Telegram channel exists but appears inactive. Apply 20% test: would changing our approach change results?`,
          source_url: `https://t.me/s/${channelNames[0]}`,
          source_name: 'telegram',
          relevancy_weight: config.weight,
          tier: config.tier,
          shelf_life_days: config.shelf_life_days,
          expires_at: new Date(Date.now() + config.shelf_life_days * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }

    // Check for exchange listings without Korean community
    try {
      const [upbitTokens, bithumbTokens] = await Promise.all([
        fetchUpbitTokens(),
        fetchBithumbTokens(),
      ]);

      const listedSymbols = new Set([
        ...upbitTokens.map(t => t.symbol),
        ...bithumbTokens.map(t => t.symbol),
      ]);

      // For each prospect that's listed on Korean exchanges
      for (const prospect of ctx.prospects) {
        if (!prospect.symbol || !listedSymbols.has(prospect.symbol.toUpperCase())) continue;

        // Check if the prospect had a dead_korean_presence signal (no community)
        // or check if it was NOT found to have a Korean TG (not in our checked set)
        const normName = normalizeForMatch(prospect.name);
        const hasCommunitySignal = signals.some(
          s => s.prospect_id === prospect.id && s.signal_type === 'dead_korean_presence'
        );

        // If listed on exchange but has dead TG, emit the combined signal
        if (hasCommunitySignal) {
          const config = SIGNAL_WEIGHTS.korea_exchange_no_community;
          signals.push({
            prospect_id: prospect.id,
            project_name: prospect.name,
            signal_type: 'korea_exchange_no_community',
            headline: `${prospect.name} listed on Korean exchange but no active Korean community`,
            snippet: `${prospect.name} is actively traded on Korean exchanges (Upbit/Bithumb) but has no functioning Korean community. Korean retail is buying blind. "Korean traders make up significant volume but you have zero Korean content."`,
            source_url: `https://upbit.com/exchange?code=CRIX.UPBIT.KRW-${prospect.symbol}`,
            source_name: 'exchange_analysis',
            relevancy_weight: config.weight,
            tier: config.tier,
            shelf_life_days: config.shelf_life_days,
            expires_at: new Date(Date.now() + config.shelf_life_days * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      }
    } catch (err) {
      console.error('Exchange community cross-reference error:', err);
    }

    return signals;
  },
};
