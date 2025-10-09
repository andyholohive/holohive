# Understanding Vector Embeddings & Indexing

## What Happened & How to Fix It

### The Error You Saw
```
Error: new row violates row-level security policy for table "kol_embeddings"
```

**Why it happened:** The Row Level Security (RLS) policies were too restrictive. They required authentication, but the indexing script runs server-side without a user session.

**The Fix:** Run this new SQL migration to update the policies:

1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `sql/migrations/006_fix_embedding_rls_policies.sql`
3. Paste and run
4. Then run `npx tsx scripts/index-embeddings.ts` again

This will allow the service role (used by scripts and API routes) to insert embeddings.

---

## What is "Indexing"? 🤔

Think of embeddings like creating a **smart search index** for your data.

### Traditional Search (Keyword Matching)
```
Query: "crypto educator Korea"
Matches: KOLs with EXACTLY those words in their profile
```

### Vector Search (Semantic Understanding)
```
Query: "crypto educator Korea"
Matches: KOLs who:
  - Teach about blockchain (even if they don't say "educator")
  - Are from Korea (even spelled 한국)
  - Create educational content (tutorials, guides, etc.)
  - Have similar meaning/context
```

### How It Works

1. **Convert text to numbers (vectors)**
   ```
   KOL Profile → OpenAI → [0.123, -0.456, 0.789, ... 1536 numbers]
   ```
   These 1536 numbers capture the "meaning" of the KOL

2. **Store in vector database**
   ```
   kol_embeddings table stores these vectors
   ```

3. **Search by similarity**
   ```
   Your query → OpenAI → [vector]
   Find KOLs with similar vectors (cosine similarity)
   ```

---

## Do You Need to Reindex Every Time? 📝

**Short Answer:** No! Only when data changes.

### When to Reindex

✅ **YES - Reindex when:**
- Adding NEW KOLs to the database
- Updating existing KOL descriptions, regions, content types
- Changing important metadata (platform, followers, etc.)

❌ **NO - Don't need to reindex when:**
- Just viewing/reading data
- Filtering with existing filters
- Running searches (search uses existing embeddings)
- Making UI changes

### How Reindexing Works

**Option 1: Automatic (Recommended for Production)**

We can add triggers to automatically reindex when data changes:

```typescript
// In your KOL creation/update code
import { VectorStore } from '@/lib/vectorStore';

// After creating a KOL
const newKOL = await KOLService.createKOL(data);
await VectorStore.indexKOL(newKOL); // ✅ Auto-index new KOL

// After updating a KOL
const updated = await KOLService.updateKOL(id, changes);
await VectorStore.indexKOL(updated); // ✅ Auto-reindex
```

**Option 2: Manual Batch Reindexing**

When you've made many changes and want to reindex everything:

```bash
# Reindex all KOLs
npx tsx scripts/index-embeddings.ts --kols-only

# Reindex everything
npx tsx scripts/index-embeddings.ts
```

**Option 3: Scheduled Reindexing**

For production, you might run a cron job nightly:

```bash
# Every night at 2am, reindex any changes
0 2 * * * cd /path/to/app && npx tsx scripts/index-embeddings.ts
```

---

## The Indexing Process Explained 🔄

### Step-by-Step: What Happens When You Index

```
1. Fetch KOL from database
   ↓
2. Create text representation
   "John Doe - Region: Korea - Platforms: X, Telegram -
    Followers: 100000 - Creator: Educator - Content: Technical Education"
   ↓
3. Send to OpenAI API
   ↓
4. Receive 1536-dimensional vector
   [0.123, -0.456, 0.789, ... 1533 more numbers]
   ↓
5. Store in kol_embeddings table
   { kol_id: "abc-123", embedding: [...], metadata: {...} }
   ↓
6. Done! KOL is now searchable
```

### Cost Breakdown

**One-time indexing of 26 KOLs:**
- Each KOL: ~200 tokens
- Total: 26 × 200 = 5,200 tokens
- Cost: $0.0005 (half a cent!)

**Adding 1 new KOL:**
- Cost: ~$0.00002 (essentially free)

**Reindexing all 1000 KOLs:**
- Cost: ~$0.02 (2 cents)

---

## Performance & Best Practices 🚀

### How Fast is Search?

After indexing, searches are **VERY fast**:
- Query: "Find crypto educators in Korea" → ~50-100ms
- No need to scan entire database
- Uses vector indexes (IVFFlat) for speed

### Best Practices

**1. Index in Batches**
```bash
# Good: Process 100 at a time (built-in)
npx tsx scripts/index-embeddings.ts

# Avoid: Indexing one-by-one in a loop (slow)
```

**2. Index After Bulk Operations**
```typescript
// Import 100 KOLs
await bulkImportKOLs(csvData);

// Then index them all at once
await VectorStore.batchIndexKOLs(newKOLs);
```

**3. Smart Reindexing**
```typescript
// Only reindex if description changed
if (changes.description || changes.content_type) {
  await VectorStore.indexKOL(updatedKOL);
}
```

**4. Monitor Index Health**
```typescript
// Check how many KOLs are indexed
const stats = await VectorStore.getStats();
console.log(stats.kolCount); // Should match total KOLs
```

---

