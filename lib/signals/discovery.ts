/**
 * Prospect discovery via CoinGecko enrichment.
 * Handles creating new prospects from unmatched tokens/names found during scanning.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProspectRef, ScanContext, RawSignal } from './types';
import { normalizeForMatch, passesQualityFilter } from './matching';

// ─── CoinGecko types and fetcher ───

export interface CoinGeckoResult {
  name: string;
  symbol: string;
  category: string | null;
  market_cap: number | null;
  price: number | null;
  volume_24h: number | null;
  logo_url: string | null;
  telegram_users: number | null;
  twitter_followers: number | null;
  source_url: string;
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
    if (res.status === 429 && attempt < maxRetries) {
      const delay = 2000 * Math.pow(2, attempt);
      console.log(`CoinGecko rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    return res;
  }
  return fetch(url, options);
}

export async function searchCoinGecko(query: string): Promise<CoinGeckoResult | null> {
  try {
    const searchRes = await fetchWithRetry(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();

    const coin = searchData.coins?.[0];
    if (!coin) return null;

    const [marketRes, communityRes] = await Promise.all([
      fetchWithRetry(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coin.id}&order=market_cap_desc&per_page=1&page=1`,
        { headers: { Accept: 'application/json' } }
      ),
      fetchWithRetry(
        `https://api.coingecko.com/api/v3/coins/${coin.id}?localization=false&tickers=false&market_data=false&community_data=true&developer_data=false`,
        { headers: { Accept: 'application/json' } }
      ).catch(() => null),
    ]);

    let telegramUsers: number | null = null;
    let twitterFollowers: number | null = null;
    if (communityRes && communityRes.ok) {
      try {
        const cd = await communityRes.json();
        telegramUsers = cd?.community_data?.telegram_channel_user_count || null;
        twitterFollowers = cd?.community_data?.twitter_followers || null;
      } catch {}
    }

    if (!marketRes.ok) {
      return {
        name: coin.name,
        symbol: (coin.symbol || '').toUpperCase(),
        category: null,
        market_cap: null,
        price: null,
        volume_24h: null,
        logo_url: coin.large || coin.thumb || null,
        source_url: `https://www.coingecko.com/en/coins/${coin.id}`,
        telegram_users: telegramUsers,
        twitter_followers: twitterFollowers,
      };
    }

    const marketData = await marketRes.json();
    const m = marketData?.[0];
    if (!m) {
      return {
        name: coin.name,
        symbol: (coin.symbol || '').toUpperCase(),
        category: null,
        market_cap: null,
        price: null,
        volume_24h: null,
        logo_url: coin.large || coin.thumb || null,
        source_url: `https://www.coingecko.com/en/coins/${coin.id}`,
        telegram_users: telegramUsers,
        twitter_followers: twitterFollowers,
      };
    }

    return {
      name: m.name || coin.name,
      symbol: (m.symbol || coin.symbol || '').toUpperCase(),
      category: null,
      market_cap: m.market_cap || null,
      price: m.current_price || null,
      volume_24h: m.total_volume || null,
      logo_url: m.image || coin.large || coin.thumb || null,
      source_url: `https://www.coingecko.com/en/coins/${coin.id}`,
      telegram_users: telegramUsers,
      twitter_followers: twitterFollowers,
    };
  } catch (err) {
    console.error(`CoinGecko search error for "${query}":`, err);
    return null;
  }
}

// ─── Discovery Logic ───

interface DiscoveryCandidate {
  name: string;
  symbol?: string;
  signalType: string;
  signalData: {
    headline: string;
    snippet?: string;
    source_url?: string;
    source_name: string;
    relevancy_weight: number;
    expires_at?: string;
  };
}

interface DiscoveryResult {
  created: number;
  errors: number;
  newProspects: ProspectRef[];
  signals: RawSignal[];
}

const DISCOVERY_CAP = 30;

/**
 * Process discovery from scanner metadata.
 * Scanners store unmatched tokens/names in ctx.metadata:
 *   _unmatchedUpbitTokens, _unmatchedBithumbSymbols, _unmatchedNewsNames
 * This function enriches them via CoinGecko and creates prospects.
 */
