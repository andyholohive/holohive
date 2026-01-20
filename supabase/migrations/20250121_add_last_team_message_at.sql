-- Add last_team_message_at field to crm_opportunities table
-- This tracks when a team member (not bot) last messaged in the Telegram group
-- Distinguishes between team responses vs bot auto-replies

ALTER TABLE crm_opportunities
ADD COLUMN IF NOT EXISTS last_team_message_at TIMESTAMP WITH TIME ZONE;

-- Add comment for clarity
COMMENT ON COLUMN crm_opportunities.last_team_message_at IS 'When a team member (user with telegram_id in users table) last messaged in the TG group';
COMMENT ON COLUMN crm_opportunities.last_message_at IS 'When the lead/others (non-team, non-bot) last messaged in the TG group';
COMMENT ON COLUMN crm_opportunities.last_reply_at IS 'When our bot last messaged in the TG group';
