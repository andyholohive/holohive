/**
 * What the MEMBER role cannot reach by default.
 *
 * [2026-11-18, Andy] A member used to see only clients someone had shared
 * with them one at a time and campaigns they created or managed, so a new
 * joiner opened an empty app. The role now means "works on client delivery":
 * every active client, campaign, KOL and delivery log, edit but not delete,
 * and no Sales / CRM, no client money, no Measurement.
 *
 * This file is the one list of those exclusions. The sidebar, the route
 * guard and the Team page's grant checkboxes all read it, so a new joiner
 * needs no per-person setup and a new off-limits page is one line here.
 *
 * It is a UI boundary: pages are hidden and their URLs redirect. It is not
 * row-level security. A member's session can still read these tables through
 * the API.
 */

export type MemberBlockRule = {
  /** Route prefix. Matches the path itself and anything beneath it. */
  key: string;
  label: string;
  group: 'Sales / CRM' | 'Measurement';
  /** True when an admin can open it for one member from the Team page. */
  grantable: boolean;
};

export const MEMBER_BLOCKED_PAGES: MemberBlockRule[] = [
  { key: '/crm/outreach', label: 'Outreach', group: 'Sales / CRM', grantable: true },
  { key: '/crm/pipeline', label: 'Pipeline', group: 'Sales / CRM', grantable: true },
  { key: '/crm/network', label: 'Network', group: 'Sales / CRM', grantable: true },
  { key: '/crm/contacts', label: 'Contacts', group: 'Sales / CRM', grantable: true },
  { key: '/intelligence', label: 'Intelligence', group: 'Sales / CRM', grantable: true },
  { key: '/analytics', label: 'Analytics', group: 'Sales / CRM', grantable: true },
  // Admin-only in the sidebar for every role below admin, so a grant row
  // would have nothing to reveal. Blocked outright.
  { key: '/crm/sales-pipeline', label: 'Legacy Sales', group: 'Sales / CRM', grantable: false },
  { key: '/clients/ltv', label: 'Lifetime Value', group: 'Sales / CRM', grantable: false },
  { key: '/mindshare', label: 'Korea Signal', group: 'Measurement', grantable: false },
  { key: '/wallets', label: 'Wallet Analytics', group: 'Measurement', grantable: false },
  { key: '/intelligence/client-watch', label: 'Client Watch', group: 'Measurement', grantable: false },
];

/**
 * Paths that sit under a blocked prefix but are not part of it.
 * /intelligence/telegram is the ops Telegram page (Logistics); only its URL
 * lives under Intelligence.
 */
const MEMBER_BLOCK_EXEMPT = ['/intelligence/telegram'];

/**
 * Grant key for payments, budgets and KOL rates inside client and campaign
 * pages. Not a route, so it can never collide with a page key.
 */
export const MEMBER_MONEY_GRANT = 'money';

const matches = (path: string, key: string) => path === key || path.startsWith(`${key}/`);

/** The rule covering this path, most specific first, or null if it is open. */
export function memberBlockRule(path: string): MemberBlockRule | null {
  if (MEMBER_BLOCK_EXEMPT.some(p => matches(path, p))) return null;
  let found: MemberBlockRule | null = null;
  for (const rule of MEMBER_BLOCKED_PAGES) {
    if (matches(path, rule.key) && (!found || rule.key.length > found.key.length)) found = rule;
  }
  return found;
}

/** Where a member lands when they open something they cannot see. */
export const MEMBER_HOME = '/clients';
