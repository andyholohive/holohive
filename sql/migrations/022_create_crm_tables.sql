-- CRM Database Schema
-- Core CRM Objects: Leads, Deals, Partners, Affiliates, Contacts

-- ============================================
-- 1. CONTACTS TABLE (Base table - individuals)
-- ============================================
CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic Info
  name TEXT NOT NULL,
  email TEXT,
  telegram_id TEXT,
  x_id TEXT,

  -- Classification
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
-- 2. LEADS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic Info
  name TEXT NOT NULL,

  -- Pipeline
  status TEXT NOT NULL DEFAULT 'new', -- 'new', 'contacted', 'qualified', 'unqualified', 'nurture'

  -- Tracking
  last_contacted_at TIMESTAMP WITH TIME ZONE,

  -- Ownership & Source
  owner_id UUID REFERENCES auth.users(id),
  source TEXT, -- 'referral', 'inbound', 'event', 'cold_outreach', etc.
  referrer TEXT, -- Who referred them

  -- Communication
  gc TEXT, -- Group Chat link/info

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- For tracking when moved to deals or inactive
  converted_to_deal_id UUID, -- Reference to deal if qualified
  converted_at TIMESTAMP WITH TIME ZONE,
  inactive_at TIMESTAMP WITH TIME ZONE,
  inactive_reason TEXT
);

-- ============================================
-- 3. DEALS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic Info
  name TEXT NOT NULL,

  -- Pipeline
  status TEXT NOT NULL DEFAULT 'qualified', -- 'qualified', 'proposal', 'contract', 'closed_won', 'closed_lost', 'nurture'
  sales_stage TEXT, -- More granular stages from ClickUp

  -- Classification
  account_type TEXT, -- 'general', 'channel', 'campaign', 'lite', 'ad_hoc'

  -- Tracking
  last_contacted_at TIMESTAMP WITH TIME ZONE,

  -- Ownership & Source
  owner_id UUID REFERENCES auth.users(id),
  source TEXT, -- 'referral', 'inbound', 'event', etc.
  referrer TEXT,

  -- Communication
  gc TEXT, -- Group Chat link/info

  -- Relationships
  affiliate_id UUID REFERENCES crm_affiliates(id), -- Inter-connection to affiliate
  lead_id UUID, -- Original lead if converted from lead

  -- Value
  deal_value DECIMAL,
  currency TEXT DEFAULT 'USD',

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE,

  -- For tracking when moved to inactive
  inactive_at TIMESTAMP WITH TIME ZONE,
  inactive_reason TEXT
);

-- ============================================
-- 4. PARTNERS TABLE
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

  -- Point of Contact
  poc_contact_id UUID REFERENCES crm_contacts(id),
  poc_name TEXT, -- Quick reference if no linked contact

  -- Affiliate connection
  is_affiliate BOOLEAN DEFAULT FALSE,
  affiliate_id UUID REFERENCES crm_affiliates(id),

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  inactive_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- 5. AFFILIATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS crm_affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic Info
  name TEXT NOT NULL,

  -- Classification
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

  -- Point of Contact
  poc_contact_id UUID REFERENCES crm_contacts(id),
  poc_name TEXT, -- Quick reference if no linked contact

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  activated_at TIMESTAMP WITH TIME ZONE,
  inactive_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- 6. JUNCTION TABLE: Contact-Object Links
