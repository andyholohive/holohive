import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function parseDollar(raw: string | undefined): number | null {
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

/**
 * POST /api/prospects/scrape — Run the DropsTab scraper (localhost only)
 * Body: { count?: number, startPage?: number, withLinks?: boolean }
 *
 * Uses Puppeteer — only works when running locally (not on Vercel).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check if we're on localhost
    const host = request.headers.get('host') || '';
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    if (!isLocal) {
      return NextResponse.json({
        error: 'Scraper only available locally. Run from localhost or use the CLI: npx ts-node scripts/scrape-dropstab.ts',
      }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const source = body.source || 'dropstab';

    // Route to the correct source handler
    if (source === 'coingecko') {
      return await fetchCoinGecko(body.count || 250, body.category);
    }
    if (source === 'defillama') {
      return await fetchDefiLlama(body.count || 500, body.category);
    }

    // Default: dropstab scraper
    const count = Math.min(body.count || 50, 100);
    const tab = body.tab || 'all';
    const withLinks = body.withLinks || false;

    // Dynamically import puppeteer (avoids Vercel bundling issues)
    let puppeteer: any;
    try {
      puppeteer = (await import('puppeteer')).default;
    } catch {
      return NextResponse.json({ error: 'Puppeteer not available. Run: npm install puppeteer' }, { status: 500 });
    }

    const DROPSTAB_URL = 'https://dropstab.com';

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const projects: any[] = [];

    try {
      // Single page load — dropstab shows up to 100 per tab, no pagination
      {
        const url = tab === 'all' ? DROPSTAB_URL : `${DROPSTAB_URL}/tab/${tab}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        // Wait for the table to render (JS-rendered content)
        await page.waitForSelector('table tbody tr', { timeout: 30000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 3000));

        const pageProjects = await page.evaluate(() => {
          const results: any[] = [];

          // Detect column layout from headers
          const headers = document.querySelectorAll('table thead th');
          const colMap: Record<string, number> = {};
          headers.forEach((h: any, i: number) => {
            const text = h.textContent?.trim().toLowerCase() || '';
            if (text.includes('price') && !colMap.price) colMap.price = i;
            if (text.includes('market cap')) colMap.marketCap = i;
            if (text.includes('volume') || text.includes('vol')) colMap.volume = i;
            if (text.includes('fundraise') || text.includes('raised')) colMap.fundraise = i;
          });

          const rows = document.querySelectorAll('table tbody tr');
          rows.forEach((row: any) => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) return;

            // Find asset cell — contains the coin link
            let assetCell = null;
            let assetIdx = -1;
            for (let i = 0; i < cells.length; i++) {
              if (cells[i].querySelector('a[href*="/coins/"]')) {
                assetCell = cells[i];
                assetIdx = i;
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

            const priceText = colMap.price !== undefined ? cells[colMap.price]?.textContent?.trim() : '';
            const mcapText = colMap.marketCap !== undefined ? cells[colMap.marketCap]?.textContent?.trim() : '';
            const volText = colMap.volume !== undefined ? cells[colMap.volume]?.textContent?.trim() : '';

            results.push({
              name: name || symbol,
              symbol: symbol || undefined,
              source_url: link.href,
              logo_url: img?.src || undefined,
              price_raw: priceText || undefined,
              market_cap_raw: mcapText || undefined,
              volume_raw: volText || undefined,
            });
          });
          return results;
        });

        const TAB_CATEGORIES: Record<string, string> = {
          'all': '', 'memes': 'Memes', 'ai-agents': 'AI Agents',
          'by-raised-funds': 'Funded', 'token-buybacks': 'Token Buybacks',
          'perp': 'PERP DEX', 'airdrops': 'Airdrop', 'prediction-markets': 'Prediction',
          'listing-ec2yuflbg6': 'New Listing',
        };
        for (const raw of pageProjects) {
          if (projects.length >= count) break;
          projects.push({
            name: raw.name,
            symbol: raw.symbol || null,
            category: TAB_CATEGORIES[tab] || null,
            source_url: raw.source_url || null,
            logo_url: raw.logo_url || null,
            price: parseDollar(raw.price_raw),
            market_cap: parseDollar(raw.market_cap_raw),
            volume_24h: parseDollar(raw.volume_raw),
            source: 'dropstab',
          });
        }
      }

      // Fetch social links if requested
      if (withLinks) {
        for (const project of projects) {
          if (!project.source_url) continue;
          try {
            await page.goto(project.source_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(r => setTimeout(r, 1000));
            const links = await page.evaluate(() => {
              const result: any = {};
              const skip = ['dropstab.com', 'coingecko.com', 'coinmarketcap.com', 'github.com', 'medium.com', 'reddit.com', 'youtube.com', 'linkedin.com', 'etherscan.io', 'bscscan.com', 'snowtrace.io'];
              document.querySelectorAll('a[href]').forEach((a: any) => {
                const href = a.href;
                if (skip.some(d => href.includes(d))) return;
                if ((href.includes('twitter.com/') || href.includes('x.com/')) && !result.twitter_url) result.twitter_url = href;
                if (href.includes('t.me/') && !result.telegram_url) result.telegram_url = href;
                if ((href.includes('discord.gg/') || href.includes('discord.com/invite/')) && !result.discord_url) result.discord_url = href;
              });
              document.querySelectorAll('a[href]').forEach((a: any) => {
                if (result.website_url) return;
                const href = a.href;
                if (!href.startsWith('http')) return;
                if (skip.some(d => href.includes(d))) return;
                if (href.includes('twitter.com') || href.includes('x.com') || href.includes('t.me') || href.includes('discord')) return;
                result.website_url = href;
              });
              document.querySelectorAll('span').forEach((s: any) => {
                const t = s.textContent?.trim() || '';
                const m = t.match(/^#\d+ in (.+)$/);
                if (m && !result.category) result.category = m[1];
              });
              return result;
            });
            Object.assign(project, links);
            await new Promise(r => setTimeout(r, 800));
          } catch {}
        }
      }
    } finally {
      await browser.close();
    }

    if (projects.length === 0) {
      return NextResponse.json({ error: 'No projects found. Page structure may have changed.', scraped: 0 });
    }

    return await upsertProspects(projects);
  } catch (error: any) {
    console.error('Scraper error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// Shared upsert function
// ============================================

async function upsertProspects(projects: any[]) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let inserted = 0, errors = 0;
  const batchSize = 50;
  for (let i = 0; i < projects.length; i += batchSize) {
    const batch = projects.slice(i, i + batchSize).map((p: any) => ({
      ...p,
      scraped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabaseAdmin
      .from('prospects')
      .upsert(batch, { onConflict: 'name,source' })
      .select('id');

    if (error) { errors += batch.length; }
    else { inserted += data?.length || 0; }
  }

  return NextResponse.json({
    success: true,
    scraped: projects.length,
    inserted,
    errors,
  });
}

// ============================================
// CoinGecko — free API, up to 250 per page, no key needed
// ============================================

async function fetchCoinGecko(count: number, category?: string) {
  const projects: any[] = [];
  const perPage = Math.min(count, 250);
  const totalPages = Math.ceil(count / perPage);

  try {
    for (let page = 1; page <= totalPages && projects.length < count; page++) {
      const url = new URL('https://api.coingecko.com/api/v3/coins/markets');
      url.searchParams.set('vs_currency', 'usd');
      url.searchParams.set('order', 'market_cap_desc');
      url.searchParams.set('per_page', String(Math.min(perPage, count - projects.length)));
      url.searchParams.set('page', String(page));
      if (category) url.searchParams.set('category', category);

      const res = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
      });

      if (!res.ok) {
        if (res.status === 429) {
          // Rate limited — wait and retry
          await new Promise(r => setTimeout(r, 5000));
          page--; // Retry this page
          continue;
        }
        throw new Error(`CoinGecko API error: ${res.status}`);
      }

      const coins = await res.json();
      if (!Array.isArray(coins) || coins.length === 0) break;

      for (const coin of coins) {
        if (projects.length >= count) break;
        projects.push({
          name: coin.name,
          symbol: coin.symbol?.toUpperCase() || null,
          category: category ? category.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : null,
          market_cap: coin.market_cap || null,
          price: coin.current_price || null,
          volume_24h: coin.total_volume || null,
          logo_url: coin.image || null,
          source_url: `https://www.coingecko.com/en/coins/${coin.id}`,
          source: 'coingecko',
        });
      }

      // Rate limit: CoinGecko free tier = 10-30 req/min
      if (page < totalPages) await new Promise(r => setTimeout(r, 2500));
    }

    if (projects.length === 0) {
      return NextResponse.json({ error: 'No coins returned from CoinGecko', scraped: 0 });
    }

    return await upsertProspects(projects);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// DeFi Llama — free API, returns all protocols at once, no key needed
// ============================================

async function fetchDefiLlama(count: number, category?: string) {
  try {
    const res = await fetch('https://api.llama.fi/protocols', {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) throw new Error(`DeFi Llama API error: ${res.status}`);

    const protocols = await res.json();
    if (!Array.isArray(protocols)) throw new Error('Invalid DeFi Llama response');

    // Filter and sort
    let filtered = protocols.filter((p: any) => p.name && p.tvl > 0);
    if (category) {
      filtered = filtered.filter((p: any) =>
        p.category?.toLowerCase() === category.toLowerCase()
      );
    }
    filtered.sort((a: any, b: any) => (b.tvl || 0) - (a.tvl || 0));

    const projects: any[] = [];
    for (const proto of filtered) {
      if (projects.length >= count) break;
      projects.push({
        name: proto.name,
        symbol: proto.symbol?.toUpperCase() || null,
        category: proto.category || null,
        market_cap: proto.tvl || null, // Using TVL as market cap proxy for DeFi protocols
        price: null,
        volume_24h: null,
        website_url: proto.url || null,
        twitter_url: proto.twitter ? `https://twitter.com/${proto.twitter}` : null,
        logo_url: proto.logo || null,
        source_url: `https://defillama.com/protocol/${proto.slug}`,
        source: 'defillama',
      });
    }

    if (projects.length === 0) {
      return NextResponse.json({ error: 'No protocols returned from DeFi Llama', scraped: 0 });
    }

    return await upsertProspects(projects);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
