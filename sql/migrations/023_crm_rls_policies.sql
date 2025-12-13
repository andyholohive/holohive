-- CRM Row Level Security Policies
-- Enables access control for all CRM tables

-- ============================================
-- Enable RLS on all CRM tables
-- ============================================

ALTER TABLE crm_affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contact_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_stage_history ENABLE ROW LEVEL SECURITY;

-- ============================================
-- CRM AFFILIATES POLICIES
-- ============================================

-- All authenticated users can view affiliates
CREATE POLICY "Users can view all affiliates"
  ON crm_affiliates FOR SELECT
  TO authenticated
  USING (true);

-- Users can create affiliates
CREATE POLICY "Users can create affiliates"
  ON crm_affiliates FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can update affiliates they own or if they're admin
CREATE POLICY "Users can update own affiliates or admin can update all"
  ON crm_affiliates FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Users can delete affiliates they own or if they're admin
CREATE POLICY "Users can delete own affiliates or admin can delete all"
  ON crm_affiliates FOR DELETE
  TO authenticated
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- ============================================
-- CRM OPPORTUNITIES POLICIES
-- ============================================

-- All authenticated users can view opportunities
CREATE POLICY "Users can view all opportunities"
  ON crm_opportunities FOR SELECT
  TO authenticated
  USING (true);

-- Users can create opportunities
CREATE POLICY "Users can create opportunities"
  ON crm_opportunities FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can update opportunities they own or if they're admin
CREATE POLICY "Users can update own opportunities or admin can update all"
  ON crm_opportunities FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Users can delete opportunities they own or if they're admin
CREATE POLICY "Users can delete own opportunities or admin can delete all"
  ON crm_opportunities FOR DELETE
  TO authenticated
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- ============================================
-- CRM PARTNERS POLICIES
-- ============================================

-- All authenticated users can view partners
CREATE POLICY "Users can view all partners"
  ON crm_partners FOR SELECT
  TO authenticated
  USING (true);

-- Users can create partners
CREATE POLICY "Users can create partners"
  ON crm_partners FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can update partners they own or if they're admin
CREATE POLICY "Users can update own partners or admin can update all"
  ON crm_partners FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Users can delete partners they own or if they're admin
CREATE POLICY "Users can delete own partners or admin can delete all"
  ON crm_partners FOR DELETE
  TO authenticated
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- ============================================
-- CRM CONTACTS POLICIES
-- ============================================

-- All authenticated users can view contacts
CREATE POLICY "Users can view all contacts"
  ON crm_contacts FOR SELECT
  TO authenticated
  USING (true);

-- Users can create contacts
CREATE POLICY "Users can create contacts"
  ON crm_contacts FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can update contacts they own or if they're admin
CREATE POLICY "Users can update own contacts or admin can update all"
  ON crm_contacts FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Users can delete contacts they own or if they're admin
CREATE POLICY "Users can delete own contacts or admin can delete all"
  ON crm_contacts FOR DELETE
  TO authenticated
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- ============================================
-- CRM CONTACT LINKS POLICIES
-- ============================================

-- All authenticated users can view contact links
CREATE POLICY "Users can view all contact links"
  ON crm_contact_links FOR SELECT
  TO authenticated
  USING (true);

-- Users can create contact links
CREATE POLICY "Users can create contact links"
  ON crm_contact_links FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can update contact links
CREATE POLICY "Users can update contact links"
  ON crm_contact_links FOR UPDATE
  TO authenticated
  USING (true);

-- Users can delete contact links
CREATE POLICY "Users can delete contact links"
  ON crm_contact_links FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- CRM STAGE HISTORY POLICIES
-- ============================================

-- All authenticated users can view stage history
CREATE POLICY "Users can view all stage history"
  ON crm_stage_history FOR SELECT
  TO authenticated
  USING (true);

-- Users can create stage history entries
CREATE POLICY "Users can create stage history"
  ON crm_stage_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Stage history should not be updated (audit trail)
-- No UPDATE policy

-- Stage history should not be deleted (audit trail)
-- No DELETE policy
