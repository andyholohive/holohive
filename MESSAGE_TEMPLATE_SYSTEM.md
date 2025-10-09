# 🤖 AI Message Template & Learning System

## Overview

Your AI agent can now generate professional client messages that **continuously learn and improve** from your feedback. The system uses your provided templates and learns from every message you edit or rate.

## ✨ Key Features

### 1. **Template-Based Generation**
- 9 pre-loaded templates covering your entire client journey
- Automatic variable filling (CLIENT_NAME, PROJECT_NAME, etc.)
- Consistent tone and formatting

### 2. **Continuous Learning**
- AI searches for similar past messages
- Learns from highly-rated messages
- Adapts to your editing patterns
- Gets better with every use

### 3. **Vector Search**
- Finds relevant examples using AI embeddings
- Understands context and similarity
- Only learns from messages you actually sent

### 4. **Feedback Tracking**
- Tracks user edits vs AI original
- Records ratings (1-5 stars)
- Monitors which templates work best

---

## 📋 Available Message Types

| Type | Description | When to Use |
|------|-------------|-------------|
| `initial_outreach` | Proposal introduction | First contact with client |
| `nda_request` | NDA signing request | Before sharing campaign details |
| `kol_list_access` | Request email for list access | Before sending KOL list |
| `kol_list_delivery` | Deliver KOL list | After client provides email |
| `final_kol_picks` | Discuss strategy after picks | Client selected KOLs |
| `post_call_followup` | Follow-up after call | Post-meeting recap |
| `contract_activation` | Contract & payment details | Contract signing phase |
| `activation_day` | Launch day coordination | Day of campaign launch |
| `final_report` | Campaign results & report | Post-campaign analysis |

---

## 🚀 How to Use (Agent Commands)

### Basic Usage
```
"Generate an initial outreach message for Jdot campaign"
"Create an NDA request for Acme Corp"
"Write a final report message for the Token Launch campaign"
```

### With Custom Variables
```
"Generate a final report for Jdot with these details:
- CAMPAIGN_REPORT_LINK: https://drive.google.com/report123
- TGE_LAUNCH: January 15th"
```

### With Custom Instructions
```
"Generate an initial outreach message for Jdot, but make it more casual
and emphasize our experience with gaming influencers"
```

---

## 🔄 How Learning Works

### Step-by-Step Learning Flow

```mermaid
graph TD
    A[User: "Generate message"] --> B[AI: Get template]
    B --> C[AI: Fill variables automatically]
    C --> D[AI: Search for similar past messages]
    D --> E[AI: Use best examples for context]
    E --> F[AI: Generate enhanced message]
    F --> G[User: Edit message]
    G --> H[System: Save edited version]
    H --> I[System: Update embeddings]
    I --> J[Next time: This becomes an example!]
```

### What Gets Learned

✅ **Your Edits** - Every change you make improves future messages
✅ **High Ratings** - 5-star messages become priority examples
✅ **Sent Messages** - Only learns from messages you actually sent
✅ **Context Patterns** - Understands which style works for which situation

---

## 📊 Auto-Filled Variables

The agent automatically fills these from your database:

| Variable | Source | Example |
|----------|--------|---------|
| `CLIENT_NAME` | Client record | "Acme Corp" |
| `CLIENT_HANDLE` | Client name | "@acmecorp" |
| `EMAIL_ADDRESS` | Client email | "john@acme.com" |
| `PROJECT_NAME` | Campaign name | "Token Launch 2025" |
| `CAMPAIGN_NAME` | Campaign name | "Q4 Marketing" |
| `TGE_LAUNCH` | Campaign start date | "2025-01-15" |

You can override any of these or add custom variables!

---

## 🎯 Example Usage

### Example 1: Simple Generation
**User:** "Generate an initial outreach for the Jdot Q4 campaign"

**Agent:**
```
✓ Using template: Initial Outreach / Proposal
✓ Auto-filled: CLIENT_NAME = "Jdot"
✓ Auto-filled: PROJECT_NAME = "Jdot Q4"
✓ Found 2 similar high-rated messages for context
✓ Generated message (saved for learning)

Message:
---
GM Jdot,

Per our conversation, we are happy to share our proposal for Jdot Q4.

Breakdown
In this proposal, you will find a breakdown of our approach, overview,
goals, and costs.

Focus
The focus is on driving awareness and growth for Jdot Q4 through a
comprehensive influencer marketing strategy ahead of your token launch.

We'd be happy to walk you through the details or answer any questions
you might have. Thanks for your time and consideration!

View Proposal ↗
```