export async function processDiscoveryQueue(
  ctx: ScanContext,
  supabase: SupabaseClient,
): Promise<DiscoveryResult> {
  const result: DiscoveryResult = { created: 0, errors: 0, newProspects: [], signals: [] };

  const existingNames = new Set(ctx.prospects.map(p => normalizeForMatch(p.name)));
  const existingSymbols = new Set(ctx.prospects.filter(p => p.symbol).map(p => normalizeForMatch(p.symbol!)));
  const discoveredNames = new Set<string>();
  const queue: DiscoveryCandidate[] = [];

  // Collect unmatched Upbit tokens
  const unmatchedUpbit = (ctx.metadata._unmatchedUpbitTokens || []) as { name: string; symbol: string; market: string }[];
  for (const token of unmatchedUpbit) {
    const normName = normalizeForMatch(token.name);
    if (!discoveredNames.has(normName) && !existingNames.has(normName)) {
      discoveredNames.add(normName);
      queue.push({
        name: token.name,
        symbol: token.symbol,
        signalType: 'korea_community_mention',
        signalData: {
          headline: `Traded on Upbit (KRW-${token.symbol})`,
          snippet: `${token.name} (${token.symbol}) is traded on Upbit's KRW market. Discovered via signal scan.`,
          source_url: `https://upbit.com/exchange?code=CRIX.UPBIT.${token.market}`,
          source_name: 'upbit',
          relevancy_weight: 5,
        },
      });
    }
  }

  // Collect unmatched Bithumb symbols
  const unmatchedBithumb = (ctx.metadata._unmatchedBithumbSymbols || []) as string[];
  for (const sym of unmatchedBithumb) {
    const normSym = normalizeForMatch(sym);
    if (!discoveredNames.has(normSym)) {
      discoveredNames.add(normSym);
      queue.push({
        name: sym,
        symbol: sym,
        signalType: 'korea_community_mention',
        signalData: {
          headline: `Traded on Bithumb (${sym}/KRW)`,
          snippet: `${sym} is traded on Bithumb. Discovered via signal scan.`,
          source_url: `https://www.bithumb.com/react/trade/order/${sym}-KRW`,
          source_name: 'bithumb',
          relevancy_weight: 5,
        },
      });
    }
  }

  // Collect unmatched news names (cap at 15)
  const unmatchedNews = (ctx.metadata._unmatchedNewsNames || []) as { name: string; title: string; link: string; source: string }[];
  let newsCount = 0;
  for (const item of unmatchedNews) {
    if (newsCount >= 15) break;
    const normName = normalizeForMatch(item.name);
    if (!discoveredNames.has(normName) && !existingNames.has(normName)) {
      discoveredNames.add(normName);
      queue.push({
        name: item.name,
        signalType: 'news_mention',
        signalData: {
          headline: item.title?.substring(0, 300) || `News mention: ${item.name}`,
          source_url: item.link || '',
          source_name: item.source || 'news',
          relevancy_weight: 10,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      newsCount++;
    }
  }

  // Process queue
  const toProcess = queue.slice(0, DISCOVERY_CAP);

  for (const candidate of toProcess) {
    try {
      const searchQuery = candidate.symbol || candidate.name;
      const coinData = await searchCoinGecko(searchQuery);
      await new Promise(r => setTimeout(r, 1200)); // Rate limit

      if (!passesQualityFilter(candidate.name, coinData)) continue;

      const prospectData: any = {
        name: coinData?.name || candidate.name,
        symbol: coinData?.symbol || candidate.symbol || null,
        category: coinData?.category || null,
        market_cap: coinData?.market_cap || null,
        price: coinData?.price || null,
        volume_24h: coinData?.volume_24h || null,
        logo_url: coinData?.logo_url || null,
        source_url: coinData?.source_url || null,
        source: 'signal_discovery',
        status: 'needs_review',
        scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: inserted, error: insertError } = await supabase
        .from('prospects')
        .upsert(prospectData, { onConflict: 'name,source' })
        .select('id, name')
        .single();

      if (insertError) {
        console.error(`Failed to create prospect for "${candidate.name}":`, insertError.message);
        result.errors++;
        continue;
      }

      if (inserted) {
        const ref: ProspectRef = { id: inserted.id, name: inserted.name, symbol: prospectData.symbol, status: 'needs_review' };
        result.newProspects.push(ref);
        existingNames.add(normalizeForMatch(inserted.name));
        if (prospectData.symbol) existingSymbols.add(normalizeForMatch(prospectData.symbol));

        result.signals.push({
          prospect_id: inserted.id,
          project_name: inserted.name,
          signal_type: candidate.signalType,
          headline: candidate.signalData.headline,
          snippet: candidate.signalData.snippet,
          source_url: candidate.signalData.source_url,
          source_name: candidate.signalData.source_name,
          relevancy_weight: candidate.signalData.relevancy_weight,
          expires_at: candidate.signalData.expires_at,
        });

        // Auto-add community signal if TG community is sizable
        if (coinData?.telegram_users && coinData.telegram_users >= 1000) {
          result.signals.push({
            prospect_id: inserted.id,
            project_name: inserted.name,
            signal_type: 'korea_community_mention',
            headline: `Telegram community: ${coinData.telegram_users.toLocaleString()} members`,
            snippet: `${inserted.name} has a Telegram community of ${coinData.telegram_users.toLocaleString()} members${coinData.twitter_followers ? ` and ${coinData.twitter_followers.toLocaleString()} Twitter followers` : ''}.`,
            source_url: coinData.source_url || '',
            source_name: 'coingecko_community',
            relevancy_weight: 5,
            expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }

        result.created++;
      }
    } catch (err) {
      console.error(`Discovery error for "${candidate.name}":`, err);
      result.errors++;
    }
  }

  return result;
}
