import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { searchDuckDuckGo, searchKoreanSignals, scrapeFullArticles } from '@/lib/signals/webScraper';
import { analyzeArticles, analyzeSearchResults } from '@/lib/signals/claudeAnalyzer';

export const dynamic = 'force-dynamic';
export const maxDuration = 180; // Allow up to 3 minutes for full scan with all modes

// ─── Signal weights ───
const SIGNAL_WEIGHTS: Record<string, number> = {
  exchange_listing: 40,    // Listed on Korean exchange
  korea_partnership: 35,   // Partnership with Korean company
  korea_hiring: 30,        // Hiring for Korean market roles
  korea_community: 30,     // Launching Korean community
  korea_event: 25,         // Participating in Korean events
  korea_localization: 25,  // Adding Korean language support
  social_presence: 20,     // Korean social media activity
  news_mention: 25,        // Mentioned in Korean crypto news
  news_mention_2: 15,      // Second mention (diminishing)
  news_mention_3: 10,      // Third+ mention
};

// ─── Blacklist: major/common tokens to skip during discovery ───
// These are too generic or too large to be useful prospects
const SKIP_TOKENS = new Set([
  'BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'BUSD', 'DAI', 'TUSD', 'USDP',
  'XRP', 'SOL', 'ADA', 'DOGE', 'DOT', 'MATIC', 'SHIB', 'TRX', 'AVAX',
  'WBTC', 'WETH', 'STETH', 'LINK', 'UNI', 'LTC', 'BCH', 'LEO', 'ATOM',
  'ETC', 'XLM', 'FIL', 'HBAR', 'ICP', 'NEAR', 'APT',
]);

// Common English words that shouldn't be treated as project names
const SKIP_WORDS = new Set([
  'bitcoin', 'ethereum', 'crypto', 'blockchain', 'market', 'price', 'token',
  'trading', 'exchange', 'wallet', 'defi', 'nft', 'web3', 'altcoin',
  'bull', 'bear', 'rally', 'crash', 'pump', 'dump', 'whale', 'mining',
  'staking', 'yield', 'airdrop', 'regulation', 'sec', 'fed', 'etf',
  'halving', 'futures', 'spot', 'leverage', 'short', 'long', 'liquidation',
  'korea', 'korean', 'global', 'digital', 'asset', 'assets', 'report',
  'analysis', 'update', 'news', 'the', 'for', 'and', 'from', 'china',
  'trump', 'iran', 'usa', 'japan',
]);

// ─── Korean exchange token fetchers ───

async function fetchUpbitTokens(): Promise<{ name: string; symbol: string; market: string }[]> {
  try {
    const res = await fetch('https://api.upbit.com/v1/market/all?is_details=true', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || [])
      .filter((m: any) => m.market?.startsWith('KRW-'))
      .map((m: any) => ({
        name: m.english_name || '',
        symbol: m.market?.replace('KRW-', '') || '',
        market: m.market || '',
      }));
  } catch (err) {
    console.error('Error fetching Upbit tokens:', err);
    return [];
  }
}

async function fetchBithumbTokens(): Promise<{ symbol: string }[]> {
  try {
    const res = await fetch('https://api.bithumb.com/public/ticker/ALL_KRW', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== '0000' || !data.data) return [];
    return Object.keys(data.data)
      .filter(k => k !== 'date')
      .map(symbol => ({ symbol: symbol.toUpperCase() }));
  } catch (err) {
    console.error('Error fetching Bithumb tokens:', err);
    return [];
  }
}

// ─── Korean news RSS fetchers ───

interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function parseRSSItems(xml: string): RSSItem[] {
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

async function fetchTokenPostRSS(): Promise<RSSItem[]> {
  try {
    const res = await fetch('https://www.tokenpost.kr/rss', {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSSItems(xml);
  } catch (err) {
    console.error('Error fetching TokenPost RSS:', err);
    return [];
  }
}

async function fetchBlockMediaRSS(): Promise<RSSItem[]> {
  try {
    const res = await fetch('https://www.blockmedia.co.kr/feed/', {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSSItems(xml);
  } catch (err) {
    console.error('Error fetching BlockMedia RSS:', err);
    return [];
  }
}

// ─── CoinGecko enrichment ───

interface CoinGeckoResult {
  name: string;
  symbol: string;
  category: string | null;
  market_cap: number | null;
  price: number | null;
  volume_24h: number | null;
  logo_url: string | null;
  source_url: string;
}

async function searchCoinGecko(query: string): Promise<CoinGeckoResult | null> {
  try {
    // Step 1: Search for the coin
    const searchRes = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
    );
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();

    const coin = searchData.coins?.[0];
    if (!coin) return null;

    // Step 2: Get market data for the top result
    const marketRes = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coin.id}&order=market_cap_desc&per_page=1&page=1`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
    );
    if (!marketRes.ok) {
      // Return basic info without market data
      return {
        name: coin.name,
        symbol: (coin.symbol || '').toUpperCase(),
        category: null,
        market_cap: coin.market_cap_rank ? null : null,
        price: null,
        volume_24h: null,
        logo_url: coin.large || coin.thumb || null,
        source_url: `https://www.coingecko.com/en/coins/${coin.id}`,
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
    };
  } catch (err) {
    console.error(`CoinGecko search error for "${query}":`, err);
    return null;
  }
}

// ─── Name extraction from Korean news ───

/**
 * Extracts potential project names from Korean crypto news headlines.
 * Korean articles typically include English project names inline.
 * Examples:
 *   "아비트럼(Arbitrum), 한국 커뮤니티 출시" → ["Arbitrum"]
 *   "Sui Network, 한국 시장 진출 발표" → ["Sui Network"]
 *   "AAVE 거버넌스 논란" → ["AAVE"]
 */
function extractProjectNames(title: string, description: string): string[] {
  const text = `${title} ${description}`;
  const names: string[] = [];
  const seen = new Set<string>();

  // Pattern 1: English names in parentheses — 한글(EnglishName)
  const parenRegex = /[가-힣]+\(([A-Z][A-Za-z0-9\s]{1,25})\)/g;
  let match;
  while ((match = parenRegex.exec(text)) !== null) {
    const name = match[1].trim();
    if (isValidProjectName(name) && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      names.push(name);
    }
  }

  // Pattern 2: Capitalized English words/phrases (2+ chars, at start or after punctuation/Korean)
  // Matches: "Sui Network", "Aave", "Chainlink", "Layer Zero"
  const capRegex = /(?:^|[,\s·…""''()[\]|/])((?:[A-Z][A-Za-z0-9]+(?:\s[A-Z][A-Za-z0-9]+){0,2}))/g;
  while ((match = capRegex.exec(text)) !== null) {
    const name = match[1].trim();
    if (isValidProjectName(name) && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      names.push(name);
    }
  }

  // Pattern 3: ALL-CAPS tokens (3-10 chars) — "AAVE", "ARB", "OP", "SUI"
  const allCapsRegex = /(?:^|[\s,.()])([A-Z]{3,10})(?:$|[\s,.])/g;
  while ((match = allCapsRegex.exec(text)) !== null) {
    const symbol = match[1].trim();
    if (!SKIP_TOKENS.has(symbol) && !SKIP_WORDS.has(symbol.toLowerCase()) && !seen.has(symbol.toLowerCase())) {
      seen.add(symbol.toLowerCase());
      names.push(symbol);
    }
  }

  return names;
}

function isValidProjectName(name: string): boolean {
  if (name.length < 2 || name.length > 30) return false;
  if (SKIP_WORDS.has(name.toLowerCase())) return false;
  // Skip if it's a common English word pattern
  if (/^(The|A|An|In|On|At|For|To|Of|By|With|From|And|Or|But|Not|Is|Are|Was|Were|Has|Have|Had|Can|Could|Would|Should|May|Might|Must|Will|Shall)$/i.test(name)) return false;
  // Must contain at least one letter
  if (!/[A-Za-z]/.test(name)) return false;
  return true;
}

// ─── Name matching utilities ───

function normalizeForMatch(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findProspectMatch(
  projectName: string,
  projectSymbol: string,
  prospects: { id: string; name: string; symbol: string | null }[]
): { id: string; name: string } | null {
  const normName = normalizeForMatch(projectName);
  const normSymbol = normalizeForMatch(projectSymbol);

  for (const p of prospects) {
    const pName = normalizeForMatch(p.name);
    const pSymbol = normalizeForMatch(p.symbol || '');

    if (pName === normName && normName.length > 0) return { id: p.id, name: p.name };
    if (pSymbol === normSymbol && normSymbol.length >= 2) return { id: p.id, name: p.name };
    if (normName.length >= 4 && (pName.includes(normName) || normName.includes(pName))) {
      return { id: p.id, name: p.name };
    }
  }
  return null;
}

function findNewsMatches(
  title: string,
  description: string,
  prospects: { id: string; name: string; symbol: string | null }[]
): { id: string; name: string }[] {
  const matches: { id: string; name: string }[] = [];
  const text = `${title} ${description}`.toLowerCase();

  for (const p of prospects) {
    const name = p.name.toLowerCase();
    const symbol = (p.symbol || '').toLowerCase();

    if (name.length >= 3 && text.includes(name)) {
      matches.push({ id: p.id, name: p.name });
    } else if (symbol.length >= 3) {
      const symbolRegex = new RegExp(`(?:^|[\\s,.()])${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[\\s,.()])`, 'i');
      if (symbolRegex.test(` ${title} ${description} `)) {
        matches.push({ id: p.id, name: p.name });
      }
    }
  }
  return matches;
}

// ─── Main scanner ───

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();

    // Allow cron-triggered scans to bypass user auth
    const cronSecret = request.headers.get('x-cron-secret');
    const isCron = cronSecret && (cronSecret === process.env.CRON_SECRET || cronSecret === 'dev');

    if (!isCron) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scanStartTime = Date.now();

    // Parse options
    const body = await request.json().catch(() => ({}));
    const discover = body.discover !== false; // Default: true — discover new prospects
    // Scan modes: api (default), web (DuckDuckGo + full articles), claude (AI analysis)
    const modes: string[] = body.modes || ['api'];
    const useApi = modes.includes('api');
    const useWeb = modes.includes('web');
    const useClaude = modes.includes('claude');
    // Recency filter: how many months back to include articles (default: 1)
    const recencyMonths: number = Math.max(1, Math.min(12, body.recency_months || 1));

    // 0. Deactivate expired signals so they don't show up in dashboard
    await supabase
      .from('prospect_signals')
      .update({ is_active: false })
      .eq('is_active', true)
      .lt('expires_at', new Date().toISOString());

    // 1. Fetch all prospects
    const { data: allProspects, error: pError } = await supabase
      .from('prospects')
      .select('id, name, symbol, status');
    if (pError) return NextResponse.json({ error: pError.message }, { status: 500 });
    let prospects = allProspects || [];

    // Build a set of existing prospect names/symbols for fast lookup
    const existingNames = new Set(prospects.map(p => normalizeForMatch(p.name)));
    const existingSymbols = new Set(prospects.filter(p => p.symbol).map(p => normalizeForMatch(p.symbol!)));

    // 2. Fetch existing signals to avoid duplicates (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existingSignals } = await supabase
      .from('prospect_signals')
      .select('prospect_id, signal_type, source_name, headline')
      .gte('detected_at', sevenDaysAgo);
    const existingSet = new Set(
      (existingSignals || []).map(s => `${s.prospect_id}|${s.signal_type}|${s.source_name}|${s.headline?.substring(0, 100)}`)
    );

    // 3. Run fetchers based on modes
    // API mode always fetches exchange data + RSS headlines
    // Web/Claude modes also need RSS for article URLs
    const needsRSS = useApi || useWeb || useClaude;
    const needsExchanges = useApi;

    const [upbitTokens, bithumbTokens, tokenPostItems, blockMediaItems] = await Promise.all([
      needsExchanges ? fetchUpbitTokens() : Promise.resolve([]),
      needsExchanges ? fetchBithumbTokens() : Promise.resolve([]),
      needsRSS ? fetchTokenPostRSS() : Promise.resolve([]),
      needsRSS ? fetchBlockMediaRSS() : Promise.resolve([]),
    ]);

    // Filter RSS items to only recent articles (based on recency_months)
    const RECENCY_CUTOFF_MS = recencyMonths * 30 * 24 * 60 * 60 * 1000;
    const filterRecent = (items: RSSItem[]): RSSItem[] => {
      const cutoff = Date.now() - RECENCY_CUTOFF_MS;
      return items.filter(item => {
        if (!item.pubDate) return true; // If no date, include it (better safe)
        const pubTime = new Date(item.pubDate).getTime();
        // If date parsing fails, include the item
        if (isNaN(pubTime)) return true;
        return pubTime >= cutoff;
      });
    };
    const recentTokenPostItems = filterRecent(tokenPostItems);
    const recentBlockMediaItems = filterRecent(blockMediaItems);

    const newSignals: any[] = [];
    const prospectScoreMap = new Map<string, { signals: number; maxWeight: number; totalWeight: number }>();

    const addSignal = (signal: any) => {
      const key = `${signal.prospect_id}|${signal.signal_type}|${signal.source_name}|${signal.headline?.substring(0, 100)}`;
      if (existingSet.has(key)) return;
      existingSet.add(key);
      newSignals.push(signal);

      if (signal.prospect_id) {
        const current = prospectScoreMap.get(signal.prospect_id) || { signals: 0, maxWeight: 0, totalWeight: 0 };
        current.signals++;
        current.totalWeight += signal.relevancy_weight;
        current.maxWeight = Math.max(current.maxWeight, signal.relevancy_weight);
        prospectScoreMap.set(signal.prospect_id, current);
      }
    };

    // ═══════════════════════════════════════════
    // PHASE A: API — Cross-reference existing prospects
    // ═══════════════════════════════════════════

    // Track unmatched tokens/names for discovery (declared outside API mode so Phase B can access them)
    const unmatchedUpbitTokens: { name: string; symbol: string; market: string }[] = [];
    const unmatchedBithumbSymbols: string[] = [];
    const unmatchedNewsNames: { name: string; article: RSSItem; source: string }[] = [];

    if (useApi) { // BEGIN API MODE

    // 4. Cross-reference Upbit listings with prospects
    for (const token of upbitTokens) {
      const match = findProspectMatch(token.name, token.symbol, prospects);
      if (match) {
        addSignal({
          prospect_id: match.id,
          project_name: match.name,
          signal_type: 'exchange_listing',
          headline: `Listed on Upbit (${token.market})`,
          snippet: `${match.name} (${token.symbol}) is actively traded on Upbit's KRW market — the largest Korean exchange by volume.`,
          source_url: `https://upbit.com/exchange?code=CRIX.UPBIT.${token.market}`,
          source_name: 'upbit',
          relevancy_weight: SIGNAL_WEIGHTS.exchange_listing,
          expires_at: null,
        });
      } else if (discover && !SKIP_TOKENS.has(token.symbol)) {
        unmatchedUpbitTokens.push(token);
      }
    }

    // 5. Cross-reference Bithumb listings with prospects
    const bithumbSymbols = new Set(bithumbTokens.map(t => t.symbol));

    for (const p of prospects) {
      if (p.symbol && bithumbSymbols.has(p.symbol.toUpperCase())) {
        bithumbSymbols.delete(p.symbol.toUpperCase()); // Mark as matched
        addSignal({
          prospect_id: p.id,
          project_name: p.name,
          signal_type: 'exchange_listing',
          headline: `Listed on Bithumb (${p.symbol}/KRW)`,
          snippet: `${p.name} (${p.symbol}) is actively traded on Bithumb — one of Korea's top exchanges.`,
          source_url: `https://www.bithumb.com/react/trade/order/${p.symbol}-KRW`,
          source_name: 'bithumb',
          relevancy_weight: SIGNAL_WEIGHTS.exchange_listing,
          expires_at: null,
        });
      }
    }
    // Remaining bithumbSymbols are unmatched
    if (discover) {
      for (const sym of bithumbSymbols) {
        if (!SKIP_TOKENS.has(sym)) unmatchedBithumbSymbols.push(sym);
      }
    }

    // 6–7. Scan news for prospect mentions — also collect unmatched names
    const allNewsItems = [
      ...recentTokenPostItems.map(item => ({ item, source: 'tokenpost' })),
      ...recentBlockMediaItems.map(item => ({ item, source: 'blockmedia' })),
    ];

    for (const { item, source } of allNewsItems) {
      const matches = findNewsMatches(item.title, item.description, prospects);
      for (const match of matches) {
        const existingCount = newSignals.filter(
          s => s.prospect_id === match.id && s.signal_type === 'news_mention'
        ).length;
        const weightKey = existingCount === 0 ? 'news_mention' : existingCount === 1 ? 'news_mention_2' : 'news_mention_3';

        addSignal({
          prospect_id: match.id,
          project_name: match.name,
          signal_type: 'news_mention',
          headline: item.title.substring(0, 300),
          snippet: item.description.substring(0, 500),
          source_url: item.link,
          source_name: source,
          relevancy_weight: SIGNAL_WEIGHTS[weightKey] || 10,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      // If no matches found, try to extract project names for discovery
      if (discover && matches.length === 0) {
        const extractedNames = extractProjectNames(item.title, item.description);
        for (const name of extractedNames) {
          // Check if this name is already in our prospects (using normalized matching)
          const normName = normalizeForMatch(name);
          if (!existingNames.has(normName) && !existingSymbols.has(normName)) {
            unmatchedNewsNames.push({ name, article: item, source });
          }
        }
      }
    }

    } // END API MODE

    // ═══════════════════════════════════════════
    // PHASE B: Discover new prospects (API mode)
    // ═══════════════════════════════════════════

    let discovered = 0;
    let discoveryErrors = 0;
    const discoveredNames = new Set<string>(); // Avoid duplicate CoinGecko lookups

    if (discover) {
      // Deduplicate discovery candidates
      const discoveryQueue: { name: string; symbol?: string; signalType: string; signalData: any }[] = [];

      // Add unmatched Upbit tokens (highest priority — exchange listing)
      for (const token of unmatchedUpbitTokens) {
        const normName = normalizeForMatch(token.name);
        if (!discoveredNames.has(normName) && !existingNames.has(normName)) {
          discoveredNames.add(normName);
          discoveryQueue.push({
            name: token.name,
            symbol: token.symbol,
            signalType: 'exchange_listing',
            signalData: {
              headline: `Listed on Upbit (KRW-${token.symbol})`,
              snippet: `${token.name} (${token.symbol}) is actively traded on Upbit's KRW market — the largest Korean exchange by volume. Discovered via signal scan.`,
              source_url: `https://upbit.com/exchange?code=CRIX.UPBIT.${token.market}`,
              source_name: 'upbit',
              relevancy_weight: SIGNAL_WEIGHTS.exchange_listing,
            },
          });
        }
      }

      // Add unmatched Bithumb tokens
      for (const sym of unmatchedBithumbSymbols) {
        const normSym = normalizeForMatch(sym);
        if (!discoveredNames.has(normSym)) {
          discoveredNames.add(normSym);
          discoveryQueue.push({
            name: sym, // Will search CoinGecko by symbol
            symbol: sym,
            signalType: 'exchange_listing',
            signalData: {
              headline: `Listed on Bithumb (${sym}/KRW)`,
              snippet: `${sym} is actively traded on Bithumb — one of Korea's top exchanges. Discovered via signal scan.`,
              source_url: `https://www.bithumb.com/react/trade/order/${sym}-KRW`,
              source_name: 'bithumb',
              relevancy_weight: SIGNAL_WEIGHTS.exchange_listing,
            },
          });
        }
      }

      // Add unmatched news mentions (lower priority, cap to avoid too many API calls)
      const newsDiscoveryCap = 10; // Max new prospects to discover from news per scan
      let newsDiscoveryCount = 0;
      for (const { name, article, source } of unmatchedNewsNames) {
        if (newsDiscoveryCount >= newsDiscoveryCap) break;
        const normName = normalizeForMatch(name);
        if (!discoveredNames.has(normName) && !existingNames.has(normName)) {
          discoveredNames.add(normName);
          discoveryQueue.push({
            name,
            signalType: 'news_mention',
            signalData: {
              headline: article.title.substring(0, 300),
              snippet: article.description.substring(0, 500),
              source_url: article.link,
              source_name: source,
              relevancy_weight: SIGNAL_WEIGHTS.news_mention,
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            },
          });
          newsDiscoveryCount++;
        }
      }

      // Process discovery queue — cap at 20 to avoid long scan times
      // Exchange tokens already have name/symbol from the API, so CoinGecko is optional enrichment
      const DISCOVERY_CAP = 20;
      const queueToProcess = discoveryQueue.slice(0, DISCOVERY_CAP);

      for (const candidate of queueToProcess) {
        try {
          // For exchange listings, we already have name+symbol — skip CoinGecko to save time
          // For news discoveries, try CoinGecko for enrichment
          let finalData: any = null;
          if (candidate.signalType !== 'exchange_listing') {
            const searchQuery = candidate.symbol || candidate.name;
            finalData = await searchCoinGecko(searchQuery);
            await new Promise(r => setTimeout(r, 1200)); // Rate limit
          }

          // Create the prospect (works even without CoinGecko data)
          const prospectData: any = {
            name: finalData?.name || candidate.name,
            symbol: finalData?.symbol || candidate.symbol || null,
            category: finalData?.category || null,
            market_cap: finalData?.market_cap || null,
            price: finalData?.price || null,
            volume_24h: finalData?.volume_24h || null,
            logo_url: finalData?.logo_url || null,
            source_url: finalData?.source_url || null,
            source: 'signal_discovery',
            status: 'needs_review',
            scraped_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const { data: insertedProspect, error: insertError } = await supabase
            .from('prospects')
            .upsert(prospectData, { onConflict: 'name,source' })
            .select('id, name')
            .single();

          if (insertError) {
            console.error(`Failed to create prospect for "${candidate.name}":`, insertError.message);
            discoveryErrors++;
            continue;
          }

          if (insertedProspect) {
            // Add to prospects array so future matches in this scan can find it
            prospects.push({ id: insertedProspect.id, name: insertedProspect.name, symbol: prospectData.symbol, status: 'needs_review' });
            existingNames.add(normalizeForMatch(insertedProspect.name));
            if (prospectData.symbol) existingSymbols.add(normalizeForMatch(prospectData.symbol));

            // Create the signal with the prospect linked
            addSignal({
              prospect_id: insertedProspect.id,
              project_name: insertedProspect.name,
              signal_type: candidate.signalType,
              ...candidate.signalData,
            });

            discovered++;
          }

          // Rate limit only if we actually called CoinGecko
          // (exchange listings skip CoinGecko, so no delay needed)
        } catch (err) {
          console.error(`Discovery error for "${candidate.name}":`, err);
          discoveryErrors++;
        }
      }
    }

    // ═══════════════════════════════════════════
    // PHASE D: Web Scraping (DuckDuckGo + full articles)
    // ═══════════════════════════════════════════

    let webSearchResults = 0;
    let webArticlesScraped = 0;
    const webDiscoveredProjects: string[] = [];
    const WEB_DISCOVERY_CAP = 10; // Cap web-discovered prospects to avoid CoinGecko timeout
    let webDiscoveryCount = 0;

    // Shared article cache — reused by Claude mode if both are enabled
    let scrapedArticlesCache: Awaited<ReturnType<typeof scrapeFullArticles>> | null = null;

    if (useWeb) {
      // D1. Search DuckDuckGo for Korean crypto signals
      const searchResults = await searchKoreanSignals(5, 10);
      webSearchResults = searchResults.length;

      // D2. Extract project names from search results using regex
      for (const result of searchResults) {
        if (webDiscoveryCount >= WEB_DISCOVERY_CAP) break;
        const names = extractProjectNames(result.title, result.snippet);
        for (const name of names) {
          if (webDiscoveryCount >= WEB_DISCOVERY_CAP) break;
          const normName = normalizeForMatch(name);
          if (!existingNames.has(normName) && !existingSymbols.has(normName) && !discoveredNames.has(normName)) {
            discoveredNames.add(normName);
            webDiscoveredProjects.push(name);

            // Enrich via CoinGecko and create prospect
            try {
              const coinData = await searchCoinGecko(name);
              if (coinData) {
                const prospectData: any = {
                  name: coinData.name,
                  symbol: coinData.symbol || null,
                  category: coinData.category || null,
                  market_cap: coinData.market_cap || null,
                  price: coinData.price || null,
                  volume_24h: coinData.volume_24h || null,
                  logo_url: coinData.logo_url || null,
                  source_url: coinData.source_url || null,
                  source: 'signal_discovery',
                  status: 'needs_review',
                  scraped_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };

                const { data: inserted } = await supabase
                  .from('prospects')
                  .upsert(prospectData, { onConflict: 'name,source' })
                  .select('id, name')
                  .single();

                if (inserted) {
                  prospects.push({ id: inserted.id, name: inserted.name, symbol: prospectData.symbol, status: 'needs_review' });
                  existingNames.add(normalizeForMatch(inserted.name));

                  addSignal({
                    prospect_id: inserted.id,
                    project_name: inserted.name,
                    signal_type: 'news_mention',
                    headline: `Found via web search: ${result.title.substring(0, 200)}`,
                    snippet: result.snippet.substring(0, 500),
                    source_url: result.url,
                    source_name: 'web_search',
                    relevancy_weight: SIGNAL_WEIGHTS.news_mention,
                    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                  });
                  discovered++;
                  webDiscoveryCount++;
                }
              }
              await new Promise(r => setTimeout(r, 1200)); // CoinGecko rate limit
            } catch (err) {
              discoveryErrors++;
            }
          }
        }
      }

      // D3. Scrape full articles from recent RSS links (cache for reuse by Claude mode)
      const rssLinks = [
        ...recentTokenPostItems.map(item => ({ link: item.link, source: 'tokenpost' })),
        ...recentBlockMediaItems.map(item => ({ link: item.link, source: 'blockmedia' })),
      ];
      const fullArticles = await scrapeFullArticles(rssLinks, 10);
      scrapedArticlesCache = fullArticles;
      webArticlesScraped = fullArticles.length;

      // D4. Extract project names from full article bodies (richer content = better extraction)
      for (const article of fullArticles) {
        const names = extractProjectNames(article.title, article.body);
        for (const name of names) {
          const normName = normalizeForMatch(name);
          // Check if this matches an existing prospect
          const match = findProspectMatch(name, '', prospects);
          if (match) {
            // Add signal for existing prospect
            addSignal({
              prospect_id: match.id,
              project_name: match.name,
              signal_type: 'news_mention',
              headline: article.title.substring(0, 300),
              snippet: article.body.substring(0, 500),
              source_url: article.url,
              source_name: `${article.source}_web`,
              relevancy_weight: SIGNAL_WEIGHTS.news_mention,
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            });
          } else if (discover && webDiscoveryCount < WEB_DISCOVERY_CAP && !existingNames.has(normName) && !discoveredNames.has(normName)) {
            // Discover new prospect (capped to avoid CoinGecko timeout)
            discoveredNames.add(normName);
            try {
              const coinData = await searchCoinGecko(name);
              if (coinData) {
                const { data: inserted } = await supabase
                  .from('prospects')
                  .upsert({
                    name: coinData.name, symbol: coinData.symbol || null,
                    category: coinData.category || null, market_cap: coinData.market_cap || null,
                    price: coinData.price || null, volume_24h: coinData.volume_24h || null,
                    logo_url: coinData.logo_url || null, source_url: coinData.source_url || null,
                    source: 'signal_discovery', status: 'needs_review',
                    scraped_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                  }, { onConflict: 'name,source' })
                  .select('id, name').single();

                if (inserted) {
                  prospects.push({ id: inserted.id, name: inserted.name, symbol: coinData.symbol || null, status: 'needs_review' });
                  existingNames.add(normalizeForMatch(inserted.name));
                  addSignal({
                    prospect_id: inserted.id,
                    project_name: inserted.name,
                    signal_type: 'news_mention',
                    headline: article.title.substring(0, 300),
                    snippet: article.body.substring(0, 500),
                    source_url: article.url,
                    source_name: `${article.source}_web`,
                    relevancy_weight: SIGNAL_WEIGHTS.news_mention,
                    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                  });
                  discovered++;
                  webDiscoveryCount++;
                }
              }
              await new Promise(r => setTimeout(r, 1200));
            } catch { discoveryErrors++; }
          }
        }
      }
    }

    // ═══════════════════════════════════════════
    // PHASE E: Claude AI Analysis
    // ═══════════════════════════════════════════

    let claudeArticlesAnalyzed = 0;
    let claudeSignalsFound = 0;
    let claudeCost = 0;
    let claudeTokensUsed = 0;
    const CLAUDE_DISCOVERY_CAP = 10;
    let claudeDiscoveryCount = 0;

    if (useClaude) {
      // E1. Reuse cached articles from web mode, or scrape fresh
      let articlesToAnalyze;
      if (scrapedArticlesCache && scrapedArticlesCache.length > 0) {
        // Reuse articles already scraped in Phase D — no duplicate fetching
        articlesToAnalyze = scrapedArticlesCache;
      } else {
        // Scrape fresh from recent articles (only when web mode didn't run)
        const rssLinks = [
          ...recentTokenPostItems.map(item => ({ link: item.link, source: 'tokenpost' })),
          ...recentBlockMediaItems.map(item => ({ link: item.link, source: 'blockmedia' })),
        ];
        articlesToAnalyze = await scrapeFullArticles(rssLinks, 10);
      }

      // E2. Send articles to Claude for analysis (cap at 10 for speed)
      const analysisResult = await analyzeArticles(articlesToAnalyze, 10);
      claudeArticlesAnalyzed = analysisResult.articlesAnalyzed;
      claudeCost = analysisResult.totalCost;
      claudeTokensUsed = analysisResult.totalTokens;

      // E3. Process Claude-identified signals
      for (const signal of analysisResult.allSignals) {
        claudeSignalsFound++;
        const normName = normalizeForMatch(signal.project_name);

        // Try to match with existing prospect
        const match = findProspectMatch(signal.project_name, '', prospects);

        if (match) {
          // Add signal for existing prospect — use proper weight for signal type
          const signalWeight = SIGNAL_WEIGHTS[signal.signal_type] ||
            (signal.urgency === 'high' ? 30 : signal.urgency === 'medium' ? 20 : 15);

          addSignal({
            prospect_id: match.id,
            project_name: match.name,
            signal_type: signal.signal_type,
            headline: signal.headline.substring(0, 300),
            snippet: `${signal.evidence}\n\n💡 ${signal.korea_relevance_reason}`.substring(0, 500),
            source_url: signal.article_url,
            source_name: `${signal.article_source}_claude`,
            relevancy_weight: signalWeight,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          });
        } else if (discover && claudeDiscoveryCount < CLAUDE_DISCOVERY_CAP && !existingNames.has(normName) && !discoveredNames.has(normName)) {
          // Discover new prospect via Claude analysis (capped)
          discoveredNames.add(normName);
          try {
            const coinData = await searchCoinGecko(signal.project_name);
            const prospectName = coinData?.name || signal.project_name;
            const { data: inserted } = await supabase
              .from('prospects')
              .upsert({
                name: prospectName,
                symbol: coinData?.symbol || null,
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
              }, { onConflict: 'name,source' })
              .select('id, name').single();

            if (inserted) {
              prospects.push({ id: inserted.id, name: inserted.name, symbol: coinData?.symbol || null, status: 'needs_review' });
              existingNames.add(normalizeForMatch(inserted.name));

              const discSignalWeight = SIGNAL_WEIGHTS[signal.signal_type] ||
                (signal.urgency === 'high' ? 30 : signal.urgency === 'medium' ? 20 : 15);

              addSignal({
                prospect_id: inserted.id,
                project_name: inserted.name,
                signal_type: signal.signal_type,
                headline: signal.headline.substring(0, 300),
                snippet: `${signal.evidence}\n\n💡 ${signal.korea_relevance_reason}`.substring(0, 500),
                source_url: signal.article_url,
                source_name: `${signal.article_source}_claude`,
                relevancy_weight: discSignalWeight,
                expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              });
              discovered++;
              claudeDiscoveryCount++;
            }
            await new Promise(r => setTimeout(r, 1200));
          } catch { discoveryErrors++; }
        }
      }

      // E4. Claude Research — proactively search for Korea-expansion signals
      // These are targeted queries that find projects entering the Korean market,
      // not just general Korean crypto news
      const RESEARCH_QUERIES = [
        'crypto project "Korean community" Telegram Kakao launch',
        'blockchain "Korea partnership" Samsung Kakao LINE',
        'crypto project "Korea Blockchain Week" event speaker',
        'web3 project hiring "Korean" community manager',
        'crypto "Korean language" localization support',
        'blockchain project Seoul office opening',
        '"Upbit listing" OR "Bithumb listing" new project',
        'crypto project Korea expansion marketing',
      ];

      // Run 4 research queries (keep it fast)
      const researchQueries = RESEARCH_QUERIES.slice(0, 4);
      const researchResults: { title: string; url: string; snippet: string }[] = [];
      const seenResearchUrls = new Set<string>();

      for (const query of researchQueries) {
        const results = await searchDuckDuckGo(query, 8);
        for (const r of results) {
          if (!seenResearchUrls.has(r.url)) {
            seenResearchUrls.add(r.url);
            researchResults.push(r);
          }
        }
        await new Promise(r => setTimeout(r, 800));
      }

      if (researchResults.length > 0) {
        const researchAnalysis = await analyzeSearchResults(researchResults);
        claudeCost += researchAnalysis.cost_usd;
        claudeTokensUsed += researchAnalysis.tokens_used;

        for (const signal of researchAnalysis.signals) {
          claudeSignalsFound++;
          const normName = normalizeForMatch(signal.project_name);
          const match = findProspectMatch(signal.project_name, '', prospects);

          // Use the proper weight for the signal type
          const signalWeight = SIGNAL_WEIGHTS[signal.signal_type] ||
            (signal.urgency === 'high' ? 30 : signal.urgency === 'medium' ? 20 : 15);

          if (match) {
            addSignal({
              prospect_id: match.id,
              project_name: match.name,
              signal_type: signal.signal_type,
              headline: signal.headline.substring(0, 300),
              snippet: `${signal.evidence}\n\n💡 ${signal.korea_relevance_reason}`.substring(0, 500),
              source_url: '',
              source_name: 'claude_research',
              relevancy_weight: signalWeight,
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            });
          } else if (discover && claudeDiscoveryCount < CLAUDE_DISCOVERY_CAP && !existingNames.has(normName) && !discoveredNames.has(normName)) {
            discoveredNames.add(normName);
            try {
              const coinData = await searchCoinGecko(signal.project_name);
              const prospectName = coinData?.name || signal.project_name;
              const { data: ins } = await supabase
                .from('prospects')
                .upsert({
                  name: prospectName, symbol: coinData?.symbol || null,
                  category: coinData?.category || null, market_cap: coinData?.market_cap || null,
                  price: coinData?.price || null, volume_24h: coinData?.volume_24h || null,
                  logo_url: coinData?.logo_url || null, source_url: coinData?.source_url || null,
                  source: 'signal_discovery', status: 'needs_review',
                  scraped_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                }, { onConflict: 'name,source' })
                .select('id, name').single();

              if (ins) {
                prospects.push({ id: ins.id, name: ins.name, symbol: coinData?.symbol || null, status: 'needs_review' });
                existingNames.add(normalizeForMatch(ins.name));
                addSignal({
                  prospect_id: ins.id,
                  project_name: ins.name,
                  signal_type: signal.signal_type,
                  headline: signal.headline.substring(0, 300),
                  snippet: `${signal.evidence}\n\n💡 ${signal.korea_relevance_reason}`.substring(0, 500),
                  source_url: '',
                  source_name: 'claude_research',
                  relevancy_weight: signalWeight,
                  expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                });
                discovered++;
                claudeDiscoveryCount++;
              }
              await new Promise(r => setTimeout(r, 1200));
            } catch { discoveryErrors++; }
          }
        }
      }
    }

    // ═══════════════════════════════════════════
    // PHASE F: Store signals & update scores
    // ═══════════════════════════════════════════

    // 8. Insert new signals in batches
    let inserted = 0;
    for (let i = 0; i < newSignals.length; i += 100) {
      const batch = newSignals.slice(i, i + 100);
      const { error } = await supabase.from('prospect_signals').insert(batch);
      if (!error) inserted += batch.length;
      else console.error('Signal insert error:', error.message);
    }

    // 9. Recalculate korea_relevancy_score for all affected prospects
    const affectedIds = [...prospectScoreMap.keys()];
    if (affectedIds.length > 0) {
      for (const prospectId of affectedIds) {
        const { data: allSignals } = await supabase
          .from('prospect_signals')
          .select('signal_type, relevancy_weight, is_active')
          .eq('prospect_id', prospectId)
          .eq('is_active', true);

        let totalScore = 0;
        const signalsByType = new Map<string, number[]>();

        for (const s of allSignals || []) {
          const existing = signalsByType.get(s.signal_type) || [];
          existing.push(s.relevancy_weight);
          signalsByType.set(s.signal_type, existing);
        }

        for (const [, weights] of signalsByType) {
          weights.sort((a, b) => b - a);
          weights.forEach((w, i) => {
            totalScore += i === 0 ? w : Math.max(5, Math.floor(w * (0.5 ** i)));
          });
        }

        const finalScore = Math.min(100, totalScore);
        const signalCount = (allSignals || []).length;

        await supabase
          .from('prospects')
          .update({
            korea_relevancy_score: finalScore,
            korea_signal_count: signalCount,
            last_signal_scan: new Date().toISOString(),
          })
          .eq('id', prospectId);
      }
    }

    // 10. Update last_signal_scan for prospects that were scanned but had no signals
    await supabase
      .from('prospects')
      .update({ last_signal_scan: new Date().toISOString() })
      .is('last_signal_scan', null);

    const scanDurationMs = Date.now() - scanStartTime;

    return NextResponse.json({
      success: true,
      modes,
      recency_months: recencyMonths,
      scan_duration_ms: scanDurationMs,
      scan_duration_seconds: Math.round(scanDurationMs / 1000),
      scanned: {
        prospects: prospects.length,
        upbit_tokens: upbitTokens.length,
        bithumb_tokens: bithumbTokens.length,
        tokenpost_articles: recentTokenPostItems.length,
        blockmedia_articles: recentBlockMediaItems.length,
        total_rss_articles: tokenPostItems.length + blockMediaItems.length,
        filtered_recent_articles: recentTokenPostItems.length + recentBlockMediaItems.length,
      },
      signals_found: newSignals.length,
      signals_inserted: inserted,
      prospects_with_signals: affectedIds.length,
      discovery: {
        new_prospects: discovered,
        errors: discoveryErrors,
        candidates_checked: discoveredNames.size,
      },
      web: useWeb ? {
        search_results: webSearchResults,
        articles_scraped: webArticlesScraped,
        projects_discovered: webDiscoveredProjects.length,
      } : undefined,
      claude: useClaude ? {
        articles_analyzed: claudeArticlesAnalyzed,
        signals_found: claudeSignalsFound,
        cost_usd: Math.round(claudeCost * 10000) / 10000,
        tokens_used: claudeTokensUsed,
      } : undefined,
    });
  } catch (error: any) {
    console.error('Signal scan error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
