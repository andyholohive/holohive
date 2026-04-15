import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ─── Korean VC List ───

const KOREAN_VCS: { name: string; aliases: string[] }[] = [
  { name: 'Hashed', aliases: ['hashed', '#hashed', 'hashed ventures'] },
  { name: 'Dunamu / Upbit Ventures', aliases: ['dunamu', 'upbit ventures', 'dunamu & partners'] },
  { name: 'Kakao Ventures', aliases: ['kakao ventures', 'kakao investment', 'kakao'] },
  { name: 'Spartan Group', aliases: ['spartan group', 'spartan capital'] },
  { name: 'Klaytn Foundation', aliases: ['klaytn foundation', 'klaytn', 'kaia foundation'] },
  { name: 'NEOPIN', aliases: ['neopin'] },
  { name: 'Block Crafters', aliases: ['block crafters', 'blockcrafters'] },
  { name: 'Hashed Emergent', aliases: ['hashed emergent', '#hashed emergent'] },
  { name: 'Nonce', aliases: ['nonce', 'nonce capital'] },
  { name: 'KB Investment', aliases: ['kb investment', 'kb securities', 'kb financial'] },
  { name: 'Samsung Next', aliases: ['samsung next', 'samsung ventures'] },
  { name: 'Hyundai', aliases: ['hyundai', 'hyundai motor', 'hyundai ventures'] },
  { name: 'LG Technology Ventures', aliases: ['lg technology ventures', 'lg ventures'] },
  { name: 'Shinhan Bank', aliases: ['shinhan', 'shinhan bank', 'shinhan financial'] },
  { name: 'Mirae Asset', aliases: ['mirae asset', 'mirae'] },
  { name: 'Korea Investment Partners', aliases: ['korea investment partners', 'kip'] },
  { name: 'Danal Fintech', aliases: ['danal', 'danal fintech'] },
  { name: 'Coinone', aliases: ['coinone'] },
  { name: 'Hanwha', aliases: ['hanwha', 'hanwha investment'] },
  { name: 'CRIT Ventures', aliases: ['crit ventures', 'crit'] },
  { name: 'A41', aliases: ['a41'] },
  { name: 'Planetarium', aliases: ['planetarium', 'planetarium labs'] },
];

/**
 * Check if an investor string contains any Korean VCs
 */
function detectKoreanVCs(investorText: string): { found: boolean; vcs: string[] } {
  if (!investorText) return { found: false, vcs: [] };
  const lower = investorText.toLowerCase();
  const found: string[] = [];

  for (const vc of KOREAN_VCS) {
    for (const alias of vc.aliases) {
      if (lower.includes(alias)) {
        if (!found.includes(vc.name)) found.push(vc.name);
        break;
      }
    }
  }

  return { found: found.length > 0, vcs: found };
}

// ─── Helpers ───

function parseFundingAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,]/g, '').trim();
  const match = cleaned.match(/^([\d.]+)\s*([TBMK])?$/i);
  if (!match) return parseFloat(cleaned) || null;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  switch ((match[2] || '').toUpperCase()) {
    case 'T': return num * 1e12;
    case 'B': return num * 1e9;
    case 'M': return num * 1e6;
    case 'K': return num * 1e3;
    default: return num;
  }
}

// ─── Bing Search (reliable, no CAPTCHA) ───

async function searchFundingNews(query: string, maxResults: number = 10): Promise<{ title: string; url: string; snippet: string }[]> {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const results: { title: string; url: string; snippet: string }[] = [];

    // Bing result structure: <li class="b_algo"><h2><a href="URL">Title</a></h2><p class="b_lineclamp...">Snippet</p></li>
    const blockRegex = /<li[^>]*class="b_algo"[^>]*>([\s\S]*?)<\/li>/g;
    let blockMatch;
    while ((blockMatch = blockRegex.exec(html)) !== null && results.length < maxResults) {
      const block = blockMatch[1];

      // Extract URL and title from <h2><a href="...">Title</a></h2>
      const linkMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/);
      if (!linkMatch) continue;

      const resultUrl = linkMatch[1];
      const title = linkMatch[2].replace(/<[^>]*>/g, '').trim();

      // Extract snippet
      const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';

      if (title && resultUrl && !resultUrl.includes('bing.com') && !resultUrl.includes('microsoft.com')) {
        results.push({ title, url: resultUrl, snippet });
      }
    }
    return results;
  } catch (err) {
    console.error(`Bing search error for "${query}":`, err);
    return [];
  }
}