### Example 2: Custom Variables
**User:** "Generate a final report for Jdot, report link is https://drive.google.com/xyz"

**Agent:**
```
✓ Using template: Final Campaign Report
✓ Auto-filled: CLIENT_NAME = "Jdot"
✓ Auto-filled: TGE_LAUNCH = "2025-10-06"
✓ Custom variable: CAMPAIGN_REPORT_LINK = "https://drive.google.com/xyz"
✓ Generated message

Message:
---
Hey team,

We're happy to share the campaign report for your token launch, including:
- Key metrics
- Performance highlights
- Audience engagement
- Post-campaign recommendations

You can view the report here: https://drive.google.com/xyz

Let us know if you have any questions or would like to schedule a time
to discuss the findings in more detail.

Thanks again for the opportunity to collaborate — we're excited about
what's next.
```

---

## 📈 Database Schema

### Tables Created

1. **message_templates** - Your reusable templates
2. **client_message_examples** - Every message generated (with embeddings)
3. **ai_message_feedback** - Tracks edits, ratings, and improvements
4. **template_usage_analytics** - Performance metrics per template

### Embeddings

Each message is converted to a 1536-dimension vector using OpenAI's `text-embedding-3-small` model, enabling semantic similarity search.

---

## 🛠️ Setup Instructions

### 1. Run the Migration

```bash
# Apply the migration to your database
psql your_database < sql/migrations/010_add_message_templates_and_learning.sql

# OR in Supabase Dashboard:
# SQL Editor → New Query → Paste migration → Run
```

### 2. Verify Templates Loaded

The migration automatically loads 9 templates. Verify:

```sql
SELECT name, message_type FROM message_templates WHERE is_active = true;
```

You should see:
- Initial Outreach / Proposal
- NDA Request
- KOL List Access Coordination
- KOL List Delivery
- Final KOL Picks & Strategy
- Post-Call Follow-Up
- Contract & Activation Details
- Activation Day Update
- Final Campaign Report

### 3. Test It Out!

Ask the agent:
```
"Generate an initial outreach message for my newest client"
```

---

## 🎨 Future Enhancements (Optional)

### Phase 2: UI for Feedback
- Rate messages with 1-5 stars in chat
- Edit messages inline
- Mark as "Sent" to train the system
- View learning statistics

### Phase 3: Advanced Learning
- A/B testing different message styles
- Automatic subject line generation
- Client-specific style adaptation
- Performance correlation (open rates, response rates)

### Phase 4: Template Management
- Create custom templates in UI
- Clone and modify existing templates
- Template versioning
- Team template sharing

---

## 📝 Pro Tips

### 1. **Provide Feedback**
The more you edit and rate messages, the better they become!

### 2. **Use Specific Types**
Use the exact message type names for best results:
```
✅ "Generate kol_list_delivery for Acme"
❌ "Generate a list message for Acme"
```

### 3. **Add Context**
Include campaign details for better personalization:
```
"Generate final_report for Jdot Q4 campaign"
```

### 4. **Override When Needed**
Override auto-filled variables:
```
"Generate initial_outreach with CLIENT_NAME = 'Acme Gaming Division'"
```

---

## 🔧 Technical Details

### Agent Tool Updated

**Tool:** `generate_client_message`

**New Parameters:**
- `message_type` - Template type to use
- `client_id` - UUID of client (required)
- `campaign_id` - UUID of campaign (optional)
- `custom_instructions` - Additional guidance for AI
- `variables` - Custom variable overrides
- `use_learning` - Enable/disable learning (default: true)

**Returns:**
- Generated message content
- Message example ID (for feedback tracking)
- Template ID used
- Variables that were filled
- Learning status

### Learning Metrics Tracked

- Total messages generated
- AI-generated vs manual count
- Messages sent vs drafted
- Edit frequency and patterns
- Average user ratings
- Template usage statistics
- Most successful message types

---

## 🚨 Important Notes

1. **Privacy**: All messages are tied to your user ID and protected by RLS
2. **Learning Scope**: Only learns from messages YOU sent (not other users)
3. **Template Safety**: Original templates cannot be accidentally deleted
4. **Embeddings**: Generated async, ~200ms per message
5. **Context Window**: Retrieves top 3 similar messages for context

---

## 📞 Support

If you have questions or want to add custom templates, the system is fully extensible!

### Files Created:
- `sql/migrations/010_add_message_templates_and_learning.sql` - Database schema
- `lib/messageTemplateService.ts` - Service layer
- Enhanced `lib/agentTools.ts` - Updated generate_client_message tool

---

**Happy Messaging! 🎉**

Your agent is now smarter and will continuously improve with every message you send.
