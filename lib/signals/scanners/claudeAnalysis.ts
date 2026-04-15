/**
 * Scanner: Claude AI Analysis
 * Sends articles to Claude for structured signal extraction.
 * Also runs targeted research queries for Korea-expansion signals.
 */

import type { ScannerModule, ScanContext, RawSignal } from '../types';
import { getSignalWeight, getShelfLife, getSignalTier } from '../types';
import { analyzeArticles, analyzeSearchResults } from '../claudeAnalyzer';
import { searchDuckDuckGo, scrapeFullArticles } from '../webScraper';
import { findProspectMatch, normalizeForMatch, passesQualityFilter } from '../matching';
import { searchCoinGecko } from '../discovery';

export const claudeAnalysisScanner: ScannerModule = {
  id: 'claude_analysis',
  name: 'Claude AI Signal Analysis',
  cadence: 'weekly',
  requires: 'api',
  signalTypes: [
    'korea_partnership', 'korea_community', 'korea_event', 'korea_localization',
    'korea_hiring', 'korea_job_posting', 'korea_collab', 'news_mention',
    'korea_intent_apac', 'korea_intent_vc', 'korea_intent_conference',
    'korea_intent_hiring', 'korea_intent_competitor', 'korea_intent_exchange',
    'korea_exchange_delisting', 'korea_regulatory_warning', 'korea_scam_alert',
    'tge_within_60d', 'mainnet_launch', 'airdrop_announcement', 'staking_defi_launch',
    'dao_asia_governance', 'ecosystem_asia_initiative', 'leadership_change',
    'web2_to_web3', 'accelerator_graduation', 'multi_chain_expansion',
    'funding_round_5m', 'korea_agency_present',
  ],

  async scan(ctx: ScanContext): Promise<RawSignal[]> {
    const signals: RawSignal[] = [];
    const DISCOVERY_CAP = 15;
    let discoveryCount = 0;
    let totalCost = 0;
    let totalTokens = 0;

    const existingNames = new Set(ctx.prospects.map(p => normalizeForMatch(p.name)));

    // E1. Reuse cached articles or scrape fresh
    let articlesToAnalyze = ctx.metadata._scrapedArticlesCache as any[] | undefined;
    if (!articlesToAnalyze || articlesToAnalyze.length === 0) {
      const rssItems = (ctx.metadata._rssItems || []) as any[];
      const rssLinks = rssItems.map((r: any) => ({ link: r.item.link, source: r.source }));
      articlesToAnalyze = await scrapeFullArticles(rssLinks, 10);
    }

    // E2. Send articles to Claude
    const analysisResult = await analyzeArticles(articlesToAnalyze, 10);
    totalCost += analysisResult.totalCost;
    totalTokens += analysisResult.totalTokens;

    // E3. Process Claude signals
    for (const signal of analysisResult.allSignals) {
      const match = findProspectMatch(signal.project_name, '', ctx.prospects);
      const signalWeight = getSignalWeight(signal.signal_type, signal.urgency);
      const shelfLife = getShelfLife(signal.signal_type);
      const tier = getSignalTier(signal.signal_type);

      if (match) {
        signals.push({
          prospect_id: match.id,
          project_name: match.name,
          signal_type: signal.signal_type,
          headline: signal.headline.substring(0, 300),
          snippet: `${signal.evidence}\n\n${signal.korea_relevance_reason}`.substring(0, 500),
          source_url: signal.article_url,
          source_name: `${signal.article_source}_claude`,
          relevancy_weight: signalWeight,
          tier,
          shelf_life_days: shelfLife,
          expires_at: new Date(Date.now() + shelfLife * 24 * 60 * 60 * 1000).toISOString(),
        });
      } else if (discoveryCount < DISCOVERY_CAP) {
        const normName = normalizeForMatch(signal.project_name);
        if (!existingNames.has(normName)) {
          existingNames.add(normName);
          try {
            const coinData = await searchCoinGecko(signal.project_name);
            const prospectName = coinData?.name || signal.project_name;
            if (!passesQualityFilter(prospectName, coinData)) continue;

            const { data: inserted } = await ctx.supabase
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

            if (inserted) {
              ctx.prospects.push({ id: inserted.id, name: inserted.name, symbol: coinData?.symbol || null, status: 'needs_review' });
              signals.push({
                prospect_id: inserted.id,
                project_name: inserted.name,
                signal_type: signal.signal_type,
                headline: signal.headline.substring(0, 300),
                snippet: `${signal.evidence}\n\n${signal.korea_relevance_reason}`.substring(0, 500),
                source_url: signal.article_url,
                source_name: `${signal.article_source}_claude`,
                relevancy_weight: signalWeight,
                tier,
                shelf_life_days: shelfLife,
                expires_at: new Date(Date.now() + shelfLife * 24 * 60 * 60 * 1000).toISOString(),
              });
              discoveryCount++;
            }
            await new Promise(r => setTimeout(r, 1200));
          } catch { /* skip */ }
        }
      }
    }

    // E4. Claude Research — proactively search for expansion signals
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

    const researchQueries = RESEARCH_QUERIES.slice(0, 4);
    const researchResults: { title: string; url: string; snippet: string }[] = [];
    const seenUrls = new Set<string>();

    for (const query of researchQueries) {
      const results = await searchDuckDuckGo(query, 8);
      for (const r of results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          researchResults.push(r);
        }
      }
      await new Promise(r => setTimeout(r, 800));
    }

    if (researchResults.length > 0) {
      const researchAnalysis = await analyzeSearchResults(researchResults);
      totalCost += researchAnalysis.cost_usd;
      totalTokens += researchAnalysis.tokens_used;

      for (const signal of researchAnalysis.signals) {
        const match = findProspectMatch(signal.project_name, '', ctx.prospects);
        const signalWeight = getSignalWeight(signal.signal_type, signal.urgency);
        const shelfLife = getShelfLife(signal.signal_type);
        const tier = getSignalTier(signal.signal_type);

        if (match) {
          signals.push({
            prospect_id: match.id,
            project_name: match.name,
            signal_type: signal.signal_type,
            headline: signal.headline.substring(0, 300),
            snippet: `${signal.evidence}\n\n${signal.korea_relevance_reason}`.substring(0, 500),
            source_url: '',
            source_name: 'claude_research',
            relevancy_weight: signalWeight,
            tier,
            shelf_life_days: shelfLife,
            expires_at: new Date(Date.now() + shelfLife * 24 * 60 * 60 * 1000).toISOString(),
          });
        } else if (discoveryCount < DISCOVERY_CAP) {
          const normName = normalizeForMatch(signal.project_name);
          if (!existingNames.has(normName)) {
            existingNames.add(normName);
            try {
              const coinData = await searchCoinGecko(signal.project_name);
              const prospectName = coinData?.name || signal.project_name;
              if (!passesQualityFilter(prospectName, coinData)) continue;

              const { data: ins } = await ctx.supabase
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
                ctx.prospects.push({ id: ins.id, name: ins.name, symbol: coinData?.symbol || null, status: 'needs_review' });
                signals.push({
                  prospect_id: ins.id,
                  project_name: ins.name,
                  signal_type: signal.signal_type,
                  headline: signal.headline.substring(0, 300),
                  snippet: `${signal.evidence}\n\n${signal.korea_relevance_reason}`.substring(0, 500),
                  source_url: '',
                  source_name: 'claude_research',
                  relevancy_weight: signalWeight,
                  tier,
                  shelf_life_days: shelfLife,
                  expires_at: new Date(Date.now() + shelfLife * 24 * 60 * 60 * 1000).toISOString(),
                });
                discoveryCount++;
              }
              await new Promise(r => setTimeout(r, 1200));
            } catch { /* skip */ }
          }
        }
      }
    }

    // Store Claude cost info for response
    ctx.metadata._claudeCost = totalCost;
    ctx.metadata._claudeTokens = totalTokens;
    ctx.metadata._claudeArticlesAnalyzed = analysisResult.articlesAnalyzed;

    return signals;
  },
};
