# Quick Start: Enable RAG (Retrieval-Augmented Generation)

**Time Required:** 10-15 minutes
**Cost:** < $0.05

---

## 🎯 What You're Setting Up

RAG (Retrieval-Augmented Generation) enables your AI assistant to:
- **Understand natural language** queries about KOLs, campaigns, clients
- **Find relevant matches** using semantic similarity (not just keywords)
- **Power intelligent actions** (auto-create lists, suggest KOLs, etc.)

**Example:** Instead of filtering by exact fields, you can ask:
> "Find crypto educators in Korea with engaged communities"

And the AI will understand and return relevant results! 🚀

---

## ✅ Step-by-Step Setup

### Step 1: Enable pgvector in Supabase (1 min)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: **cjvhpxetudsvnzfkvrgw**
3. Click **Database** in left sidebar
4. Click **Extensions** tab
5. Search for `vector`
6. Click **Enable** next to "vector"
7. Wait for confirmation (green checkmark)

✅ **Checkpoint:** Vector extension shows as "Enabled"

---

### Step 2: Run Database Migration (1 min)

**Option A: Using Supabase Dashboard (Recommended)**

1. In Supabase Dashboard, click **SQL Editor** in left sidebar
2. Click **New query**
3. Open file: `sql/migrations/005_add_pgvector_embeddings.sql` on your computer
4. Copy ALL contents (340 lines)
5. Paste into SQL Editor
6. Click **Run** (or press Cmd/Ctrl + Enter)
7. Wait for success message

✅ **Checkpoint:** You should see:
```
Success. No rows returned
```

**Option B: Using Supabase CLI**

```bash
# If you have Supabase CLI installed
supabase db push
```

---

### Step 3: Install TypeScript Executor (30 sec)

```bash
npm install tsx --save-dev
```

This allows you to run the TypeScript scripts.

---

### Step 4: Index Your Existing Data (5-10 min)

Run the indexing script:

```bash
npx tsx scripts/index-embeddings.ts
```

**What happens:**
1. Fetches all KOLs from database
2. Generates vector embeddings for each KOL
3. Stores embeddings in vector database
4. Shows progress bar

**Expected Output:**
```
🚀 Starting Embedding Indexing Process...

📊 Indexing KOLs...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Found 150 KOLs to index

Processing batch 1/2...
Processing batch 2/2...

✅ KOL Indexing Complete
   Processed: 150/150
   Failed: 0

═══════════════════════════════════════════════════
📋 INDEXING SUMMARY
═══════════════════════════════════════════════════
Total Time: 45.2s
Results:
  KOLs:      150 processed, 0 failed
  Campaigns: 0 processed, 0 failed
  Clients:   0 processed, 0 failed

✅ All indexing completed successfully!
```

✅ **Checkpoint:** All KOLs indexed successfully

**Note:** If you have many KOLs (1000+), this might take 10-15 minutes. That's normal!

---

### Step 5: Test Search Quality (1 min)

Run the test script:

```bash
npx tsx scripts/test-vector-search.ts
```

**What happens:**
1. Runs 12 test queries
2. Shows search results for each query
3. Evaluates quality with scores

**Expected Output:**
```
╔════════════════════════════════════════════════════════╗
║  Vector Search Quality Test                           ║
║  Testing semantic search with various queries         ║
╚════════════════════════════════════════════════════════╝

Checking index status...
Indexed data:
  KOLs:      150
  Campaigns: 0
  Clients:   0

Running 12 test queries...

Test 1: Regional Search
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Query: "Find crypto educators in Korea with 100k followers"

Results (5 found in 85ms):
   1. Korean Crypto Expert
      Score: 87.3%
      Region: Korea
      Platform: X, Telegram
      Followers: 125,000
      Creator Type: Educator
      Content: Technical Education, Deep Dive

   ...

═══════════════════════════════════════════════════════
📊 TEST SUMMARY
═══════════════════════════════════════════════════════
Total Tests: 12
Successful: 12/12
Average Similarity Score: 81.2%
Average Query Time: 78ms

Quality Distribution:
  Excellent (≥80%): 8
  Good (70-79%): 3
  Fair (60-69%): 1
  Poor (<60%): 0

✅ PASS - Search quality is excellent!
```

