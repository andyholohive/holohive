/**
 * Scanner: Korean News RSS Feeds
 * Fetches headlines from TokenPost and BlockMedia, matches against prospects.
 */

import type { ScannerModule, ScanContext, RawSignal } from '../types';
import { SIGNAL_WEIGHTS } from '../types';
import { findNewsMatches, extractProjectNames, normalizeForMatch } from '../matching';

// ─── RSS Types & Parser ───

export interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

export function parseRSSItems(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const getTag = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return (m?.[1] || m?.[2] || '').trim();
    };
    items.push({
      title: getTag('title'),
      link: getTag('link'),
      pubDate: getTag('pubDate'),
      description: getTag('description').replace(/<[^>]*>/g, '').substring(0, 500),
    });
  }
  return items;
}

export async function fetchTokenPostRSS(): Promise<RSSItem[]> {
  try {
    const res = await fetch('https://www.tokenpost.kr/rss', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    return parseRSSItems(await res.text());
  } catch (err) {
    console.error('Error fetching TokenPost RSS:', err);
    return [];
  }
}

export async function fetchBlockMediaRSS(): Promise<RSSItem[]> {
  try {
    const res = await fetch('https://www.blockmedia.co.kr/feed/', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    return parseRSSItems(await res.text());
  } catch (err) {
    console.error('Error fetching BlockMedia RSS:', err);
    return [];
  }
}

export const koreanNewsRSSScanner: ScannerModule = {
  id: 'korean_news_rss',
  name: 'Korean News RSS (TokenPost + BlockMedia)',
  cadence: 'daily',
  requires: 'api',
  signalTypes: ['news_mention'],

  async scan(ctx: ScanContext): Promise<RawSignal[]> {
    const signals: RawSignal[] = [];

    const [tokenPostItems, blockMediaItems] = await Promise.all([
      fetchTokenPostRSS(),
      fetchBlockMediaRSS(),
    ]);

    // Filter by recency
    const RECENCY_CUTOFF_MS = ctx.recencyMonths * 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - RECENCY_CUTOFF_MS;
    const filterRecent = (items: RSSItem[]): RSSItem[] =>
      items.filter(item => {
        if (!item.pubDate) return true;
        const pubTime = new Date(item.pubDate).getTime();
        return isNaN(pubTime) || pubTime >= cutoff;
      });

    const recentItems = [
      ...filterRecent(tokenPostItems).map(item => ({ item, source: 'tokenpost' })),
      ...filterRecent(blockMediaItems).map(item => ({ item, source: 'blockmedia' })),
    ];

    // Store items for reuse by web/claude scanners
    ctx.metadata._rssItems = recentItems;

    const unmatchedNewsNames: { name: string; title: string; link: string; source: string }[] = [];
    const newsSignalCounts = new Map<string, number>();
    const existingNames = new Set(ctx.prospects.map(p => normalizeForMatch(p.name)));
    const existingSymbols = new Set(ctx.prospects.filter(p => p.symbol).map(p => normalizeForMatch(p.symbol!)));

    for (const { item, source } of recentItems) {
      const matches = findNewsMatches(item.title, item.description, ctx.prospects);
      for (const match of matches) {
        const count = newsSignalCounts.get(match.id) || 0;
        newsSignalCounts.set(match.id, count + 1);

        const weight = count === 0 ? (SIGNAL_WEIGHTS.news_mention?.weight || 10)
          : count === 1 ? 7
          : 5;

        signals.push({
          prospect_id: match.id,
          project_name: match.name,
          signal_type: 'news_mention',
          headline: item.title.substring(0, 300),
          snippet: item.description.substring(0, 500),
          source_url: item.link,
          source_name: source,
          relevancy_weight: weight,
          tier: 3,
          shelf_life_days: 7,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      // Collect unmatched names for discovery
      if (matches.length === 0) {
        const extractedNames = extractProjectNames(item.title, item.description);
        for (const name of extractedNames) {
          const normName = normalizeForMatch(name);
          if (!existingNames.has(normName) && !existingSymbols.has(normName)) {
            unmatchedNewsNames.push({ name, title: item.title, link: item.link, source });
          }
        }
      }
    }

    ctx.metadata._unmatchedNewsNames = unmatchedNewsNames;

    return signals;
  },
};
