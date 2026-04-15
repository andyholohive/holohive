/**
 * Scanner: Web Search (DuckDuckGo/Bing + Article Scraping)
 * Searches for Korean crypto market signals via web search and scrapes full articles.
 */

import type { ScannerModule, ScanContext, RawSignal } from '../types';
import { SIGNAL_WEIGHTS } from '../types';
import { searchKoreanSignals, scrapeFullArticles } from '../webScraper';
import { findProspectMatch, extractProjectNames, normalizeForMatch } from '../matching';
import { searchCoinGecko } from '../discovery';
import { passesQualityFilter } from '../matching';

export const webSearchScanner: ScannerModule = {
  id: 'web_search',
  name: 'Web Search + Article Scraping',
  cadence: 'weekly',
  requires: 'scraping',
  signalTypes: ['news_mention'],

  async scan(ctx: ScanContext): Promise<RawSignal[]> {
    const signals: RawSignal[] = [];
    const WEB_DISCOVERY_CAP = 15;
    let discoveryCount = 0;

    const existingNames = new Set(ctx.prospects.map(p => normalizeForMatch(p.name)));
    const existingSymbols = new Set(ctx.prospects.filter(p => p.symbol).map(p => normalizeForMatch(p.symbol!)));

    // D1. Search for Korean crypto signals
    const searchResults = await searchKoreanSignals(5, 10);
    ctx.metadata._webSearchResults = searchResults.length;

    // D2. Extract project names from search results
    for (const result of searchResults) {
      if (discoveryCount >= WEB_DISCOVERY_CAP) break;
      const names = extractProjectNames(result.title, result.snippet);
      for (const name of names) {
        if (discoveryCount >= WEB_DISCOVERY_CAP) break;
        const normName = normalizeForMatch(name);
        if (!existingNames.has(normName) && !existingSymbols.has(normName)) {
          existingNames.add(normName);

          try {
            const coinData = await searchCoinGecko(name);
            if (coinData && passesQualityFilter(name, coinData)) {
              const { data: inserted } = await ctx.supabase
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
                ctx.prospects.push({ id: inserted.id, name: inserted.name, symbol: coinData.symbol || null, status: 'needs_review' });
                signals.push({
                  prospect_id: inserted.id,
                  project_name: inserted.name,
                  signal_type: 'news_mention',
                  headline: `Found via web search: ${result.title.substring(0, 200)}`,
                  snippet: result.snippet.substring(0, 500),
                  source_url: result.url,
                  source_name: 'web_search',
                  relevancy_weight: SIGNAL_WEIGHTS.news_mention?.weight || 10,
                  tier: 3,
                  shelf_life_days: 7,
                  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                });
                discoveryCount++;
              }
            }
            await new Promise(r => setTimeout(r, 1200));
          } catch { /* skip */ }
        }
      }
    }

    // D3. Scrape full articles from recent RSS links
    const rssItems = (ctx.metadata._rssItems || []) as any[];
    const rssLinks = rssItems.map((r: any) => ({ link: r.item.link, source: r.source }));
    const fullArticles = await scrapeFullArticles(rssLinks, 10);
    ctx.metadata._scrapedArticlesCache = fullArticles;
    ctx.metadata._webArticlesScraped = fullArticles.length;

    // D4. Extract project names from full article bodies
    for (const article of fullArticles) {
      const names = extractProjectNames(article.title, article.body);
      for (const name of names) {
        const match = findProspectMatch(name, '', ctx.prospects);
        if (match) {
          signals.push({
            prospect_id: match.id,
            project_name: match.name,
            signal_type: 'news_mention',
            headline: article.title.substring(0, 300),
            snippet: article.body.substring(0, 500),
            source_url: article.url,
            source_name: `${article.source}_web`,
            relevancy_weight: SIGNAL_WEIGHTS.news_mention?.weight || 10,
            tier: 3,
            shelf_life_days: 7,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      }
    }

    return signals;
  },
};