✅ **Checkpoint:** Test passes with good quality scores

---

## 🎉 Success! What Now?

### Your RAG system is now active! You can:

**1. Try it in code:**
```typescript
import { VectorStore } from './lib/vectorStore';

// Natural language search
const results = await VectorStore.searchKOLs(
  "Find meme creators in Southeast Asia"
);

console.log(results);
// Returns: Array of matching KOLs with similarity scores
```

**2. Test different queries:**
```bash
# Modify test-vector-search.ts to add your own queries
# Then run again
npx tsx scripts/test-vector-search.ts
```

**3. Move to Phase 2:**
Start building the Agent Tools that will USE this RAG system!

---

## 🔧 Troubleshooting

### Error: "vector extension not found"
**Solution:** Go back to Step 1 and enable the vector extension in Supabase

### Error: "table kol_embeddings does not exist"
**Solution:** Run the SQL migration from Step 2

### Error: "OpenAI API key not found"
**Solution:** Check your `.env.local` file has:
```
OPENAI_API_KEY=sk-...
```

### Low similarity scores in tests
**Solution:**
1. Check that KOL descriptions are filled in
2. Ensure region, platform, content_type fields have data
3. Consider re-indexing after adding more data

### Slow indexing (> 20 minutes for 1000 KOLs)
**Solution:**
1. This is normal for large datasets
2. The script batches in groups of 100
3. Waits 1 second between batches to avoid rate limits
4. You can monitor progress in real-time

---

## 📊 What Was Created

### Database Tables:
- `kol_embeddings` - Vector embeddings for KOLs
- `campaign_embeddings` - Vector embeddings for campaigns
- `client_embeddings` - Vector embeddings for clients

### Database Functions:
- `match_kols()` - Search KOLs by similarity
- `match_campaigns()` - Search campaigns
- `match_clients()` - Search clients

### New Files:
- `lib/vectorStore.ts` - Vector operations service
- `scripts/index-embeddings.ts` - Indexing script
- `scripts/test-vector-search.ts` - Testing script
- `app/api/embeddings/route.ts` - API endpoint

---

## 💡 Pro Tips

### Keeping Embeddings Fresh

When you add/update KOLs, re-index them:

```bash
# Re-index all KOLs
npx tsx scripts/index-embeddings.ts --kols-only

# Or just index programmatically
import { VectorStore } from './lib/vectorStore';
await VectorStore.indexKOL(newKOL);
```

### Adjusting Search Sensitivity

```typescript
// More strict (only very similar results)
await VectorStore.searchKOLs(query, { threshold: 0.8 });

// More lenient (more results, less similar)
await VectorStore.searchKOLs(query, { threshold: 0.6 });
```

### Getting Stats

```typescript
const stats = await VectorStore.getStats();
console.log(stats);
// { kolCount: 150, campaignCount: 0, clientCount: 0 }
```

---

## 🚀 Next Steps

**Phase 1 Complete!** ✅

**Ready for Phase 2: Agent Tools**

The agent will be able to:
- Create campaigns automatically
- Find KOLs using natural language
- Build curated lists
- Generate client messages
- Analyze campaign performance

**Estimated time:** 4-5 hours of development

**Start when ready!** 🎯

---

## 📞 Need Help?

Check these files for more info:
- `AGENTIC_AI_IMPLEMENTATION.md` - Full implementation plan
- `PHASE_1_SUMMARY.md` - Detailed Phase 1 summary
- `lib/vectorStore.ts` - Source code with comments

**Having issues?** The most common problems are:
1. Vector extension not enabled → Go to Supabase Dashboard
2. Migration not run → Run SQL in SQL Editor
3. OpenAI key missing → Check `.env.local`
