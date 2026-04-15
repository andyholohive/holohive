/**
 * Signal & Trigger Bible v3 — Core Types & Configuration
 * Defines the scanner module interface, signal types, weights, and scoring rules.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Scanner Module Interface ───

export interface ScannerModule {
  id: string;
  name: string;
  cadence: 'daily' | 'weekly' | 'monthly';
  requires: 'api' | 'scraping' | 'puppeteer' | 'paid_api';
  signalTypes: string[];
  scan(context: ScanContext): Promise<RawSignal[]>;
}

export interface ScanContext {
  prospects: ProspectRef[];
  existingSignalKeys: Set<string>;
  recencyMonths: number;
  supabase: SupabaseClient;
  /** Shared metadata bag — scanners can store data here for cross-scanner use */
  metadata: Record<string, unknown>;
}

export interface ProspectRef {
  id: string;
  name: string;
  symbol: string | null;
  status: string;
}

export interface RawSignal {
  prospect_id: string;
  project_name: string;
  signal_type: string;
  headline: string;
  snippet?: string;
  source_url?: string;
  source_name: string;
  relevancy_weight: number;
  tier?: number;
  confidence?: 'confirmed' | 'likely' | 'rumor';
  shelf_life_days?: number;
  expires_at?: string;
  metadata?: Record<string, unknown>;
}

// ─── Signal Weight Configuration (Bible v3) ───

export interface SignalWeightConfig {
  weight: number;
  tier: 1 | 2 | 3 | 4;
  shelf_life_days: number;
  category: 'project' | 'korea' | 'enrichment';
  compound_only?: boolean;
  description: string;
}

/**
 * Master signal weight table — all 40 signals from the Signal & Trigger Bible v3.
 * Maps signal_type → weight config.
 */
