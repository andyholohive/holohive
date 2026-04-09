/**
 * Claude-powered analysis for Korean market signals.
 * Uses the Claude API to read articles and extract structured signals.
 */

import { callClaude } from '@/lib/claude';
import type { ArticleContent } from './webScraper';

// ─── Types ───

export interface ClaudeSignal {
  project_name: string;
  signal_type: 'exchange_listing' | 'news_mention' | 'korea_community' | 'korea_partnership' | 'korea_event' | 'korea_localization' | 'korea_hiring' | 'social_presence';
  headline: string;
  evidence: string;
  urgency: 'high' | 'medium' | 'low';
  korea_relevance_reason: string;
}

export interface AnalysisResult {
  signals: ClaudeSignal[];
  article_url: string;
  article_source: string;
  cost_usd: number;
  tokens_used: number;
}

// ─── System Prompt ───

const SYSTEM_PROMPT = `You are a Korean crypto market signal analyst for HoloHive, a marketing agency that helps blockchain projects enter the Korean market.

Your job is to analyze Korean crypto news articles and identify projects that are relevant to the Korean market — meaning they would benefit from Korean marketing services.

SIGNAL TYPES (from most to least valuable):
- exchange_listing: Project listed or about to list on Korean exchanges (Upbit, Bithumb, Coinone, Korbit)
- korea_community: Project launching Korean community (Telegram, Kakao, Discord in Korean)
- korea_partnership: Partnership with Korean companies (Samsung, Kakao, LINE, Korean banks, etc.)
- korea_event: Participating in Korean events (Korea Blockchain Week, conferences in Seoul)
- korea_localization: Adding Korean language support, Korean website, Korean documentation
- korea_hiring: Hiring for Korean market roles (Korean CM, Korean marketing, Seoul office)
- news_mention: General coverage in Korean media indicating market awareness
- social_presence: Korean social media activity, Korean influencer mentions

URGENCY LEVELS:
- high: Active Korea expansion right now (listing, launch, partnership announced)
- medium: Plans or indications of Korea interest
- low: General mention in Korean media without specific Korea activity

RULES:
- Only identify SPECIFIC project names (not "Bitcoin" or "Ethereum" unless they have Korea-specific news)
- Skip general market commentary (price analysis, macro trends)
- Each signal must have concrete evidence from the article
- The korea_relevance_reason should explain WHY this matters for a Korean marketing agency
- If no Korea-relevant signals are found, return an empty array

Respond ONLY with valid JSON in this exact format:
{
  "signals": [
    {
      "project_name": "ExactProjectName",
      "signal_type": "korea_community",
      "headline": "Short headline summarizing the signal",
      "evidence": "Direct quote or specific detail from the article",
      "urgency": "high",
      "korea_relevance_reason": "Why this project needs Korean marketing services"
    }
  ]
}`;

// ─── Analysis Functions ───

/**
 * Analyze a single article with Claude to extract structured signals.
 * Uses Haiku for cost efficiency (~$0.001 per article).
 */
export async function analyzeArticle(article: ArticleContent): Promise<AnalysisResult> {
  const userPrompt = `Analyze this Korean crypto news article for Korea market signals:

SOURCE: ${article.source}
URL: ${article.url}
TITLE: ${article.title}
DATE: ${article.publishedAt}

ARTICLE TEXT:
${article.body}

Extract all Korea-relevant signals. If no Korea-specific signals are found, return {"signals": []}.`;

  try {
    const response = await callClaude(
      [SYSTEM_PROMPT],
      userPrompt,
      {
        model: 'claude-haiku-4-5-20251001', // Fast + cheap: ~$0.001 per article
        maxTokens: 1024,
        temperature: 0.1, // Low temperature for consistent structured output
      }
    );

    // Parse the JSON response
    let signals: ClaudeSignal[] = [];
    try {
      // Extract JSON from response (Claude might wrap it in markdown code blocks)
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        signals = parsed.signals || [];
      }
    } catch (parseErr) {
      console.error('Failed to parse Claude response:', response.content.substring(0, 200));
      signals = [];
    }

    return {
      signals,
      article_url: article.url,
      article_source: article.source,
      cost_usd: response.cost_usd,
      tokens_used: response.usage.input_tokens + response.usage.output_tokens,
    };
  } catch (err) {
    console.error(`Claude analysis error for ${article.url}:`, err);
    return {
      signals: [],
      article_url: article.url,
      article_source: article.source,
      cost_usd: 0,
      tokens_used: 0,
    };
  }
}

/**
 * Analyze multiple articles with Claude.
 * Processes sequentially to avoid rate limits.
 */
export async function analyzeArticles(
  articles: ArticleContent[],
  maxArticles: number = 20
): Promise<{
  allSignals: (ClaudeSignal & { article_url: string; article_source: string })[];
  totalCost: number;
  totalTokens: number;
  articlesAnalyzed: number;
}> {
  const allSignals: (ClaudeSignal & { article_url: string; article_source: string })[] = [];
  let totalCost = 0;
  let totalTokens = 0;
  let articlesAnalyzed = 0;

  for (const article of articles.slice(0, maxArticles)) {
    // Skip articles with very little content
    if (article.body.length < 50) continue;

    const result = await analyzeArticle(article);
    totalCost += result.cost_usd;
    totalTokens += result.tokens_used;
    articlesAnalyzed++;

    for (const signal of result.signals) {
      allSignals.push({
        ...signal,
        article_url: result.article_url,
        article_source: result.article_source,
      });
    }

    // Small delay between API calls
    await new Promise(r => setTimeout(r, 300));
  }

  return { allSignals, totalCost, totalTokens, articlesAnalyzed };
}

/**
 * Analyze DuckDuckGo search results with Claude (batch mode).
 * Sends all results in one call for efficiency.
 */
export async function analyzeSearchResults(
  results: { title: string; url: string; snippet: string }[]
): Promise<{
  signals: ClaudeSignal[];
  cost_usd: number;
  tokens_used: number;
}> {
  if (results.length === 0) return { signals: [], cost_usd: 0, tokens_used: 0 };

  const resultsList = results
    .map((r, i) => `${i + 1}. [${r.title}]\n   URL: ${r.url}\n   ${r.snippet}`)
    .join('\n\n');

  const userPrompt = `Analyze these web search results about Korean crypto market activity. Identify specific projects that are expanding into or active in the Korean market:

SEARCH RESULTS:
${resultsList}

Extract Korea-relevant signals from these search results. Focus on specific project names and concrete Korea-related activities. If no Korea-specific signals are found, return {"signals": []}.`;

  try {
    const response = await callClaude(
      [SYSTEM_PROMPT],
      userPrompt,
      {
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 2048,
        temperature: 0.1,
      }
    );

    let signals: ClaudeSignal[] = [];
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        signals = parsed.signals || [];
      }
    } catch {
      signals = [];
    }

    return {
      signals,
      cost_usd: response.cost_usd,
      tokens_used: response.usage.input_tokens + response.usage.output_tokens,
    };
  } catch (err) {
    console.error('Claude search analysis error:', err);
    return { signals: [], cost_usd: 0, tokens_used: 0 };
  }
}