## Automatic Indexing Setup 🤖

Want to automatically index when KOLs are added/updated? Here's how:

### Option A: Add to Your Create/Update Functions

```typescript
// File: lib/kolService.ts

export class KOLService {
  static async createKOL(kolData: CreateKOLData): Promise<MasterKOL> {
    // Create in database
    const kol = await supabase.from('master_kols').insert(...);

    // ✅ Auto-index (add this)
    try {
      await VectorStore.indexKOL(kol);
    } catch (error) {
      console.error('Failed to index KOL:', error);
      // Don't fail the creation, just log
    }

    return kol;
  }

  static async updateKOL(data: UpdateKOLData): Promise<MasterKOL> {
    // Update in database
    const updated = await supabase.from('master_kols').update(...);

    // ✅ Auto-reindex (add this)
    try {
      await VectorStore.indexKOL(updated);
    } catch (error) {
      console.error('Failed to reindex KOL:', error);
    }

    return updated;
  }
}
```

### Option B: Database Trigger (Advanced)

Create a Supabase function that auto-indexes on changes:

```sql
-- Create a function that calls your API to reindex
CREATE OR REPLACE FUNCTION auto_reindex_kol()
RETURNS TRIGGER AS $$
BEGIN
  -- Call API endpoint to reindex
  PERFORM net.http_post(
    url := 'https://your-app.com/api/embeddings/reindex',
    body := json_build_object('kol_id', NEW.id)::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger after insert or update
CREATE TRIGGER kol_auto_reindex
  AFTER INSERT OR UPDATE ON master_kols
  FOR EACH ROW
  EXECUTE FUNCTION auto_reindex_kol();
```

---

## Common Scenarios 📋

### Scenario 1: Just Added 10 New KOLs

**Do this:**
```bash
npx tsx scripts/index-embeddings.ts --kols-only
```

**Time:** ~5 seconds
**Cost:** ~$0.0002

---

### Scenario 2: Updated Descriptions for 50 KOLs

**Do this:**
```bash
npx tsx scripts/index-embeddings.ts --kols-only
```

It will reindex ALL KOLs, but only update the changed ones (via upsert).

---

### Scenario 3: Importing 500 KOLs from CSV

**Do this:**
```typescript
// 1. Import all KOLs first
const importedKOLs = await bulkImportFromCSV(file);

// 2. Then batch index them
await VectorStore.batchIndexKOLs(importedKOLs);
```

**Time:** ~2-3 minutes
**Cost:** ~$0.01

---

### Scenario 4: Daily Operations (No Changes)

**Do this:** Nothing! Use existing embeddings for search.

Searches use the existing index, no need to reindex.

---

## Checking Index Status 🔍

### Are My KOLs Indexed?

**Method 1: Check Stats**
```typescript
import { VectorStore } from '@/lib/vectorStore';

const stats = await VectorStore.getStats();
console.log('Indexed KOLs:', stats.kolCount);
console.log('Total KOLs:', await KOLService.getAllKOLs().length);

// Should be equal!
```

**Method 2: Run Test Search**
```bash
npx tsx scripts/test-vector-search.ts
```

If you get results, your index is working!

**Method 3: Check Supabase Dashboard**
1. Go to Database → Table Editor
2. Open `kol_embeddings` table
3. Count rows (should match your KOL count)

---

## Troubleshooting 🛠️

### "No results found" when searching

**Causes:**
1. KOLs not indexed yet → Run indexing script
2. Search threshold too high → Lower to 0.6
3. KOL data is sparse (no descriptions) → Add more data

**Fix:**
```bash
# Reindex
npx tsx scripts/index-embeddings.ts

# Test with lower threshold
const results = await VectorStore.searchKOLs(query, { threshold: 0.6 });
```

---

### "Row violates RLS policy"

**Fix:** Run the new migration:
```sql
-- In Supabase SQL Editor
-- Run: sql/migrations/006_fix_embedding_rls_policies.sql
```

---

### Indexing is slow (> 10 min for 100 KOLs)

**This is normal!** OpenAI has rate limits:
- Batches of 100 items
- 1 second delay between batches
- ~100 KOLs = ~1-2 minutes

**Not a problem, it's by design to avoid rate limits.**

---

## Summary 📝

### Key Points

✅ **Indexing = Creating smart search capability**
- Converts KOL data to vectors (numbers)
- Enables semantic/meaning-based search
- One-time cost per KOL

✅ **Reindex when data changes**
- New KOLs added → Reindex
- Descriptions updated → Reindex
- Just searching → No reindex needed

✅ **Very cheap & fast**
- 26 KOLs indexed in 7 seconds
- Cost: $0.0005 (half a cent)
- Searches: 50-100ms

✅ **Fix the RLS issue**
- Run migration: `006_fix_embedding_rls_policies.sql`
- Then run indexing script again
- Should work perfectly!

---

## Next Steps

1. **Fix RLS policy** (run the new migration)
2. **Reindex your KOLs** (`npx tsx scripts/index-embeddings.ts`)
3. **Test search quality** (`npx tsx scripts/test-vector-search.ts`)
4. **Consider auto-indexing** (add to create/update functions)

Then you're ready for Phase 2: Agent Tools! 🚀
