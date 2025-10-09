-- ============================================================================
-- Update All Message Templates
-- ============================================================================
-- This migration updates all message templates with the complete set
-- ============================================================================

-- First, set template_id to NULL for all existing message examples
-- This breaks the foreign key reference so we can delete templates
UPDATE client_message_examples SET template_id = NULL WHERE template_id IS NOT NULL;

-- Delete existing templates
DELETE FROM message_templates;

-- Insert all 17 templates
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
  'Request for Activation Inputs',
  'activation_inputs',
  NULL,
  E'We''re excited to kick off this campaign and have received payment. We will initiate outreach and keep you updated on our negotiations. To ensure a smooth process for both our teams and the KOL, we need the following information:\n\n1. Activation Strategy\n\n- Activation Method:\nDo you prefer creators to post original tweets, quote retweets, or a mix?\n- Regional Focus:\nBased on our call, the initial activation focus will be:\n- Korea via Telegram\n- Global & China via X\nLet us know if you''d like to adjust this breakdown.\n\n2. Campaign Fundamentals\n\n- Creator Brief: Provide a comprehensive brief, including clear CTAs (beyond token purchases).\n- Brand Guidelines: Provide guidelines to ensure consistent messaging and visuals.\n- Brand Assets & Visuals: Supply logos, images, videos, and other visual assets.\n- Campaign Narrative: Share a clear summary of your core messaging and what sets your brand/product apart.\n\n3. Campaign Specifics & Timeline\n\n- Key Activation Date: What is the primary campaign activation date?\n- Exchange Listing Updates: Provide any relevant exchange listing updates or significant news that may influence creator content or timing.',
  '[]'::jsonb
),
(
  'Budget & Activation Plan',
  'budget_plan',
  NULL,
  E'Here''s a breakdown of how we''ll approach the KOL campaign, addressing your questions regarding budget and activations:\n\nBudget Allocation & Activations\nWith the provided budget, all activations will be one-time engagements.\n\nFollowing the initial activations, we''ll evaluate performance to identify KOLs best suited for more activations / a longer-term relationship. Those we continue with will receive discounted pricing per post. With this we''ll require an additional budget.\n\nIf there''s a specific KOL you''re considering for a longer-term partnership, we''d be happy to help facilitate that discussion early.\n\nBudget Split\nBy default, we''ll allocate the budget almost evenly across Global, China, and Korea KOLs unless you''d prefer a different distribution.\n\nKOL Outreach & Selection\nOur process for engaging KOLs involves:\n\n- We''ll outreach to gauge interest and confirm their pricing for the activation.\n- The tracking sheet will be updated to reflect their interest ("Interested" with price, or "Rejected").\n- Finally, we''ll confirm your selections from the interested KOLs, incorporating our recommendations.',
  '[]'::jsonb
),
(
  'Outreach Progress Update',
  'outreach_update',
  NULL,
  E'Hey team,\n\nJust wanted to send a quick note your way! We''re deep into outreach for the campaign and already seeing strong interest. It looks like we''ll have a good selection of options to consider.',
  '[]'::jsonb
),
(
  'Finalizing KOLs',
  'finalizing_kols',
  NULL,
  E'Hey team,\n\nQuick update! We''ve locked in our Global KOLs and are now confirming our Chinese and Korean KOLs.\n\nWe''ll have the full roster for the activation ready for you by [DATE]. From there, we''ll review the KOL drafts and be set for launch!',
  '["DATE"]'::jsonb
),
(
  'Creator Brief',
  'creator_brief',
  NULL,
  E'Here''s the brief we created to send to our creators:\n[BRIEF_LINK]\n\nLet me know if you have any questions or want to make any changes/additions!',
  '["BRIEF_LINK"]'::jsonb
),
(
  'Final Checklist Before Launch',
  'final_checklist',
  NULL,
  E'Hey team,\n\nQuick update — our final list is now complete and available [HERE].\n\nWe''ve confirmed [X] creators across [X] activations. Here''s the regional breakdown:\n\n- China: [X]\n- Korea: [X]\n- Global: [X]\n\nWe''re also in the process of reviewing all content drafts over the weekend, and everything is in check for activations ahead of [TGE_LAUNCH]!\n\nLet me know if you have any questions or need further details.',
  '["TGE_LAUNCH"]'::jsonb
),
(
  'Activation Day Update',
  'activation_day',
  NULL,
  E'Hey team,\n\nJust a quick update—everything is locked in and ready to go.\n\nThe KOL drafts have been reviewed and approved, and our team has confirmed alignment with all creators on timing.\n\nOnce the main tweet is live, let us know! We''ll coordinate with KOLs for timely quote retweets and follow-up content. All posts will be updated in our tracker sheet [HERE].\n\nLet us know if you want a final sync today or need anything else ahead of go-time!',
  '[]'::jsonb
),
(
  'Mid-Campaign Update & Performance Highlights',
  'mid_campaign_update',
  NULL,
  E'Hey team,\n\nFirst off, huge congrats on the [TGE_LAUNCH]! We know how much work goes into getting to this point, and it''s been a pleasure supporting you throughout the lead-up. These moments are never easy to pull off, and your team executed it impressively.\n\nWe wanted to provide a quick mid-day update on the campaign:\n\n[X] out of [X] KOLs have posted so far, and traction is strong—we''ve already hit #3 in Korea for mindshare, with 2 of the top 3 highest-reach posts coming from our campaign. More content is scheduled to go live later tonight as Asia wakes up, so we expect momentum to continue building through tomorrow.\n\nNext steps:\n\n- We''ll continue tracking performance through the final wave. Updates to follow 48 hours after the last post goes live.\n\n- A full campaign report with stats, reach, and insights will be delivered by [DATE], once all data is consolidated.\n\nWe''re also already brainstorming ideas for the next round of activations, using what''s performed best here to double down on what''s working and maximize post-TGE exposure. Please let us know the remaining post-TGE budget.\n\nLooking forward to hearing your thoughts and building on the momentum!',
  '["TGE_LAUNCH", "DATE"]'::jsonb
),
(
  'Initial Results & Creator Activation Summary',
  'initial_results',
  NULL,
  E'Hey team!\n\nWe have processed the results of the campaign and are happy to present the initial findings. The campaign generated a total of [X] impressions across X and Telegram.\n\nOn X, we had a total of:\n\n- [X] impressions\n- [X] comments\n- [X] RTs\n- [X] likes,\n- [X] total engagements\n\nIn this campaign, a total of [X] creators were activated, [X] from China, [X] Global and [X] from Korea. There were [X] alpha calls activated in private discord communities as a bonus!\n\nAll creators have been activated from China and Global regions. We have [X] posts remaining from Korean creators that are ready for the next activations. As promised, we will have a full report sent over by [DATE].\n\nHope you all have a great weekend and look forward to continuing to work together!',
  '["DATE"]'::jsonb
),
(
  'Final Campaign Report & Post-Activation Recommendations',
  'final_report',
  NULL,
  E'Hey team,\n\nWe''re happy to share the campaign report for your [TGE_LAUNCH], including:\n- Key metrics\n- Performance highlights\n- Audience engagement\n- Post-campaign recommendations\n\nYou can view the report here: [CAMPAIGN_REPORT_LINK]\n\nLet us know if you have any questions or would like to schedule a time to discuss the findings in more detail.\n\nThanks again for the opportunity to collaborate — we''re excited about what''s next.',
  '["TGE_LAUNCH", "CAMPAIGN_REPORT_LINK"]'::jsonb
);