export const SIGNAL_WEIGHTS: Record<string, SignalWeightConfig> = {
  // ═══ SECTION 1: PROJECT SIGNALS ═══

  // Tier 1 — Act Immediately
  tge_within_60d:           { weight: 25, tier: 1, shelf_life_days: 56,  category: 'project', description: 'Token launch announced (TGE within 60 days)' },
  mainnet_launch:           { weight: 20, tier: 1, shelf_life_days: 30,  category: 'project', description: 'Mainnet or major product launch this quarter' },
  funding_round_5m:         { weight: 20, tier: 1, shelf_life_days: 30,  category: 'project', description: 'Funding round closed ($5M+ from credible backers)' },
  airdrop_announcement:     { weight: 20, tier: 1, shelf_life_days: 30,  category: 'project', description: 'Airdrop campaign announced' },
  korea_expansion_announce: { weight: 15, tier: 1, shelf_life_days: 14,  category: 'project', description: 'Explicit Korea expansion announcement' },
  dao_asia_governance:      { weight: 20, tier: 1, shelf_life_days: 14,  category: 'project', description: 'DAO/governance proposal for Asia expansion' },

  // Tier 2 — Act This Week
  ecosystem_asia_initiative:{ weight: 20, tier: 2, shelf_life_days: 30,  category: 'project', description: 'Ecosystem initiative targeting Asia/Korea' },
  staking_defi_launch:      { weight: 20, tier: 2, shelf_life_days: 30,  category: 'project', description: 'Staking/DeFi/yield product launch' },
  leadership_change:        { weight: 15, tier: 2, shelf_life_days: 14,  category: 'project', description: 'New CMO, Head of Growth, or BD Lead' },
  vc_portfolio_cascade:     { weight: 15, tier: 2, shelf_life_days: 30,  category: 'project', description: 'Korean VC portfolio company overlap' },
  korea_partnership:        { weight: 15, tier: 2, shelf_life_days: 14,  category: 'project', description: 'Partnership with Korean entity' },
  korea_intent_competitor:  { weight: 15, tier: 2, shelf_life_days: 60,  category: 'project', description: 'Direct competitor already in Korea' },
  multi_chain_expansion:    { weight: 10, tier: 2, shelf_life_days: 30,  category: 'project', description: 'Multi-chain expansion (new chain deployments)' },
  apac_conference:          { weight: 10, tier: 2, shelf_life_days: 14,  category: 'project', description: 'APAC conference appearance' },
  team_expansion:           { weight: 10, tier: 2, shelf_life_days: 14,  category: 'project', description: 'BD/Marketing team expansion' },

  // Tier 3 — Monitor/Nurture
  testnet_compound:         { weight: 10, tier: 3, shelf_life_days: 30,  category: 'project', compound_only: true, description: 'Testnet launch (scores only when combined with another signal)' },
  ecosystem_grant_asia:     { weight: 10, tier: 3, shelf_life_days: 30,  category: 'project', description: 'Ecosystem grant program (Asia track)' },
  token_unlock:             { weight: 10, tier: 3, shelf_life_days: 14,  category: 'project', description: 'Token unlock event (Korea-listed token)' },
  news_mention:             { weight: 10, tier: 3, shelf_life_days: 7,   category: 'project', description: 'Korean news/media mention' },
  web2_to_web3:             { weight: 10, tier: 3, shelf_life_days: 30,  category: 'project', description: 'Web2-to-Web3 pivot (known brand)' },
  accelerator_graduation:   { weight: 5,  tier: 3, shelf_life_days: 60,  category: 'project', description: 'Accelerator/incubator graduation' },
  community_growth_spike:   { weight: 5,  tier: 3, shelf_life_days: 7,   category: 'project', description: 'Community growth spike (>20% in 7 days)' },

  // ═══ SECTION 2: KOREA-SPECIFIC SIGNALS ═══

  // Tier 1 — Direct Korea Intent
  korea_job_posting:        { weight: 15, tier: 1, shelf_life_days: 14,  category: 'korea', description: 'Korea-specific job posting (BD/Marketing/Community)' },
  korea_exchange_no_community: { weight: 15, tier: 1, shelf_life_days: 30, category: 'korea', description: 'Korean exchange listing with no Korean community' },
  korea_collab:             { weight: 15, tier: 1, shelf_life_days: 14,  category: 'korea', description: 'Collaboration with Korean project/company' },

  // Tier 2 — Korea Opportunity
  korea_event:              { weight: 10, tier: 2, shelf_life_days: 14,  category: 'korea', description: 'Attending Korea event (KBW, ETH Seoul, UBCON)' },
  korea_kol_organic:        { weight: 10, tier: 2, shelf_life_days: 7,   category: 'korea', description: 'Korean KOL already covering them (organic)' },
  korea_retail_volume_spike:{ weight: 10, tier: 2, shelf_life_days: 7,   category: 'korea', description: 'Korean retail trading volume spike' },
  korea_regulatory_tailwind:{ weight: 10, tier: 2, shelf_life_days: 14,  category: 'korea', description: 'Korean regulatory tailwind' },

  // Tier 3 — Korea Context
  dead_korean_presence:     { weight: -10, tier: 3, shelf_life_days: 30, category: 'korea', description: 'Korean Twitter/TG exists but dead (negative)' },
  korea_community_mention:  { weight: 5,  tier: 3, shelf_life_days: 7,   category: 'korea', description: 'Mentioned in Korean community discussion' },
  korean_vc_cap_table:      { weight: 5,  tier: 3, shelf_life_days: 90,  category: 'korea', description: 'Korean VC in cap table' },

  // ═══ SECTION 3: ENRICHMENT SIGNALS (Tier 4) ═══
  warm_intro_available:     { weight: 10, tier: 4, shelf_life_days: 90,  category: 'enrichment', description: 'Warm intro available via network' },
  decision_maker_identified:{ weight: 5,  tier: 4, shelf_life_days: 90,  category: 'enrichment', description: 'Decision maker identified + accessible' },
  previous_contact_positive:{ weight: 5,  tier: 4, shelf_life_days: 180, category: 'enrichment', description: 'Previous HoloHive contact (positive)' },
  previous_contact_cold:    { weight: -5, tier: 4, shelf_life_days: 180, category: 'enrichment', description: 'Previous HoloHive contact (cold/no response)' },

  // ═══ NEGATIVE SIGNALS ═══
  korea_exchange_delisting: { weight: -30, tier: 2, shelf_life_days: 90, category: 'korea', description: 'Delisted from Korean exchange' },
  korea_regulatory_warning: { weight: -20, tier: 2, shelf_life_days: 90, category: 'korea', description: 'FSC/FIU regulatory warning' },
  korea_scam_alert:         { weight: -25, tier: 2, shelf_life_days: 90, category: 'korea', description: 'Scam/fraud warning in Korean media' },
  korea_agency_present:     { weight: -15, tier: 3, shelf_life_days: 90, category: 'korea', description: 'Already has Korean marketing agency' },

  // ═══ LEGACY SIGNAL TYPES (mapped to Bible v3) ═══
  // These are kept for backward compatibility with existing signals in the DB
  korea_community:          { weight: 15, tier: 1, shelf_life_days: 14,  category: 'korea', description: 'Korean community launch (legacy)' },
  korea_hiring:             { weight: 15, tier: 1, shelf_life_days: 14,  category: 'korea', description: 'Korea hiring (legacy → korea_job_posting)' },
  korea_localization:       { weight: 15, tier: 1, shelf_life_days: 14,  category: 'korea', description: 'Korea localization (legacy → korea_expansion_announce)' },
  social_presence:          { weight: 5,  tier: 3, shelf_life_days: 7,   category: 'korea', description: 'Korean social presence (legacy → korea_community_mention)' },
  korea_intent_apac:        { weight: 10, tier: 2, shelf_life_days: 14,  category: 'korea', description: 'APAC expansion (legacy → apac_conference)' },
  korea_intent_vc:          { weight: 5,  tier: 3, shelf_life_days: 90,  category: 'korea', description: 'Korean VC backed (legacy → korean_vc_cap_table)' },
  korea_intent_conference:  { weight: 10, tier: 2, shelf_life_days: 14,  category: 'korea', description: 'Korea conference (legacy → korea_event)' },
  korea_intent_hiring:      { weight: 10, tier: 2, shelf_life_days: 14,  category: 'korea', description: 'Asia hiring (legacy → team_expansion)' },
  korea_intent_exchange:    { weight: 15, tier: 1, shelf_life_days: 30,  category: 'korea', description: 'Asian exchange no KR (legacy → korea_exchange_no_community)' },
};

