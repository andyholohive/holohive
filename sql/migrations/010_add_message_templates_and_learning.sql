-- ============================================================================
-- Message Templates & Learning System
-- ============================================================================
-- This migration creates tables for storing message templates and learning
-- from user feedback to continuously improve AI-generated messages.
-- ============================================================================

-- Enable pgvector if not already enabled (for message embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 1. Message Templates Table
-- ============================================================================
-- Stores reusable message templates with variables
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  message_type TEXT NOT NULL, -- 'proposal', 'nda_request', 'kol_list_delivery', etc.
  subject TEXT,
  content TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb, -- Array of variable names like ["CLIENT_NAME", "PROJECT_NAME"]
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster template lookups
CREATE INDEX IF NOT EXISTS idx_message_templates_type ON message_templates(message_type);
CREATE INDEX IF NOT EXISTS idx_message_templates_active ON message_templates(is_active);

-- ============================================================================
-- 2. Message Examples Table (Learning Database)
-- ============================================================================
-- Stores actual messages sent to clients (for learning and context)
CREATE TABLE IF NOT EXISTS client_message_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  client_id UUID REFERENCES clients(id),
  campaign_id UUID REFERENCES campaigns(id),
  message_type TEXT NOT NULL,
  subject TEXT,
  content TEXT NOT NULL,

  -- Template tracking
  template_id UUID REFERENCES message_templates(id),
  was_ai_generated BOOLEAN DEFAULT false,
  original_ai_content TEXT, -- Store what AI originally generated

  -- User feedback
  user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
  was_edited BOOLEAN DEFAULT false,
  edit_count INTEGER DEFAULT 0,
  was_sent BOOLEAN DEFAULT false,

  -- Metadata
  context_data JSONB, -- Store campaign/client data at time of generation
  generation_parameters JSONB, -- Store tool parameters used

  -- Vector embedding for similarity search
  embedding VECTOR(1536),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_client_message_examples_user ON client_message_examples(user_id);
CREATE INDEX IF NOT EXISTS idx_client_message_examples_client ON client_message_examples(client_id);
CREATE INDEX IF NOT EXISTS idx_client_message_examples_campaign ON client_message_examples(campaign_id);
CREATE INDEX IF NOT EXISTS idx_client_message_examples_type ON client_message_examples(message_type);
CREATE INDEX IF NOT EXISTS idx_client_message_examples_rating ON client_message_examples(user_rating DESC);

-- Vector similarity search index
CREATE INDEX IF NOT EXISTS idx_client_message_examples_embedding
  ON client_message_examples
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ============================================================================
-- 3. Message Feedback Table
-- ============================================================================
-- Tracks detailed feedback on AI-generated messages
CREATE TABLE IF NOT EXISTS ai_message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_example_id UUID REFERENCES client_message_examples(id) ON DELETE CASCADE,

  -- Feedback details
  feedback_type TEXT, -- 'edit', 'rating', 'sent', 'discarded'
  before_content TEXT,
  after_content TEXT,
  edit_summary TEXT, -- What changed (auto-generated)

  -- Learning data
  user_comments TEXT,
  helpful_score INTEGER CHECK (helpful_score >= 1 AND helpful_score <= 5),

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_message_feedback_message ON ai_message_feedback(message_example_id);
CREATE INDEX IF NOT EXISTS idx_ai_message_feedback_type ON ai_message_feedback(feedback_type);

-- ============================================================================
-- 4. Template Usage Analytics
-- ============================================================================
-- Track template performance over time
CREATE TABLE IF NOT EXISTS template_usage_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES message_templates(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),

  -- Usage metrics
  generated_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  edited_count INTEGER DEFAULT 0,
  average_rating DECIMAL(3,2),

  -- Time periods
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(template_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_template_usage_analytics_template ON template_usage_analytics(template_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_analytics_period ON template_usage_analytics(period_start, period_end);

-- ============================================================================
-- 5. Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_message_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_message_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_usage_analytics ENABLE ROW LEVEL SECURITY;

-- Message Templates Policies
CREATE POLICY "Users can view all active templates"
  ON message_templates FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage templates"
  ON message_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Client Message Examples Policies
CREATE POLICY "Users can view their own message examples"
  ON client_message_examples FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own message examples"
  ON client_message_examples FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own message examples"
  ON client_message_examples FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own message examples"
  ON client_message_examples FOR DELETE
  USING (user_id = auth.uid());

-- Admins can see all examples
CREATE POLICY "Admins can view all message examples"
  ON client_message_examples FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- AI Message Feedback Policies
CREATE POLICY "Users can view feedback on their messages"
  ON ai_message_feedback FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM client_message_examples
      WHERE client_message_examples.id = ai_message_feedback.message_example_id
      AND client_message_examples.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create feedback on their messages"
  ON ai_message_feedback FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM client_message_examples
      WHERE client_message_examples.id = ai_message_feedback.message_example_id
      AND client_message_examples.user_id = auth.uid()
    )
  );

-- Template Usage Analytics Policies
CREATE POLICY "Users can view their own analytics"
  ON template_usage_analytics FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Admins can view all analytics"
  ON template_usage_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- ============================================================================
-- 6. Helper Functions
-- ============================================================================

-- Function to update template usage count
CREATE OR REPLACE FUNCTION increment_template_usage(template_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE message_templates
  SET
    usage_count = usage_count + 1,
    last_used_at = NOW(),
    updated_at = NOW()
  WHERE id = template_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate edit similarity (how much was changed)
CREATE OR REPLACE FUNCTION calculate_edit_similarity(
  original_text TEXT,
  edited_text TEXT
)
RETURNS DECIMAL AS $$
DECLARE
  original_length INTEGER;
  edited_length INTEGER;
  max_length INTEGER;
BEGIN
  original_length := LENGTH(original_text);
  edited_length := LENGTH(edited_text);
  max_length := GREATEST(original_length, edited_length);

  IF max_length = 0 THEN
    RETURN 1.0;
  END IF;

  -- Simple similarity based on length difference
  -- More sophisticated would use Levenshtein distance
  RETURN 1.0 - (ABS(original_length - edited_length)::DECIMAL / max_length);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. Insert Initial Templates
-- ============================================================================

-- Insert the provided templates
INSERT INTO message_templates (name, message_type, subject, content, variables) VALUES
(
  'Initial Outreach / Proposal',
  'initial_outreach',
  NULL,
  E'GM [CLIENT_NAME],\n\nPer our conversation, we are happy to share our proposal for [PROJECT_NAME].\n\nBreakdown\nIn this proposal, you will find a breakdown of our approach, overview, goals, and costs.\n\nFocus\nThe focus is on driving awareness and growth for [PROJECT_NAME] through a comprehensive influencer marketing strategy ahead of your [TGE_LAUNCH].\n\nWe''d be happy to walk you through the details or answer any questions you might have. Thanks for your time and consideration!\n\nView Proposal ↗',
  '["CLIENT_NAME", "PROJECT_NAME", "TGE_LAUNCH"]'::jsonb
),
(
  'NDA Request',
  'nda_request',
  NULL,
  E'Please review and sign the NDA linked below so we can move forward and share full campaign details openly and securely. Thanks!\n\nSign NDA Here',
  '[]'::jsonb
),
(
  'KOL List Access Coordination',
  'kol_list_access',
  NULL,
  E'We''ll send you a curated list of our KOLs shortly, specializing in:\n• Gaming\n• General Web3/Trading\n• Key Asia Markets (China/Korea)\n\nTo ensure smooth coordination, let us know which email addresses you''d like us to grant access to.\n\nLooking forward to aligning on next steps!',
  '[]'::jsonb
),
(
  'KOL List Delivery',
  'kol_list_delivery',
  NULL,
  E'Hi [@CLIENT_HANDLE],\n\nAttached below is a curated list of high-impact KOLs in our network. We''ve shared the KOL list with [EMAIL_ADDRESS]. Let me know if you''d like to extend access to any additional team members.\n\nAs mentioned, the KOLs included are focused on:\n• Gaming\n• General Web3/Trading\n• Key Asia Markets (China/Korea)\n\nIf you have questions about any specific KOLs or need help narrowing down options, feel free to reach out. Happy to hop on a call if helpful!\n\nView List ↗',
  '["CLIENT_HANDLE", "EMAIL_ADDRESS"]'::jsonb
),
(
  'Final KOL Picks & Strategy',
  'final_kol_picks',
  NULL,
  E'GM [@CLIENT_HANDLE],\n\nSaw your final KOL picks - great! We''re all set to start reaching out and getting them engaged.\n\nTo kick things off, let''s chat about the strategy for this KOL campaign. If you''ve got a plan in place, awesome, please share it over!\n\nIf you''re looking for input on the most effective engagement strategy, feel free to book a call here: https://calendly.com/yanolima/connect\n\nLooking forward to getting this moving!',
  '["CLIENT_HANDLE"]'::jsonb
),
(
  'Post-Call Follow-Up',
  'post_call_followup',
  NULL,
  E'Hey [@CLIENT_HANDLE] - great speaking with you today! We''ll get the contract finalized and sent your way shortly.\n\nOnce reviewed and signed, we''ll begin:\n- Outreach to secure priority KOLs\n- Provide additional KOL options\n\nWe''re excited to get the ball rolling! If you have any questions in the meantime, we''re here to help.',
  '["CLIENT_HANDLE"]'::jsonb
),
(
  'Contract & Activation Details',
  'contract_activation',
  NULL,
  E'Hi [@CLIENT_HANDLE],\n\nHope all is well! The contract has been sent to [EMAIL_ADDRESS] for your review and signature.\n\nNext steps:\n- Review and Sign: Please review the contract at your convenience.\n- Initial Payment: Once signed, we''ll move forward with the initial payment, covering the minimum spend allocation.\n\nFor added clarity from the previous message, here''s a recap of what''s next:\n- Outreach to secure priority KOLs.\n- Provide additional KOL options based on final rejections.\n- Send a brief strategy recap for the first activation based on our call.\n\nPlease let us know if you have any questions. Looking forward to this!',
  '["CLIENT_HANDLE", "EMAIL_ADDRESS"]'::jsonb
),
(
  'Activation Day Update',
  'activation_day',
  NULL,
  E'Hey team,\n\nJust a quick update—everything is locked in and ready to go.\n\nThe KOL drafts have been reviewed and approved, and our team has confirmed alignment with all creators on timing.\n\nOnce the main tweet is live, let us know! We''ll coordinate with KOLs for timely quote retweets and follow-up content. All posts will be updated in our tracker sheet [HERE].\n\nLet us know if you want a final sync today or need anything else ahead of go-time!',
  '[]'::jsonb
),
(
  'Final Campaign Report',
  'final_report',
  NULL,
  E'Hey team,\n\nWe''re happy to share the campaign report for your [TGE_LAUNCH], including:\n- Key metrics\n- Performance highlights\n- Audience engagement\n- Post-campaign recommendations\n\nYou can view the report here: [CAMPAIGN_REPORT_LINK]\n\nLet us know if you have any questions or would like to schedule a time to discuss the findings in more detail.\n\nThanks again for the opportunity to collaborate — we''re excited about what''s next.',
  '["TGE_LAUNCH", "CAMPAIGN_REPORT_LINK"]'::jsonb
);

-- ============================================================================
-- 8. Vector Similarity Search Function
-- ============================================================================

-- Function to search for similar messages using vector embeddings
CREATE OR REPLACE FUNCTION search_similar_messages(
  query_embedding TEXT,
  message_type_filter TEXT DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  message_type TEXT,
  content TEXT,
  user_rating INTEGER,
  was_sent BOOLEAN,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cme.id,
    cme.user_id,
    cme.message_type,
    cme.content,
    cme.user_rating,
    cme.was_sent,
    1 - (cme.embedding <=> query_embedding::vector) AS similarity
  FROM client_message_examples cme
  WHERE
    (message_type_filter IS NULL OR cme.message_type = message_type_filter)
    AND cme.was_sent = true -- Only learn from messages that were actually sent
    AND 1 - (cme.embedding <=> query_embedding::vector) > match_threshold
  ORDER BY cme.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. Create updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_message_templates_updated_at
  BEFORE UPDATE ON message_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_message_examples_updated_at
  BEFORE UPDATE ON client_message_examples
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_template_usage_analytics_updated_at
  BEFORE UPDATE ON template_usage_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
