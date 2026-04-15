/**
 * Name matching utilities for prospect signal scanning.
 * Extracted from the monolithic scan route for reuse across scanner modules.
 */

// ─── Blacklist: major/common tokens to skip during discovery ───
export const SKIP_TOKENS = new Set([
  'BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'BUSD', 'DAI', 'TUSD', 'USDP',
  'XRP', 'SOL', 'ADA', 'DOGE', 'DOT', 'MATIC', 'SHIB', 'TRX', 'AVAX',
  'WBTC', 'WETH', 'STETH', 'LINK', 'UNI', 'LTC', 'BCH', 'LEO', 'ATOM',
  'ETC', 'XLM', 'FIL', 'HBAR', 'ICP', 'NEAR', 'APT',
]);

// Common English words that shouldn't be treated as project names
export const SKIP_WORDS = new Set([
  'bitcoin', 'ethereum', 'crypto', 'blockchain', 'market', 'price', 'token',
  'trading', 'exchange', 'wallet', 'defi', 'nft', 'web3', 'altcoin',
  'bull', 'bear', 'rally', 'crash', 'pump', 'dump', 'whale', 'mining',
  'staking', 'yield', 'airdrop', 'regulation', 'sec', 'fed', 'etf',
  'halving', 'futures', 'spot', 'leverage', 'short', 'long', 'liquidation',
  'korea', 'korean', 'global', 'digital', 'asset', 'assets', 'report',
  'analysis', 'update', 'news', 'the', 'for', 'and', 'from', 'china',
  'trump', 'iran', 'usa', 'japan',
]);

// ─── Quality filters for discovered prospects ───
export const MIN_MARKET_CAP = 5_000_000;

const SPAM_PATTERNS = [
  /^safe/i, /moon$/i, /elon/i, /doge(?!coin)/i, /shib(?!a)/i,
  /baby/i, /floki/i, /pepe(?!coin)/i, /inu$/i, /cum/i, /ass$/i,
  /rocket/i, /1000x/i, /gem$/i,
];

export function isSpamName(name: string): boolean {
  return SPAM_PATTERNS.some(p => p.test(name));
}

export function passesQualityFilter(name: string, coinData: { market_cap?: number | null } | null): boolean {
  if (isSpamName(name)) return false;
  if (coinData?.market_cap && coinData.market_cap < MIN_MARKET_CAP) return false;
  return true;
}

// ─── Korean-English project name mapping ───
export const KOREAN_NAME_MAP: Record<string, string> = {
  '비트코인': 'Bitcoin', '이더리움': 'Ethereum', '리플': 'XRP',
  '에이다': 'Cardano', '솔라나': 'Solana', '폴카닷': 'Polkadot',
  '아발란체': 'Avalanche', '체인링크': 'Chainlink', '유니스왑': 'Uniswap',
  '아비트럼': 'Arbitrum', '옵티미즘': 'Optimism', '폴리곤': 'Polygon',
  '코스모스': 'Cosmos', '니어': 'NEAR', '앱토스': 'Aptos',
  '수이': 'Sui', '셀레스티아': 'Celestia', '스택스': 'Stacks',
  '헬리움': 'Helium', '더그래프': 'The Graph', '렌더': 'Render',
  '페치': 'Fetch.ai', '아카시': 'Akash', '인젝티브': 'Injective',
  '세이': 'Sei', '주피터': 'Jupiter', '레이디움': 'Raydium',
  '오르카': 'Orca', '매직에덴': 'Magic Eden', '텐서': 'Tensor',
  '웜홀': 'Wormhole', '파이쓰': 'Pyth', '지토': 'Jito',
  '이오스': 'EOS', '트론': 'TRON', '에이브': 'Aave',
  '메이커': 'Maker', '컴파운드': 'Compound', '커브': 'Curve',
  '팬케이크스왑': 'PancakeSwap', '스시스왑': 'SushiSwap',
  '디와이디엑스': 'dYdX', '질리카': 'Zilliqa', '카이버': 'Kyber',
  '밴드': 'Band Protocol', '온톨로지': 'Ontology', '알고랜드': 'Algorand',
  '하모니': 'Harmony', '엘론드': 'MultiversX', '카르다노': 'Cardano',
  '테조스': 'Tezos', '아이오타': 'IOTA',
};

// ─── Name matching utilities ───

export function normalizeForMatch(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = a[j - 1] === b[i - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

const NAME_ALIASES: Record<string, string[]> = {
  'polygon': ['matic'],
  'matic': ['polygon'],
  'multiversx': ['elrond'],
  'elrond': ['multiversx'],
  'arbitrum': ['arbitrumone', 'arbitrumnova'],
  'avalanche': ['avax'],
  'avax': ['avalanche'],
  'chainlink': ['link'],
  'polkadot': ['dot'],
};

export function isValidProjectName(name: string): boolean {
  if (name.length < 2 || name.length > 30) return false;
  if (SKIP_WORDS.has(name.toLowerCase())) return false;
  if (/^(The|A|An|In|On|At|For|To|Of|By|With|From|And|Or|But|Not|Is|Are|Was|Were|Has|Have|Had|Can|Could|Would|Should|May|Might|Must|Will|Shall)$/i.test(name)) return false;
  if (!/[A-Za-z]/.test(name)) return false;
  return true;
}

export function findProspectMatch(
  projectName: string,
  projectSymbol: string,
  prospects: { id: string; name: string; symbol: string | null }[]
): { id: string; name: string } | null {
  const normName = normalizeForMatch(projectName);
  const normSymbol = normalizeForMatch(projectSymbol);

  for (const p of prospects) {
    const pName = normalizeForMatch(p.name);
    const pSymbol = normalizeForMatch(p.symbol || '');

    // Exact match
    if (pName === normName && normName.length > 0) return { id: p.id, name: p.name };
    if (pSymbol === normSymbol && normSymbol.length >= 2) return { id: p.id, name: p.name };

    // Substring match
    if (normName.length >= 4 && (pName.includes(normName) || normName.includes(pName))) {
      return { id: p.id, name: p.name };
    }

    // Alias match
    const aliases = NAME_ALIASES[normName];
    if (aliases && (aliases.includes(pName) || aliases.includes(pSymbol))) {
      return { id: p.id, name: p.name };
    }

    // Fuzzy match — allow 1-2 character typos for names >= 5 chars
    if (normName.length >= 5 && pName.length >= 5) {
      const maxDist = normName.length >= 8 ? 2 : 1;
      if (levenshtein(normName, pName) <= maxDist) {
        return { id: p.id, name: p.name };
      }
    }
  }
  return null;
}

export function findNewsMatches(
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

export function extractProjectNames(title: string, description: string): string[] {
  const text = `${title} ${description}`;
  const names: string[] = [];
  const seen = new Set<string>();

  // Pattern 0: Korean name → English mapping
  for (const [koreanName, englishName] of Object.entries(KOREAN_NAME_MAP)) {
    if (text.includes(koreanName) && !seen.has(englishName.toLowerCase())) {
      seen.add(englishName.toLowerCase());
      names.push(englishName);
    }
  }

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

  // Pattern 2: Capitalized English words/phrases
  const capRegex = /(?:^|[,\s·…""''()[\]|/])((?:[A-Z][A-Za-z0-9]+(?:\s[A-Z][A-Za-z0-9]+){0,2}))/g;
  while ((match = capRegex.exec(text)) !== null) {
    const name = match[1].trim();
    if (isValidProjectName(name) && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      names.push(name);
    }
  }

  // Pattern 3: ALL-CAPS tokens (3-10 chars)
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
