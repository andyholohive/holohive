/**
 * Embedding Indexing Script
 *
 * One-time script to generate and store embeddings for all existing data
 * Run this after setting up pgvector to index KOLs, campaigns, and clients
 *
 * Usage:
 *   npx tsx scripts/index-embeddings.ts
 *
 * Options:
 *   --kols-only      Index only KOLs
 *   --campaigns-only Index only campaigns
 *   --clients-only   Index only clients
 *   --dry-run        Show what would be indexed without actually doing it
 *
 * @author AI Assistant
 * @date 2025-10-02
 */

import { VectorStore } from '../lib/vectorStore';
import { supabaseScript } from '../lib/supabase-script';
import { MasterKOL } from '../lib/kolService';

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  kolsOnly: args.includes('--kols-only'),
  campaignsOnly: args.includes('--campaigns-only'),
  clientsOnly: args.includes('--clients-only'),
  dryRun: args.includes('--dry-run'),
};

// If no specific option, index everything
const indexAll = !options.kolsOnly && !options.campaignsOnly && !options.clientsOnly;

/**
 * Main indexing function
 */
async function main() {
  console.log('🚀 Starting Embedding Indexing Process...\n');
  console.log('Options:', options);
  console.log('');

  if (options.dryRun) {
    console.log('⚠️  DRY RUN MODE - No data will be written\n');
  }

  const startTime = Date.now();
  const results = {
    kols: { processed: 0, failed: 0 },
    campaigns: { processed: 0, failed: 0 },
    clients: { processed: 0, failed: 0 },
  };

  try {
    // ========================================================================
    // Index KOLs
    // ========================================================================
    if (indexAll || options.kolsOnly) {
      console.log('📊 Indexing KOLs...');
      console.log('━'.repeat(50));

      try {
        // Fetch all KOLs using script client
        const { data: kols, error } = await supabaseScript
          .from('master_kols')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        const kolsArray = (kols || []) as MasterKOL[];
        console.log(`Found ${kolsArray.length} KOLs to index\n`);

        if (kolsArray.length === 0) {
          console.log('⚠️  No KOLs found in database\n');
        } else if (options.dryRun) {
          console.log('Would index the following KOLs:');
          kolsArray.slice(0, 5).forEach(kol => {
            console.log(`  - ${kol.name} (${kol.region || 'No region'})`);
          });
          if (kolsArray.length > 5) {
            console.log(`  ... and ${kolsArray.length - 5} more`);
          }
          console.log('');
          results.kols.processed = kolsArray.length;
        } else {
          // Batch index KOLs
          const progress = await VectorStore.batchIndexKOLs(kolsArray);

          results.kols.processed = progress.processed;
          results.kols.failed = progress.failed;

          console.log(`\n✅ KOL Indexing Complete`);
          console.log(`   Processed: ${progress.processed}/${progress.total}`);
          console.log(`   Failed: ${progress.failed}`);

          if (progress.errors.length > 0) {
            console.log('\n   Errors:');
            progress.errors.slice(0, 5).forEach(err => {
              console.log(`   - ${err.id}: ${err.error}`);
            });
            if (progress.errors.length > 5) {
              console.log(`   ... and ${progress.errors.length - 5} more errors`);
            }
          }
          console.log('');
        }
      } catch (error: any) {
        console.error('❌ Error indexing KOLs:', error.message);
        console.log('');
      }
    }

    // ========================================================================
    // Index Campaigns
    // ========================================================================
    if (indexAll || options.campaignsOnly) {
      console.log('📊 Indexing Campaigns...');
      console.log('━'.repeat(50));

      try {
        // Fetch all campaigns (admin view - need user context)
        // For now, we'll skip this or you need to provide a user ID
        console.log('⚠️  Campaign indexing requires user context');
        console.log('   Run: npx tsx scripts/index-campaigns.ts <userId>\n');
      } catch (error: any) {
        console.error('❌ Error indexing campaigns:', error.message);
        console.log('');
      }
    }

    // ========================================================================
    // Index Clients
    // ========================================================================
    if (indexAll || options.clientsOnly) {
      console.log('📊 Indexing Clients...');
      console.log('━'.repeat(50));

      try {
        // Fetch all clients using script client
        const { data: clients, error } = await supabaseScript
          .from('clients')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        const clientsArray = clients || [];
        console.log(`Found ${clientsArray.length} clients to index\n`);

        if (clientsArray.length === 0) {
          console.log('⚠️  No clients found in database\n');
        } else if (options.dryRun) {
          console.log('Would index the following clients:');
          clientsArray.slice(0, 5).forEach(client => {
            console.log(`  - ${client.name} (${client.email || 'No email'})`);
          });
          if (clientsArray.length > 5) {
            console.log(`  ... and ${clientsArray.length - 5} more`);
          }
          console.log('');
          results.clients.processed = clientsArray.length;
        } else {
          // Index clients one by one (smaller dataset)
          let processed = 0;
          let failed = 0;

          for (const client of clientsArray) {
            try {
              await VectorStore.indexClient(client);
              processed++;
              process.stdout.write(`\r   Progress: ${processed}/${clientsArray.length}`);
            } catch (error: any) {
              failed++;
              console.error(`\n   Error indexing client ${client.id}:`, error.message);
            }
          }

          results.clients.processed = processed;
          results.clients.failed = failed;

          console.log(`\n\n✅ Client Indexing Complete`);
          console.log(`   Processed: ${processed}/${clientsArray.length}`);
          console.log(`   Failed: ${failed}`);
          console.log('');
        }
      } catch (error: any) {
        console.error('❌ Error indexing clients:', error.message);
        console.log('');
      }
    }

    // ========================================================================
    // Summary
    // ========================================================================
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('');
    console.log('═'.repeat(50));
    console.log('📋 INDEXING SUMMARY');
    console.log('═'.repeat(50));
    console.log('');
    console.log(`Total Time: ${duration}s`);
    console.log('');
    console.log('Results:');
    console.log(`  KOLs:      ${results.kols.processed} processed, ${results.kols.failed} failed`);
    console.log(`  Campaigns: ${results.campaigns.processed} processed, ${results.campaigns.failed} failed`);
    console.log(`  Clients:   ${results.clients.processed} processed, ${results.clients.failed} failed`);
    console.log('');

    // Get current stats
    if (!options.dryRun) {
      console.log('Current Index Stats:');
      const stats = await VectorStore.getStats();
      console.log(`  KOL Embeddings:      ${stats.kolCount}`);
      console.log(`  Campaign Embeddings: ${stats.campaignCount}`);
      console.log(`  Client Embeddings:   ${stats.clientCount}`);
      console.log('');
    }

    const totalProcessed = results.kols.processed + results.campaigns.processed + results.clients.processed;
    const totalFailed = results.kols.failed + results.campaigns.failed + results.clients.failed;

    if (totalFailed === 0 && totalProcessed > 0) {
      console.log('✅ All indexing completed successfully!');
    } else if (totalFailed > 0) {
      console.log(`⚠️  Indexing completed with ${totalFailed} failures`);
    } else {
      console.log('ℹ️  No data was indexed');
    }

    console.log('');
    console.log('Next steps:');
    console.log('  1. Test search quality: npx tsx scripts/test-vector-search.ts');
    console.log('  2. Check Supabase dashboard for embedding data');
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error('💥 Fatal Error:', error.message);
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// ============================================================================
// Error Handling
// ============================================================================

process.on('unhandledRejection', (reason, promise) => {
  console.error('');
  console.error('💥 Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('');
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

// ============================================================================
// Run
// ============================================================================

console.log('');
console.log('╔═══════════════════════════════════════════════════╗');
console.log('║  KOL Campaign Manager - Embedding Indexer        ║');
console.log('║  Generate vector embeddings for semantic search  ║');
console.log('╚═══════════════════════════════════════════════════╝');
console.log('');

main()
  .then(() => {
    console.log('🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('💥 Script failed:', error.message);
    process.exit(1);
  });