// ─── CryptoRank API (funded coins) ───

async function fetchCryptoRankFunded(limit: number = 50): Promise<{
  project_name: string;
  symbol: string;
  logo_url: string | null;
  market_cap: number | null;
  category: string | null;
  allocation_rounds: string[];
}[]> {
  try {
    const res = await fetch(
      `https://api.cryptorank.io/v0/coins?hasFundingRounds=true&limit=${limit}`,
      {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const coins = data.data || [];

    return coins
      .filter((c: any) => c.hasFundingRounds)
      .map((c: any) => {
        const ico = c.icoData || {};
        const alloc = ico.allocationChart || [];
        const roundKeywords = ['seed', 'series', 'private', 'strategic', 'presale', 'pre-sale', 'angel', 'venture', 'founding', 'public sale', 'ico', 'ido', 'ieo'];
        const rounds = alloc
          .map((a: any) => a.title)
          .filter((t: string) => roundKeywords.some(k => t.toLowerCase().includes(k)));

        return {
          project_name: c.name,
          symbol: c.symbol,
          logo_url: c.image?.x60 || null,
          market_cap: c.marketCap || null,
          category: c.category || null,
          allocation_rounds: rounds,
        };
      });
  } catch (err) {
    console.error('CryptoRank API error:', err);
    return [];
  }
}

// ─── Funding Search Queries ───

const FUNDING_QUERIES = [
  'crypto funding round 2026',
  'blockchain startup seed round 2026',
  'crypto series A funding 2026',
  'web3 fundraising round million',
  'crypto project raised funding investors 2026',
  '"Hashed" invested crypto 2026',
  '"Dunamu" portfolio crypto investment',
  'Korean VC crypto investment 2026',
  'crypto funding round Korea blockchain',
  'web3 strategic round investors 2026',
];

// ─── Claude Analysis ───

async function analyzeFundingResults(
  results: { title: string; url: string; snippet: string }[]
): Promise<{
  rounds: {
    project_name: string;
    round_type: string;
    amount_usd: number | null;
    investors: string;
    lead_investor: string | null;
    announced_date: string | null;
    source_url: string;
    evidence: string;
  }[];
  cost_usd: number;
  tokens_used: number;
}> {
  if (results.length === 0) return { rounds: [], cost_usd: 0, tokens_used: 0 };

  const { callClaude } = await import('@/lib/claude');

  const resultsList = results
    .map((r, i) => `${i + 1}. [${r.title}]\n   URL: ${r.url}\n   ${r.snippet}`)
    .join('\n\n');

  const systemPrompt = `You are a crypto funding round analyst. Your job is to extract structured funding data from search results about cryptocurrency and blockchain project fundraising.

EXTRACT THESE FIELDS:
- project_name: Exact project/protocol name
- round_type: One of: pre_seed, seed, series_a, series_b, series_c, strategic, private, public, token_sale, grant, undisclosed
- amount_usd: Amount raised in USD (number, null if unknown). Convert: $5M = 5000000, $200K = 200000
- investors: Comma-separated list of all investors/VCs mentioned
- lead_investor: The lead investor if mentioned, null otherwise
- announced_date: Date if mentioned (YYYY-MM-DD format), null otherwise
- evidence: Brief quote or detail from the search result

RULES:
- Only extract SPECIFIC funding rounds with concrete details
- Skip general market commentary or rumors
- Each entry should be a distinct funding event
- If multiple rounds for the same project, create separate entries
- Include the source_url from the search result

Respond ONLY with valid JSON:
{
  "rounds": [
    {
      "project_name": "ProjectName",
      "round_type": "seed",
      "amount_usd": 5000000,
      "investors": "Investor1, Investor2, Investor3",
      "lead_investor": "LeadInvestor",
      "announced_date": "2026-01-15",
      "source_url": "https://...",
      "evidence": "Brief evidence from the article"
    }
  ]
}`;

  try {
    const response = await callClaude(
      [systemPrompt],
      `Analyze these search results for crypto funding round information:\n\n${resultsList}\n\nExtract all funding rounds. If none found, return {"rounds": []}.`,
      {
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 2048,
        temperature: 0.1,
      }
    );

    let rounds: any[] = [];
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        rounds = parsed.rounds || [];
      }
    } catch {
      rounds = [];
    }

    return {
      rounds,
      cost_usd: response.cost_usd,
      tokens_used: response.usage.input_tokens + response.usage.output_tokens,
    };
  } catch (err) {
    console.error('Claude funding analysis error:', err);
    return { rounds: [], cost_usd: 0, tokens_used: 0 };
  }
}

