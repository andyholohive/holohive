/**
 * Web scraping utilities for Korean market signal discovery.
 * Sources: DuckDuckGo search, TokenPost articles, BlockMedia articles.
 * All free, no API keys needed, works on Vercel.
 */

// ─── Types ───

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ArticleContent {
  title: string;
  body: string;       // Full article text
  url: string;
  source: string;     // 'tokenpost' | 'blockmedia'
  publishedAt: string;
}

// ─── DuckDuckGo Search ───

const KOREA_SEARCH_QUERIES = [
  'crypto Korea launch 2026',
  'blockchain project Korean market expansion',
  '"Upbit listing" new token',
  '"Bithumb listing" new',
  'crypto "Korean community" launch',
  '한국 진출 crypto blockchain',
  'Korea blockchain partnership',
  'crypto Korea office opening',
  '"Korea Blockchain Week" 2026',
  'Korean exchange new listing crypto',
];

/**
 * Search DuckDuckGo HTML (scraper-friendly, no JS needed).
 * Returns search result titles, URLs, and snippets.
 */
export async function searchDuckDuckGo(
  query: string,
  maxResults: number = 15
): Promise<SearchResult[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const results: SearchResult[] = [];

    // DuckDuckGo HTML results structure:
    // <a class="result__a" href="...">Title</a>
    // <a class="result__snippet">Snippet text</a>
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
      const rawUrl = match[1];
      const title = match[2].replace(/<[^>]*>/g, '').trim();
      const snippet = match[3].replace(/<[^>]*>/g, '').trim();

      // DuckDuckGo wraps URLs in a redirect — extract the actual URL
      let actualUrl = rawUrl;
      const uddgMatch = rawUrl.match(/uddg=([^&]*)/);
      if (uddgMatch) {
        actualUrl = decodeURIComponent(uddgMatch[1]);
      }

      if (title && actualUrl) {
        results.push({ title, url: actualUrl, snippet });
      }
    }

    return results;
  } catch (err) {
    console.error(`DuckDuckGo search error for "${query}":`, err);
    return [];
  }
}

/**
 * Run multiple Korean-focused search queries and deduplicate results.
 */
export async function searchKoreanSignals(
  maxQueries: number = 5,
  maxResultsPerQuery: number = 10
): Promise<SearchResult[]> {
  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();

  // Use a subset of queries to stay within time limits
  const queries = KOREA_SEARCH_QUERIES.slice(0, maxQueries);

  for (const query of queries) {
    const results = await searchDuckDuckGo(query, maxResultsPerQuery);
    for (const r of results) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        allResults.push(r);
      }
    }
    // Rate limit between searches
    await new Promise(r => setTimeout(r, 1000));
  }

  return allResults;
}

// ─── Full Article Scraping ───

/**
 * Fetch and parse a full article from TokenPost.
 * Structure: <h1>Title</h1>, <div class="article_content"><p>...</p></div>
 */
export async function scrapeTokenPostArticle(url: string): Promise<ArticleContent | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract title
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';

    // Extract article body
    const bodyMatch = html.match(/<div[^>]*class="[^"]*article_content[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const bodyHtml = bodyMatch ? bodyMatch[1] : '';

    // Extract text from paragraphs
    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/g;
    let pMatch;
    while ((pMatch = pRegex.exec(bodyHtml)) !== null) {
      const text = pMatch[1].replace(/<[^>]*>/g, '').trim();
      if (text.length > 10) paragraphs.push(text);
    }

    // If no <p> tags found, try getting all text
    if (paragraphs.length === 0) {
      const plainText = bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (plainText.length > 20) paragraphs.push(plainText);
    }

    const body = paragraphs.join('\n\n');
    if (!title && !body) return null;

    // Extract date
    const dateMatch = html.match(/(\d{4}\.\d{2}\.\d{2})/);
    const publishedAt = dateMatch ? dateMatch[1] : new Date().toISOString();

    return { title, body: body.substring(0, 3000), url, source: 'tokenpost', publishedAt };
  } catch (err) {
    console.error(`TokenPost scrape error for ${url}:`, err);
    return null;
  }
}

/**
 * Fetch and parse a full article from BlockMedia.
 * Structure: <h1 class="entry-title">Title</h1>, <div class="entry-content"><p>...</p></div>
 */
export async function scrapeBlockMediaArticle(url: string): Promise<ArticleContent | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract title
    const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';

    // Extract article body
    const bodyMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const bodyHtml = bodyMatch ? bodyMatch[1] : '';

    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/g;
    let pMatch;
    while ((pMatch = pRegex.exec(bodyHtml)) !== null) {
      const text = pMatch[1].replace(/<[^>]*>/g, '').trim();
      if (text.length > 10) paragraphs.push(text);
    }

    if (paragraphs.length === 0) {
      const plainText = bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (plainText.length > 20) paragraphs.push(plainText);
    }

    const body = paragraphs.join('\n\n');
    if (!title && !body) return null;

    const dateMatch = html.match(/(\d{4}-\d{2}-\d{2})/);
    const publishedAt = dateMatch ? dateMatch[1] : new Date().toISOString();

    return { title, body: body.substring(0, 3000), url, source: 'blockmedia', publishedAt };
  } catch (err) {
    console.error(`BlockMedia scrape error for ${url}:`, err);
    return null;
  }
}

/**
 * Fetch full articles from TokenPost and BlockMedia RSS links.
 * Takes the RSS items and scrapes each article page for full content.
 */
export async function scrapeFullArticles(
  rssItems: { link: string; source: string }[],
  maxArticles: number = 15
): Promise<ArticleContent[]> {
  const articles: ArticleContent[] = [];

  for (const item of rssItems.slice(0, maxArticles)) {
    let article: ArticleContent | null = null;

    if (item.source === 'tokenpost' || item.link.includes('tokenpost.kr')) {
      article = await scrapeTokenPostArticle(item.link);
    } else if (item.source === 'blockmedia' || item.link.includes('blockmedia.co.kr')) {
      article = await scrapeBlockMediaArticle(item.link);
    }

    if (article) {
      articles.push(article);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 800));
  }

  return articles;
}
