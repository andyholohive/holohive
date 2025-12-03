-- CRM Database Schema
-- Core Tables: Opportunities (Leads+Deals), Partners, Affiliates, Contacts
-- Supporting: Stage History for analytics

-- ============================================
-- 1. AFFILIATES TABLE (created first for FK reference)
-- KOLs, referrers with rev-share or commission
-- Lifecycle: New → Active → Inactive
-- ============================================
CREATE TABLE IF NOT EXISTS crm_affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic Info
  name TEXT NOT NULL,
  affiliation TEXT, -- Their affiliation/company
  category TEXT, -- Type of affiliate

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'new', -- 'new', 'active', 'inactive'

  -- Commission
  commission_model TEXT, -- Description of commission/rev-share structure
  commission_rate DECIMAL, -- Percentage if applicable

  -- Tracking
  last_contacted_at TIMESTAMP WITH TIME ZONE,

  -- Ownership
  owner_id UUID REFERENCES auth.users(id),

  -- Point of Contact (inline)
  poc_name TEXT,
  poc_email TEXT,
  poc_telegram TEXT,

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. OPPORTUNITIES TABLE (Unified Leads + Deals)
-- Single pipeline: New → Contacted → Qualified → Proposal → Contract → Closed
-- ============================================
CREATE TABLE IF NOT EXISTS crm_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic Info
  name TEXT NOT NULL,

  -- Pipeline Stage (unified lead + deal stages)
  stage TEXT NOT NULL DEFAULT 'new',
  -- Lead stages: 'new', 'contacted', 'qualified', 'unqualified', 'nurture'
  -- Deal stages: 'proposal', 'contract', 'closed_won', 'closed_lost'

  -- Classification
  account_type TEXT, -- 'general', 'channel', 'campaign', 'lite', 'ad_hoc' (set when qualified)

  -- Value (set when becomes a deal)
  deal_value DECIMAL,
  currency TEXT DEFAULT 'USD',

  -- Tracking
  last_contacted_at TIMESTAMP WITH TIME ZONE,

  -- Ownership & Source
  owner_id UUID REFERENCES auth.users(id),
  source TEXT, -- 'referral', 'inbound', 'event', 'cold_outreach'
  referrer TEXT, -- Who referred them

  -- Communication
  gc TEXT, -- Group Chat link/info

  -- Affiliate connection (for commission tracking)
  affiliate_id UUID REFERENCES crm_affiliates(id),

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  qualified_at TIMESTAMP WITH TIME ZONE, -- When moved from lead to deal stage
  closed_at TIMESTAMP WITH TIME ZONE -- When won or lost
);

-- ============================================
-- 3. PARTNERS TABLE
-- BD relationships, cross-partnerships
-- Lifecycle: Active / Inactive
-- ============================================
CREATE TABLE IF NOT EXISTS crm_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic Info
  name TEXT NOT NULL,

  -- Classification
  category TEXT, -- 'service_provider', 'investor_vc', 'project', 'individual'
  focus TEXT, -- Area of focus/expertise

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'inactive'

  -- Tracking
  last_contacted_at TIMESTAMP WITH TIME ZONE,

  -- Ownership
  owner_id UUID REFERENCES auth.users(id),

  -- Point of Contact (inline)
  poc_name TEXT,
  poc_email TEXT,
  poc_telegram TEXT,

  -- Affiliate connection (if partner is also an affiliate)
  is_affiliate BOOLEAN DEFAULT FALSE,
  affiliate_id UUID REFERENCES crm_affiliates(id),

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 4. CONTACTS TABLE
-- Individual people linked to opportunities/partners/affiliates
-- ============================================
CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic Info
  name TEXT NOT NULL,
  email TEXT,
  telegram_id TEXT,
  x_id TEXT,
  role TEXT, -- Their role/title
  category TEXT, -- Contact category

  -- Ownership
  owner_id UUID REFERENCES auth.users(id),

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 5. CONTACT LINKS (Junction Table)
-- Links contacts to opportunities/partners/affiliates
-- ============================================
CREATE TABLE IF NOT EXISTS crm_contact_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,

  -- Linked object type and ID
  linked_type TEXT NOT NULL, -- 'opportunity', 'partner', 'affiliate'
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES crm_partners(id) ON DELETE CASCADE,
  affiliate_id UUID REFERENCES crm_affiliates(id) ON DELETE CASCADE,

  -- Role in this relationship
  role TEXT,
  is_primary BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure only one link type is set
  CONSTRAINT check_single_link CHECK (
    (CASE WHEN opportunity_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN partner_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN affiliate_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

-- ============================================
-- 6. STAGE HISTORY (For Analytics)
-- Tracks all stage changes for conversion/velocity analysis
-- ============================================
CREATE TABLE IF NOT EXISTS crm_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Object reference
  object_type TEXT NOT NULL, -- 'opportunity', 'partner', 'affiliate'
  object_id UUID NOT NULL,

  -- Stage change
  from_stage TEXT,
  to_stage TEXT NOT NULL,

  -- Who and when
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  notes TEXT
);

-- ============================================
-- INDEXES
-- ============================================

-- Opportunities
CREATE INDEX idx_crm_opportunities_stage ON crm_opportunities(stage);
CREATE INDEX idx_crm_opportunities_owner ON crm_opportunities(owner_id);
CREATE INDEX idx_crm_opportunities_source ON crm_opportunities(source);
CREATE INDEX idx_crm_opportunities_affiliate ON crm_opportunities(affiliate_id);
CREATE INDEX idx_crm_opportunities_created ON crm_opportunities(created_at);

-- Partners
CREATE INDEX idx_crm_partners_status ON crm_partners(status);
CREATE INDEX idx_crm_partners_category ON crm_partners(category);
CREATE INDEX idx_crm_partners_owner ON crm_partners(owner_id);

-- Affiliates
CREATE INDEX idx_crm_affiliates_status ON crm_affiliates(status);
CREATE INDEX idx_crm_affiliates_category ON crm_affiliates(category);
CREATE INDEX idx_crm_affiliates_owner ON crm_affiliates(owner_id);

-- Contacts
CREATE INDEX idx_crm_contacts_owner ON crm_contacts(owner_id);
CREATE INDEX idx_crm_contacts_email ON crm_contacts(email);

-- Contact links
CREATE INDEX idx_crm_contact_links_contact ON crm_contact_links(contact_id);
CREATE INDEX idx_crm_contact_links_opportunity ON crm_contact_links(opportunity_id);
CREATE INDEX idx_crm_contact_links_partner ON crm_contact_links(partner_id);
CREATE INDEX idx_crm_contact_links_affiliate ON crm_contact_links(affiliate_id);

-- Stage history
CREATE INDEX idx_crm_stage_history_object ON crm_stage_history(object_type, object_id);
CREATE INDEX idx_crm_stage_history_changed ON crm_stage_history(changed_at);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE crm_opportunities IS 'Unified sales pipeline: Leads (new/contacted/qualified) → Deals (proposal/contract/closed). Single entity journey.';
COMMENT ON TABLE crm_partners IS 'BD relationships. Categories: service_provider, investor_vc, project, individual. Can also be affiliates.';
COMMENT ON TABLE crm_affiliates IS 'KOLs and referrers with commission/rev-share. Lifecycle: new → active → inactive.';
COMMENT ON TABLE crm_contacts IS 'Individual people who can be linked to multiple CRM objects.';
COMMENT ON TABLE crm_contact_links IS 'Links contacts to opportunities, partners, or affiliates with role info.';
COMMENT ON TABLE crm_stage_history IS 'Audit trail of all stage changes for analytics (conversion rates, velocity).';