-- Contacts can be linked to multiple objects
-- ============================================
CREATE TABLE IF NOT EXISTS crm_contact_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,

  -- Linked object (only one should be set)
  linked_type TEXT NOT NULL, -- 'lead', 'deal', 'partner', 'affiliate'
  lead_id UUID REFERENCES crm_leads(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES crm_partners(id) ON DELETE CASCADE,
  affiliate_id UUID REFERENCES crm_affiliates(id) ON DELETE CASCADE,

  -- Role in this relationship
  role TEXT, -- Their role in this specific relationship
  is_primary BOOLEAN DEFAULT FALSE, -- Primary contact for this object

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure only one link type is set
  CONSTRAINT check_single_link CHECK (
    (CASE WHEN lead_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN deal_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN partner_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN affiliate_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

-- ============================================
-- 7. STAGE HISTORY TABLE (For Analytics)
-- Track all status/stage changes
-- ============================================
CREATE TABLE IF NOT EXISTS crm_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Object reference
  object_type TEXT NOT NULL, -- 'lead', 'deal', 'partner', 'affiliate'
  object_id UUID NOT NULL,

  -- Stage change
  from_stage TEXT,
  to_stage TEXT NOT NULL,

  -- Who and when
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Additional context
  notes TEXT
);

-- ============================================
-- 8. ACTIVITIES TABLE
-- Track all interactions/activities
-- ============================================
CREATE TABLE IF NOT EXISTS crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Object reference (can be linked to any CRM object)
  object_type TEXT NOT NULL, -- 'lead', 'deal', 'partner', 'affiliate', 'contact'
  object_id UUID NOT NULL,

  -- Activity details
  type TEXT NOT NULL, -- 'email', 'call', 'meeting', 'note', 'task', 'message'
  subject TEXT,
  description TEXT,

  -- Scheduling (for tasks/meetings)
  scheduled_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Who
  created_by UUID REFERENCES auth.users(id),
  assigned_to UUID REFERENCES auth.users(id),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES for Performance
-- ============================================

-- Leads indexes
CREATE INDEX idx_crm_leads_status ON crm_leads(status);
CREATE INDEX idx_crm_leads_owner ON crm_leads(owner_id);
CREATE INDEX idx_crm_leads_source ON crm_leads(source);
CREATE INDEX idx_crm_leads_created ON crm_leads(created_at);

-- Deals indexes
CREATE INDEX idx_crm_deals_status ON crm_deals(status);
CREATE INDEX idx_crm_deals_owner ON crm_deals(owner_id);
CREATE INDEX idx_crm_deals_account_type ON crm_deals(account_type);
CREATE INDEX idx_crm_deals_affiliate ON crm_deals(affiliate_id);
CREATE INDEX idx_crm_deals_created ON crm_deals(created_at);

-- Partners indexes
CREATE INDEX idx_crm_partners_status ON crm_partners(status);
CREATE INDEX idx_crm_partners_category ON crm_partners(category);
CREATE INDEX idx_crm_partners_owner ON crm_partners(owner_id);

-- Affiliates indexes
CREATE INDEX idx_crm_affiliates_status ON crm_affiliates(status);
CREATE INDEX idx_crm_affiliates_category ON crm_affiliates(category);
CREATE INDEX idx_crm_affiliates_owner ON crm_affiliates(owner_id);

-- Contact links indexes
CREATE INDEX idx_crm_contact_links_contact ON crm_contact_links(contact_id);
CREATE INDEX idx_crm_contact_links_lead ON crm_contact_links(lead_id);
CREATE INDEX idx_crm_contact_links_deal ON crm_contact_links(deal_id);
CREATE INDEX idx_crm_contact_links_partner ON crm_contact_links(partner_id);
CREATE INDEX idx_crm_contact_links_affiliate ON crm_contact_links(affiliate_id);

-- Stage history indexes
CREATE INDEX idx_crm_stage_history_object ON crm_stage_history(object_type, object_id);
CREATE INDEX idx_crm_stage_history_changed ON crm_stage_history(changed_at);

-- Activities indexes
CREATE INDEX idx_crm_activities_object ON crm_activities(object_type, object_id);
CREATE INDEX idx_crm_activities_type ON crm_activities(type);
CREATE INDEX idx_crm_activities_created ON crm_activities(created_at);

-- ============================================
-- COMMENTS for Documentation
-- ============================================

COMMENT ON TABLE crm_contacts IS 'Individual people who may be associated with leads, deals, partners, or affiliates';
COMMENT ON TABLE crm_leads IS 'People/companies from cold outreach. Pipeline: New → Contacted → Qualified/Unqualified → Nurture';
COMMENT ON TABLE crm_deals IS 'Qualified opportunities with pipeline and value. Pipeline: Qualified → Proposal → Contract → Closed Won/Lost → Nurture';
COMMENT ON TABLE crm_partners IS 'BD relationships and cross-partnerships. Lifecycle: Active/Inactive';
COMMENT ON TABLE crm_affiliates IS 'KOLs, referrers with rev-share or commission. Lifecycle: New → Active → Inactive';
COMMENT ON TABLE crm_contact_links IS 'Junction table linking contacts to leads, deals, partners, or affiliates';
COMMENT ON TABLE crm_stage_history IS 'Tracks all status/stage changes for analytics and reporting';
COMMENT ON TABLE crm_activities IS 'Tracks all interactions and activities across CRM objects';