// ─── Name Matching ───

function normalizeProjectName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function findOrCreateProspect(
  supabaseAdmin: any,
  projectName: string
): Promise<string | null> {
  const normalized = normalizeProjectName(projectName);

  // Try exact match first
  const { data: exact } = await supabaseAdmin
    .from('prospects')
    .select('id')
    .ilike('name', projectName)
    .limit(1);

  if (exact && exact.length > 0) return exact[0].id;

  // Try fuzzy match — check if normalized name is contained
  const { data: all } = await supabaseAdmin
    .from('prospects')
    .select('id, name')
    .limit(5000);

  if (all) {
    for (const p of all) {
      const pNorm = normalizeProjectName(p.name);
      if (pNorm === normalized || pNorm.includes(normalized) || normalized.includes(pNorm)) {
        return p.id;
      }
    }
  }

  // Create new prospect
  const { data: created, error } = await supabaseAdmin
    .from('prospects')
    .insert({
      name: projectName,
      source: 'funding_radar',
      status: 'new',
      scraped_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    // Might be a conflict — try fetching again
    const { data: retry } = await supabaseAdmin
      .from('prospects')
      .select('id')
      .ilike('name', projectName)
      .limit(1);
    return retry?.[0]?.id || null;
  }

  return created?.id || null;
}

/**
 * POST /api/prospects/funding/scan — Scan for new funding rounds
 * Body: { maxQueries?: number }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const maxQueries = Math.min(body.maxQueries || 5, 10);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ─── Phase 1: Scrape Dropstab "by-raised-funds" tab (primary source) ───
    const dropstabRounds: any[] = [];
    let dropstabCount = 0;
    const isLocal = (request.headers.get('host') || '').includes('localhost') || (request.headers.get('host') || '').includes('127.0.0.1');

    if (isLocal) {
      console.log('[Funding Radar] Scraping Dropstab fundraising data...');
      try {
        let puppeteer: any;
        try {
          puppeteer = (await import('puppeteer')).default;
        } catch {
          console.log('[Funding Radar] Puppeteer not available, skipping Dropstab');
        }

        if (puppeteer) {
          const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          });

          try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 900 });
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            await page.goto('https://dropstab.com/tab/by-raised-funds', {
              waitUntil: 'domcontentloaded',
              timeout: 60000,
            });
            await page.waitForSelector('table tbody tr', { timeout: 30000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 3000));

            const scraped = await page.evaluate(() => {
              const results: any[] = [];

              // Detect column layout
              const headers = document.querySelectorAll('table thead th');
              const colMap: Record<string, number> = {};
              headers.forEach((h: any, i: number) => {
                const text = h.textContent?.trim().toLowerCase() || '';
                if (text.includes('price') && !colMap.price) colMap.price = i;
                if (text.includes('market cap')) colMap.marketCap = i;
                if (text.includes('fundraise') || text.includes('raised')) colMap.fundraise = i;
              });

              const rows = document.querySelectorAll('table tbody tr');
              rows.forEach((row: any) => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 3) return;

                let assetCell = null;
                for (let i = 0; i < cells.length; i++) {
                  if (cells[i].querySelector('a[href*="/coins/"]')) {
                    assetCell = cells[i];
                    break;
                  }
                }
                if (!assetCell) return;

                const link = assetCell.querySelector('a[href*="/coins/"]');
                if (!link) return;

                const nameDiv = assetCell.querySelector('div[class*="truncate"][class*="mt-1"]') ||
                                assetCell.querySelector('div[class*="max-w-24"]');
                const symbolDiv = assetCell.querySelector('div[class*="max-w-"][class*="overflow-"]');
                const img = assetCell.querySelector('img');

                const name = nameDiv?.textContent?.trim() || '';
                let symbol = symbolDiv?.textContent?.trim() || '';
                symbol = symbol.replace(/^\d+/, '');

                if (!name && !symbol) return;

                const fundraiseText = colMap.fundraise !== undefined
                  ? cells[colMap.fundraise]?.textContent?.trim()
                  : '';
                const mcapText = colMap.marketCap !== undefined
                  ? cells[colMap.marketCap]?.textContent?.trim()
                  : '';
                const priceText = colMap.price !== undefined
                  ? cells[colMap.price]?.textContent?.trim()
                  : '';

                results.push({
                  name: name || symbol,
                  symbol: symbol || undefined,
                  source_url: link.href,
                  logo_url: img?.src || undefined,
                  fundraise_raw: fundraiseText || undefined,
                  market_cap_raw: mcapText || undefined,
                  price_raw: priceText || undefined,
                });
              });
              return results;
            });

            console.log(`[Funding Radar] Dropstab scraped ${scraped.length} funded projects`);
            dropstabCount = scraped.length;

            for (const raw of scraped) {
              const fundraiseAmount = parseFundingAmount(raw.fundraise_raw);
              dropstabRounds.push({
                project_name: raw.name,
                round_type: 'undisclosed',
                amount_usd: fundraiseAmount,
                investors: '',
                lead_investor: null,
                announced_date: null,
                source_url: raw.source_url || null,
                evidence: `Dropstab fundraise: ${raw.fundraise_raw || 'undisclosed'}`,
                _logo_url: raw.logo_url || null,
                _market_cap: parseFundingAmount(raw.market_cap_raw),
                _category: 'Funded',
                _symbol: raw.symbol || null,
                _source: 'dropstab',
              });
            }
          } finally {
            await browser.close();
          }
        }
      } catch (err: any) {
        console.error('[Funding Radar] Dropstab scrape error:', err.message);
      }
    } else {
      console.log('[Funding Radar] Not on localhost, skipping Dropstab (Puppeteer required)');
    }

    // ─── Phase 2: Search Bing for funding news (supplementary) ───
    const allResults: { title: string; url: string; snippet: string }[] = [];
    const seenUrls = new Set<string>();
    const queries = FUNDING_QUERIES.slice(0, maxQueries);

    console.log(`[Funding Radar] Searching ${queries.length} queries via Bing...`);
    for (const query of queries) {
      const results = await searchFundingNews(query, 10);
      for (const r of results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }
      await new Promise(r => setTimeout(r, 800));
    }
    console.log(`[Funding Radar] Found ${allResults.length} unique search results`);

    // ─── Phase 3: Fetch funded coins from CryptoRank API ───
    console.log('[Funding Radar] Fetching funded coins from CryptoRank...');
    const cryptoRankCoins = await fetchCryptoRankFunded(50);
    console.log(`[Funding Radar] CryptoRank returned ${cryptoRankCoins.length} funded coins`);

    // ─── Phase 4: Analyze Bing results with Claude (if any) ───
    let analysisRounds: any[] = [];
    let totalCost = 0;
    let totalTokens = 0;

    if (allResults.length > 0) {
      const analysis = await analyzeFundingResults(allResults);
      analysisRounds = analysis.rounds;
      totalCost += analysis.cost_usd;
      totalTokens += analysis.tokens_used;
      console.log(`[Funding Radar] Claude found ${analysisRounds.length} funding rounds from search`);
    }

    // Convert CryptoRank coins to funding rounds
    const cryptoRankRounds = cryptoRankCoins.map(coin => ({
      project_name: coin.project_name,
      round_type: coin.allocation_rounds.length > 0
        ? coin.allocation_rounds[0].toLowerCase().replace(/\s+/g, '_')
        : 'undisclosed',
      amount_usd: null as number | null,
      investors: '',
      lead_investor: null as string | null,
      announced_date: null as string | null,
      source_url: `https://cryptorank.io/price/${coin.project_name.toLowerCase().replace(/\s+/g, '-')}`,
      evidence: `Funded project (${coin.allocation_rounds.join(', ') || 'rounds undisclosed'})`,
      _logo_url: coin.logo_url,
      _market_cap: coin.market_cap,
      _category: coin.category,
      _symbol: coin.symbol,
      _source: 'cryptorank',
    }));

    // ─── Combine all rounds: Dropstab (primary) + Bing/Claude + CryptoRank ───
    const allRoundsCombined = [...dropstabRounds, ...analysisRounds, ...cryptoRankRounds];

    if (allRoundsCombined.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No funding rounds detected',
        dropstab_scraped: dropstabCount,
        search_results: allResults.length,
        cryptorank_coins: cryptoRankCoins.length,
        rounds_found: 0,
        rounds_saved: 0,
        korean_vc_found: 0,
        cost_usd: totalCost,
      });
    }

    // Phase 3: Process each round
    let roundsSaved = 0;
    let koreanVcFound = 0;
    const processedProjects = new Set<string>();

    for (const round of allRoundsCombined) {
      if (!round.project_name) continue;

      // Detect Korean VCs
      const koreanVcResult = detectKoreanVCs(round.investors || '');

      // Find or create prospect (with CryptoRank metadata if available)
      const prospectId = await findOrCreateProspect(supabaseAdmin, round.project_name);

      // If from CryptoRank, enrich the prospect with logo/market_cap/category
      if (prospectId && round._logo_url) {
        const enrichData: any = { updated_at: new Date().toISOString() };
        if (round._logo_url) enrichData.logo_url = round._logo_url;
        if (round._market_cap) enrichData.market_cap = round._market_cap;
        if (round._category) enrichData.category = round._category;
        if (round._symbol) enrichData.symbol = round._symbol;
        await supabaseAdmin.from('prospects').update(enrichData).eq('id', prospectId).is('logo_url', null);
      }

      // Save funding round
      const { error: roundError } = await supabaseAdmin
        .from('funding_rounds')
        .insert({
          prospect_id: prospectId,
          project_name: round.project_name,
          round_type: round.round_type || 'undisclosed',
          amount_usd: round.amount_usd || null,
          investors: round.investors || null,
          lead_investor: round.lead_investor || null,
          has_korean_vc: koreanVcResult.found,
          korean_vcs: koreanVcResult.vcs.length > 0 ? koreanVcResult.vcs.join(', ') : null,
          source_url: round.source_url || null,
          source: round._source || (round._logo_url ? 'cryptorank' : 'web'),
          announced_date: round.announced_date || null,
        });

      if (!roundError) roundsSaved++;
      if (koreanVcResult.found) koreanVcFound++;

      // Update prospect funding data (aggregate)
      if (prospectId && !processedProjects.has(prospectId)) {
        processedProjects.add(prospectId);

        // Get all rounds for this prospect to aggregate
        const { data: allRounds } = await supabaseAdmin
          .from('funding_rounds')
          .select('amount_usd, round_type, investors, has_korean_vc, korean_vcs, announced_date')
          .eq('prospect_id', prospectId)
          .order('detected_at', { ascending: false });

        if (allRounds && allRounds.length > 0) {
          const totalFunding = allRounds.reduce((sum: number, r: any) => sum + (Number(r.amount_usd) || 0), 0);
          const latestRound = allRounds[0];
          const allInvestors = new Set<string>();
          let hasKoreanVc = false;
          const koreanVcs = new Set<string>();

          for (const r of allRounds) {
            if (r.investors) {
              r.investors.split(',').forEach((inv: string) => allInvestors.add(inv.trim()));
            }
            if (r.has_korean_vc) {
              hasKoreanVc = true;
              if (r.korean_vcs) r.korean_vcs.split(',').forEach((v: string) => koreanVcs.add(v.trim()));
            }
          }

          await supabaseAdmin
            .from('prospects')
            .update({
              funding_total: totalFunding > 0 ? totalFunding : null,
              funding_round: latestRound.round_type,
              last_funding_date: latestRound.announced_date,
              investors: Array.from(allInvestors).slice(0, 20).join(', '),
              has_korean_vc: hasKoreanVc,
              updated_at: new Date().toISOString(),
            })
            .eq('id', prospectId);
        }
      }
    }

    return NextResponse.json({
      success: true,
      dropstab_scraped: dropstabCount,
      search_results: allResults.length,
      cryptorank_coins: cryptoRankCoins.length,
      rounds_found: allRoundsCombined.length,
      rounds_saved: roundsSaved,
      korean_vc_found: koreanVcFound,
      prospects_updated: processedProjects.size,
      cost_usd: totalCost,
      tokens_used: totalTokens,
    });
  } catch (error: any) {
    console.error('Funding scan error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
