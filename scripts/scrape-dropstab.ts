#!/usr/bin/env npx ts-node

/**
 * DropsTab Scraper — Fetches cryptocurrency projects and imports as prospects
 *
 * Usage:
 *   npx ts-node scripts/scrape-dropstab.ts --count 50
 *   npx ts-node scripts/scrape-dropstab.ts --count 100 --start-page 2
 *   npx ts-node scripts/scrape-dropstab.ts --count 20 --with-links
 *
 * Options:
 *   --count N        How many projects to fetch (default: 50)
 *   --start-page N   Which page to start from (default: 1)
 *   --with-links     Also visit detail pages to grab social links (slower)
 *   --dry-run        Print results without saving to database
 *   --headless       Run browser in headless mode (default: true)
 *   --no-headless    Show the browser window (useful for debugging)
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// ============================================
// Config
// ============================================

const DROPSTAB_URL = 'https://dropstab.com';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface ScrapedProject {
  name: string;
  symbol?: string;
  category?: string;
  market_cap?: number | undefined;
  price?: number | undefined;
  volume_24h?: number | undefined;
  website_url?: string;
  twitter_url?: string;
  telegram_url?: string;
  discord_url?: string;
  logo_url?: string;
  source_url?: string;
  source: string;
}

// ============================================
// Helpers
// ============================================

function parseDollarValue(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[$,]/g, '').trim();
  // Handle T (trillion), B (billion), M (million), K (thousand)
  const match = cleaned.match(/^([\d.]+)\s*([TBMK])?$/i);
  if (!match) return parseFloat(cleaned) || undefined;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return undefined;
  const suffix = (match[2] || '').toUpperCase();
  switch (suffix) {
    case 'T': return num * 1e12;
    case 'B': return num * 1e9;
    case 'M': return num * 1e6;
    case 'K': return num * 1e3;
    default: return num;
  }
}

// ============================================
// Parse CLI args
// ============================================

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    count: 50,
    tab: 'all',
    withLinks: false,
    dryRun: false,
    headless: true,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--count': config.count = Math.min(parseInt(args[++i]) || 50, 100); break;
      case '--tab': config.tab = args[++i] || 'all'; break;
      case '--start-page': config.startPage = parseInt(args[++i]) || 1; break;
      case '--with-links': config.withLinks = true; break;
      case '--dry-run': config.dryRun = true; break;
      case '--headless': config.headless = true; break;
      case '--no-headless': config.headless = false; break;
    }
  }

  return config;
}

// ============================================
// Scraper
// ============================================

async function scrapeDropstab(config: ReturnType<typeof parseArgs>): Promise<ScrapedProject[]> {
  console.log(`\n🔍 DropsTab Scraper`);
  console.log(`   Count: ${config.count} | Tab: ${config.tab} | With Links: ${config.withLinks}\n`);

  const browser: Browser = await puppeteer.launch({
    headless: config.headless ? 'new' as any : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  });

  const page: Page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const projects: ScrapedProject[] = [];

  const TAB_CATEGORIES: Record<string, string> = {
    'all': '', 'memes': 'Memes', 'ai-agents': 'AI Agents',
    'by-raised-funds': 'Funded', 'token-buybacks': 'Token Buybacks',
    'perp': 'PERP DEX', 'airdrops': 'Airdrop', 'prediction-markets': 'Prediction',
    'listing-ec2yuflbg6': 'New Listing',
  };

  try {
    // Single page load — dropstab shows up to 100 per tab
    {
      const url = config.tab === 'all' ? DROPSTAB_URL : `${DROPSTAB_URL}/tab/${config.tab}`;
      console.log(`📄 Loading: ${url}`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Wait for the table to render (JS-rendered content)
      await page.waitForSelector('table tbody tr', { timeout: 30000 }).catch(() => {
        console.log('   ⚠️  Could not find table rows, trying to extract anyway...');
      });

      // Give dynamic content time to load
      await new Promise(r => setTimeout(r, 2000));

      // Extract project data from the page — auto-detect column layout from headers
      const pageProjects = await page.evaluate(() => {
        const results: any[] = [];

        // Detect column layout from headers
        const headers = document.querySelectorAll('table thead th');
        const colMap: Record<string, number> = {};
        headers.forEach((h, i) => {
          const text = h.textContent?.trim().toLowerCase() || '';
          if (text.includes('price') && !colMap.price) colMap.price = i;
          if (text.includes('market cap')) colMap.marketCap = i;
          if (text.includes('volume') || text.includes('vol')) colMap.volume = i;
          if (text.includes('fundraise') || text.includes('raised')) colMap.fundraise = i;
        });

        const rows = document.querySelectorAll('table tbody tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length < 3) return;

          // Find asset cell — contains the coin link
          let assetCell: Element | null = null;
          for (let i = 0; i < cells.length; i++) {
            if (cells[i].querySelector('a[href*="/coins/"]')) {
              assetCell = cells[i];
              break;
            }
          }
          if (!assetCell) return;

          const link = assetCell.querySelector('a[href*="/coins/"]') as HTMLAnchorElement | null;
          if (!link) return;

          const nameDiv = assetCell.querySelector('div[class*="truncate"][class*="mt-1"]') ||
                          assetCell.querySelector('div[class*="max-w-24"]');
          const symbolDiv = assetCell.querySelector('div[class*="max-w-"][class*="overflow-"]');
          const img = assetCell.querySelector('img') as HTMLImageElement | null;

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

      if (pageProjects.length === 0) {
        console.log('   ❌ No projects found on this page. Page structure may have changed.');
        console.log('   💡 Run with --no-headless to see the browser and inspect the page.');

        // Log the page HTML structure for debugging
        const bodyText = await page.evaluate(() => {
          const body = document.body;
          // Get first 2000 chars of visible text
          return body.innerText?.substring(0, 2000) || '';
        });
        console.log('\n   Page content preview:');
        console.log('   ' + bodyText.split('\n').slice(0, 20).join('\n   '));
        break;
      }

      // Process raw data
      for (const raw of pageProjects) {
        if (projects.length >= config.count) break;

        const project: ScrapedProject = {
          name: raw.name,
          symbol: raw.symbol,
          category: TAB_CATEGORIES[config.tab] || undefined,
          source_url: raw.source_url,
          logo_url: raw.logo_url,
          price: parseDollarValue(raw.price_raw),
          market_cap: parseDollarValue(raw.market_cap_raw),
          volume_24h: parseDollarValue(raw.volume_raw),
          source: 'dropstab',
        };

        projects.push(project);
      }

      console.log(`   ✅ Found ${pageProjects.length} projects (total: ${projects.length}/${config.count})`);
    }

    // Optionally fetch detail pages for social links
    if (config.withLinks) {
      console.log(`\n🔗 Fetching social links for ${projects.length} projects...`);
      let fetched = 0;

      for (const project of projects) {
        if (!project.source_url) continue;

        try {
          await page.goto(project.source_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await new Promise(r => setTimeout(r, 1000));

          const links = await page.evaluate(() => {
            const result: Record<string, string | undefined> = {};
            const skipDomains = ['dropstab.com', 'coingecko.com', 'coinmarketcap.com', 'github.com', 'medium.com', 'reddit.com', 'youtube.com', 'linkedin.com'];
            const allLinks = document.querySelectorAll('a[href]');

            allLinks.forEach(a => {
              const href = (a as HTMLAnchorElement).href;
              if (skipDomains.some(d => href.includes(d))) return;

              if ((href.includes('twitter.com/') || href.includes('x.com/')) && !result.twitter_url) {
                result.twitter_url = href;
              }
              if (href.includes('t.me/') && !result.telegram_url) {
                result.telegram_url = href;
              }
              if ((href.includes('discord.gg/') || href.includes('discord.com/invite/')) && !result.discord_url) {
                result.discord_url = href;
              }
            });

            // Website: find first external link that's not social/dropstab
            allLinks.forEach(a => {
              const href = (a as HTMLAnchorElement).href;
              if (result.website_url) return;
              if (!href.startsWith('http')) return;
              if (skipDomains.some(d => href.includes(d))) return;
              if (href.includes('twitter.com') || href.includes('x.com') || href.includes('t.me') || href.includes('discord')) return;
              if (href.includes('etherscan.io') || href.includes('bscscan.com') || href.includes('snowtrace.io')) return;
              result.website_url = href;
            });

            // Category: look for "#N in Category" pattern
            const allSpans = document.querySelectorAll('span');
            allSpans.forEach(s => {
              const t = s.textContent?.trim() || '';
              const catMatch = t.match(/^#\d+ in (.+)$/);
              if (catMatch && !result.category) {
                result.category = catMatch[1];
              }
            });

            return result;
          });

          if (links.twitter_url) project.twitter_url = links.twitter_url;
          if (links.telegram_url) project.telegram_url = links.telegram_url;
          if (links.discord_url) project.discord_url = links.discord_url;
          if (links.website_url) project.website_url = links.website_url;
          if (links.category) project.category = links.category;

          fetched++;
          if (fetched % 10 === 0) console.log(`   📎 Fetched links: ${fetched}/${projects.length}`);

          // Rate limit between detail pages
          await new Promise(r => setTimeout(r, 800));
        } catch (err) {
          console.log(`   ⚠️  Failed to fetch links for ${project.name}`);
        }
      }

      console.log(`   ✅ Fetched links for ${fetched} projects`);
    }
  } finally {
    await browser.close();
  }

  return projects;
}

// ============================================
// Database import
// ============================================

async function importToDatabase(projects: ScrapedProject[]): Promise<{ inserted: number; errors: number }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`\n💾 Importing ${projects.length} prospects to database...`);

  let inserted = 0, errors = 0;
  const batchSize = 50;

  for (let i = 0; i < projects.length; i += batchSize) {
    const batch = projects.slice(i, i + batchSize).map(p => ({
      name: p.name,
      symbol: p.symbol || null,
      category: p.category || null,
      market_cap: p.market_cap || null,
      price: p.price || null,
      volume_24h: p.volume_24h || null,
      website_url: p.website_url || null,
      twitter_url: p.twitter_url || null,
      telegram_url: p.telegram_url || null,
      discord_url: p.discord_url || null,
      logo_url: p.logo_url || null,
      source_url: p.source_url || null,
      source: 'dropstab',
      scraped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('prospects')
      .upsert(batch, { onConflict: 'name,source' })
      .select('id');

    if (error) {
      console.error(`   ❌ Batch error:`, error.message);
      errors += batch.length;
    } else {
      inserted += data?.length || 0;
    }
  }

  return { inserted, errors };
}

// ============================================
// Main
// ============================================

async function main() {
  const config = parseArgs();

  try {
    const projects = await scrapeDropstab(config);

    if (projects.length === 0) {
      console.log('\n❌ No projects scraped. Exiting.');
      process.exit(1);
    }

    console.log(`\n📊 Scraped ${projects.length} projects`);

    if (config.dryRun) {
      console.log('\n🔍 Dry run — not saving to database. Sample:\n');
      projects.slice(0, 5).forEach((p, i) => {
        console.log(`${i + 1}. ${p.name} (${p.symbol || '?'})`);
        console.log(`   Market Cap: ${p.market_cap ? '$' + p.market_cap.toLocaleString() : '—'}`);
        console.log(`   Category: ${p.category || '—'}`);
        console.log(`   Website: ${p.website_url || '—'}`);
        console.log(`   Twitter: ${p.twitter_url || '—'}`);
        console.log(`   Source: ${p.source_url || '—'}`);
        console.log('');
      });
      if (projects.length > 5) console.log(`   ... and ${projects.length - 5} more\n`);
    } else {
      const result = await importToDatabase(projects);
      console.log(`\n✅ Done! Imported: ${result.inserted} | Errors: ${result.errors}`);
    }
  } catch (error: any) {
    console.error('\n❌ Scraper error:', error.message);
    process.exit(1);
  }
}

main();