// ─── Action Tier Thresholds (Bible v3 Score→Action Mapping) ───

export type ActionTier = 'REACH_OUT_NOW' | 'PRE_TOKEN_PRIORITY' | 'WATCH' | 'RESEARCH' | 'NURTURE' | 'SKIP';

export function getActionTier(score: number): ActionTier {
  if (score >= 60) return 'REACH_OUT_NOW';
  if (score >= 50) return 'PRE_TOKEN_PRIORITY';
  if (score >= 40) return 'WATCH';
  if (score >= 30) return 'RESEARCH';
  if (score >= 20) return 'NURTURE';
  return 'SKIP';
}

// ─── Signal Labels for UI ───

export const SIGNAL_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(SIGNAL_WEIGHTS).map(([key, config]) => [key, config.description])
);

/**
 * Get the weight for a signal type. Returns the Bible v3 weight or a default based on urgency.
 */
export function getSignalWeight(signalType: string, urgency?: 'high' | 'medium' | 'low'): number {
  const config = SIGNAL_WEIGHTS[signalType];
  if (config) return config.weight;
  // Fallback for custom/unknown signal types
  if (urgency === 'high') return 20;
  if (urgency === 'medium') return 10;
  return 5;
}

/**
 * Get shelf life in days for a signal type.
 */
export function getShelfLife(signalType: string): number {
  return SIGNAL_WEIGHTS[signalType]?.shelf_life_days || 30;
}

/**
 * Get the tier for a signal type.
 */
export function getSignalTier(signalType: string): number {
  return SIGNAL_WEIGHTS[signalType]?.tier || 3;
}
