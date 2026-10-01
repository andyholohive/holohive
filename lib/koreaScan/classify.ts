/**
 * Korea Scan — matching and tagging for single Korean Telegram posts.
 *
 * Deterministic keyword rules, not a model: the same post always gets the
 * same tag, the rules are readable, and a scan runs without an API bill.
 * Every graphic that uses a tag says "tagged by keyword rules".
 */

export type CoverageType = 'analysis' | 'news' | 'price' | 'farming' | 'calendar';

export const COVERAGE_TYPES: CoverageType[] = ['analysis', 'news', 'price', 'farming', 'calendar'];

export const COVERAGE_LABEL: Record<CoverageType, string> = {
  analysis: 'Product and analysis',
  news: 'News',
  price: 'Price talk',
  farming: 'Points and farming',
  calendar: 'Calendars and roundups',
};

/**
 * Quality weights. A product or analysis post counts for more than airdrop
 * chatter. Chosen so Yano's two reference mixes land on his published
 * scores (1.18 briefed, 0.88 field) within a few hundredths.
 */
export const COVERAGE_WEIGHT: Record<CoverageType, number> = {
  analysis: 1.5, news: 1.0, price: 0.7, farming: 0.4, calendar: 0.4,
};

const RX = {
  calendar: /(일정|스케줄|캘린더|calendar|schedule|이번\s?주\s?(이벤트|일정)|금주\s?일정|언락\s?일정|TGE\s?일정)/i,
  roundup: /(news\s?summary|뉴스\s?요약|데일리\s?뉴스|daily\s?news|모닝\s?브리핑|주간\s?정리|weekly\s?recap|오늘의\s?소식)/i,
  farming: /(에어드[랍롭]|airdrop|포인트|points?\b|파밍|farming|레퍼럴|추천인|referral|초대\s?코드|퀘스트|quest|리워드|reward|시즌\s?\d|거래량\s?채우|볼륨\s?채우|갤럭시|galxe|zealy|화이트리스트|whitelist|\bWL\b)/i,
  price: /(가격|펌핑|덤핑|떡상|떡락|차트|지지선|저항선|목표가|숏|롱|청산|레버리지|시총|ATH|\bpump|\bdump|\$\d|\d+(\.\d+)?\s?%\s?(상승|하락|올|빠))/i,
  analysis: /(구조|메커니즘|아키텍처|분석|비교|정리|원리|설계|토크노믹스|리서치|research|deep\s?dive|thread|스레드|모델|작동\s?방식|차별점|장단점|리뷰|후기|사용기)/i,
  news: /(상장|출시|발표|파트너십|파트너|투자\s?유치|펀딩|런칭|업데이트|공지|listing|launch|announce|raised|메인넷|테스트넷|해킹|공격|익스플로잇|exploit|인수)/i,
};

/** Longer than this and not caught by an earlier rule, a post reads as analysis. */
const LONG_POST = 450;

/** One tag per post. Order matters: the most specific rule wins. */
export function classifyPost(text: string): CoverageType {
  const t = text ?? '';
  if ((RX.calendar.test(t) && countDateLines(t) >= 3) || (RX.roundup.test(t) && countBullets(t) >= 4)) return 'calendar';
  // Farming when it's the point of the post: a short post that mentions it, or a long one that
  // keeps coming back to it. A long recap that mentions points once is not a farming post.
  const farmHits = (t.match(new RegExp(RX.farming.source, 'gi')) ?? []).length;
  if (farmHits >= 3 || (farmHits >= 1 && t.length < 500)) return 'farming';
  if (RX.analysis.test(t) && t.length > 250) return 'analysis';
  if (RX.news.test(t)) return 'news';
  if (RX.price.test(t)) return 'price';
  return t.length > LONG_POST ? 'analysis' : 'news';
}

/** Bullet or dash lines, the shape of a multi-project roundup. */
function countBullets(t: string) {
  return t.split('\n').filter((l) => /^\s*([-•▪︎·*]|\d+[.)]|\[)/.test(l)).length;
}

/** Lines that start with a date, the shape of a weekly calendar post. */
function countDateLines(t: string) {
  return t.split('\n').filter((l) => /^\s*[-•▪︎·*]?\s*(\d{1,2}[./월]\s?\d{1,2}|\d{1,2}\/\d{1,2}|[월화수목금토일]\b|\d{1,2}일)/.test(l)).length;
}

const PAID_TAG = /^(kol|ad|ads|광고|협찬|유료광고|sponsored|promotion|프로모션)$/i;
const PAID_TEXT = /(#\s?(KOL|AD|광고|협찬|유료광고|sponsored)\b|유료\s?광고|\(광고\)|\[광고\]|광고\s?포함|협찬\s?(받|포함))/i;

/** Carries a disclosed paid marker. Untagged is not proof of unpaid. */
export function isPaid(text: string, hashtags: string[] | null): boolean {
  if (hashtags?.some((h) => PAID_TAG.test(h.replace(/^#/, '')))) return true;
  return PAID_TEXT.test(text ?? '');
}

const REFERRAL = /(레퍼럴|추천인\s?코드|초대\s?코드|referral|ref\s?code|[?&]ref=|\/ref\/|join\?code=|invite\s?code)/i;
export function isReferral(text: string): boolean {
  return REFERRAL.test(text ?? '');
}

export interface MatchSpec {
  aliases: string[];
  /** Words that contain an alias but mean something else (엔터프라이즈 ⊃ 라이즈). Removed before matching. */
  exclude?: string[];
}

/**
 * Builds a matcher. Hangul aliases match as substrings (Korean has no word
 * breaks to lean on). Latin aliases match on word boundaries, and short
 * all-caps tickers ("HYPE", "SOL") match case-sensitively so ordinary words
 * don't count.
 */
export function buildMatcher(spec: MatchSpec): (text: string) => boolean {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = spec.aliases.map((a) => a.trim()).filter(Boolean);
  const hangul = parts.filter((a) => /[가-힣]/.test(a));
  const tickers = parts.filter((a) => !/[가-힣]/.test(a) && /^[A-Z0-9$]{2,6}$/.test(a));
  const latin = parts.filter((a) => !hangul.includes(a) && !tickers.includes(a));
  const rxHangul = hangul.length ? new RegExp(hangul.map(esc).join('|')) : null;
  const rxLatin = latin.length ? new RegExp(`(^|[^A-Za-z0-9])(${latin.map(esc).join('|')})(?![A-Za-z0-9])`, 'i') : null;
  const rxTicker = tickers.length ? new RegExp(`(^|[^A-Za-z0-9])\\$?(${tickers.map((t) => esc(t.replace(/^\$/, ''))).join('|')})(?![A-Za-z0-9])`) : null;
  const rxExclude = spec.exclude?.filter(Boolean).length ? new RegExp(spec.exclude!.filter(Boolean).map(esc).join('|'), 'gi') : null;
  return (raw: string) => {
    const t = rxExclude ? (raw ?? '').replace(rxExclude, ' ') : (raw ?? '');
    return !!(rxHangul?.test(t) || rxLatin?.test(t) || rxTicker?.test(t));
  };
}
