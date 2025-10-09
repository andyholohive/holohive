/**
 * Vector Search Testing Script
 *
 * Test the quality and relevance of semantic search results
 * Run this after indexing to verify that RAG is working correctly
 *
 * Usage:
 *   npx tsx scripts/test-vector-search.ts
 *
 * @author AI Assistant
 * @date 2025-10-02
 */

import { VectorStore } from '../lib/vectorStore';
import { KOLService } from '../lib/kolService';

/**
 * Test queries to evaluate search quality
 */
const TEST_QUERIES = [
  // Regional queries
  {
    category: 'Regional Search',
    query: 'Find crypto educators in Korea with over 100k followers',
    expected: 'Should return Korean KOLs with educational content and high follower count',
  },
  {
    category: 'Regional Search',
    query: 'KOLs in Southeast Asia who create meme content',
    expected: 'Should return SEA region KOLs with meme content type',
  },
  {
    category: 'Regional Search',
    query: 'APAC influencers for DeFi campaigns',
    expected: 'Should return APAC KOLs relevant to DeFi/finance',
  },

  // Content type queries
  {
    category: 'Content Type',
    query: 'Technical deep dive creators',
    expected: 'Should return KOLs who create technical/educational deep dive content',
  },
  {
    category: 'Content Type',
    query: 'News and trading signal providers',
    expected: 'Should return KOLs focused on news and trading content',
  },
  {
    category: 'Content Type',
    query: 'Meme lords with high engagement',
    expected: 'Should return meme creators with strong community',
  },

  // Platform queries
  {
    category: 'Platform',
    query: 'Telegram influencers with communities',
    expected: 'Should return Telegram KOLs with group chats/communities',
  },
  {
    category: 'Platform',
    query: 'Twitter crypto voices',
    expected: 'Should return Twitter/X platform KOLs in crypto space',
  },

  // Follower size queries
  {
    category: 'Audience Size',
    query: 'Micro influencers under 50k followers',
    expected: 'Should return smaller KOLs with < 50k followers',
  },
  {
    category: 'Audience Size',
    query: 'Major influencers with over 500k followers',
    expected: 'Should return large KOLs with 500k+ followers',
  },

  // Niche queries
  {
    category: 'Specialized',
    query: 'Bridge builders who connect crypto and mainstream',
    expected: 'Should return bridge builder creator types',
  },
  {
    category: 'Specialized',
    query: 'Skeptics and critics who provide balanced views',
    expected: 'Should return skeptic creator types',
  },
];

/**
 * Color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

/**
 * Format similarity score with color
 */
function formatScore(score: number): string {
  const percentage = (score * 100).toFixed(1);
  let color = colors.red;

  if (score >= 0.8) color = colors.green;
  else if (score >= 0.7) color = colors.yellow;

  return `${color}${percentage}%${colors.reset}`;
}

/**
 * Display search results
 */
async function displayResults(query: string, results: any[]) {
  if (results.length === 0) {
    console.log(`   ${colors.red}No results found${colors.reset}`);
    return;
  }

  for (const [idx, result] of Array.from(results.entries())) {
    const metadata = result.metadata;

    console.log(`   ${idx + 1}. ${colors.bright}${metadata.name || 'Unknown'}${colors.reset}`);
    console.log(`      Score: ${formatScore(result.similarity)}`);

    if (metadata.region) {
      console.log(`      Region: ${metadata.region}`);
    }

    if (metadata.platform?.length) {
      console.log(`      Platform: ${metadata.platform.join(', ')}`);
    }

    if (metadata.followers) {
      const followers = metadata.followers.toLocaleString();
      console.log(`      Followers: ${followers}`);
    }

    if (metadata.creator_type?.length) {
      console.log(`      Creator Type: ${metadata.creator_type.join(', ')}`);
    }

    if (metadata.content_type?.length) {
      console.log(`      Content: ${metadata.content_type.join(', ')}`);
    }

    console.log('');
  }
}

/**
 * Run a single test query
 */
async function runTest(test: typeof TEST_QUERIES[0], testNum: number) {
  console.log('');
  console.log(`${colors.cyan}Test ${testNum}: ${test.category}${colors.reset}`);
  console.log('━'.repeat(60));
  console.log(`Query: "${test.query}"`);
  console.log(`Expected: ${colors.dim}${test.expected}${colors.reset}`);
  console.log('');

  try {
    const startTime = Date.now();

    const results = await VectorStore.searchKOLs(test.query, {
      threshold: 0.5, // Lower threshold for testing
      limit: 5,
    });

    const duration = Date.now() - startTime;

    console.log(`Results (${results.length} found in ${duration}ms):`);
    console.log('');

    await displayResults(test.query, results);

    // Evaluate quality
    const avgScore = results.length > 0
      ? results.reduce((sum, r) => sum + r.similarity, 0) / results.length
      : 0;

    let quality = '❌ Poor';
    if (avgScore >= 0.8) quality = '✅ Excellent';
    else if (avgScore >= 0.7) quality = '⚠️  Good';
    else if (avgScore >= 0.6) quality = '⚠️  Fair';

    console.log(`Quality Assessment: ${quality} (avg score: ${formatScore(avgScore)})`);

    return {
      query: test.query,
      resultCount: results.length,
      avgScore,
      duration,
      quality,
    };
  } catch (error: any) {
    console.log(`${colors.red}Error: ${error.message}${colors.reset}`);
    return {
      query: test.query,
      resultCount: 0,
      avgScore: 0,
      duration: 0,
      quality: '❌ Error',
      error: error.message,
    };
  }
}

/**
 * Main testing function
 */
async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Vector Search Quality Test                           ║');
  console.log('║  Testing semantic search with various queries         ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');

  // Check if data is indexed
  console.log('Checking index status...');
  const stats = await VectorStore.getStats();

  console.log(`Indexed data:`);
  console.log(`  KOLs:      ${stats.kolCount}`);
  console.log(`  Campaigns: ${stats.campaignCount}`);
  console.log(`  Clients:   ${stats.clientCount}`);
  console.log('');

  if (stats.kolCount === 0) {
    console.log(`${colors.red}⚠️  No KOLs indexed!${colors.reset}`);
    console.log('Please run: npx tsx scripts/index-embeddings.ts');
    console.log('');
    process.exit(1);
  }

  console.log(`Running ${TEST_QUERIES.length} test queries...\n`);

  const results = [];

  // Run all tests
  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const result = await runTest(TEST_QUERIES[i], i + 1);
    results.push(result);

    // Add delay to avoid rate limits
    if (i < TEST_QUERIES.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Summary
  console.log('');
  console.log('═'.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log('');

  const totalTests = results.length;
  const successfulTests = results.filter(r => !r.error).length;
  const avgScoreOverall = results.filter(r => !r.error).reduce((sum, r) => sum + r.avgScore, 0) / successfulTests;
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / totalTests;

  console.log(`Total Tests: ${totalTests}`);
  console.log(`Successful: ${successfulTests}/${totalTests}`);
  console.log(`Average Similarity Score: ${formatScore(avgScoreOverall)}`);
  console.log(`Average Query Time: ${avgDuration.toFixed(0)}ms`);
  console.log('');

  // Quality breakdown
  const excellent = results.filter(r => r.avgScore >= 0.8).length;
  const good = results.filter(r => r.avgScore >= 0.7 && r.avgScore < 0.8).length;
  const fair = results.filter(r => r.avgScore >= 0.6 && r.avgScore < 0.7).length;
  const poor = results.filter(r => r.avgScore < 0.6 && !r.error).length;
  const errors = results.filter(r => r.error).length;

  console.log('Quality Distribution:');
  console.log(`  ${colors.green}Excellent (≥80%):${colors.reset} ${excellent}`);
  console.log(`  ${colors.yellow}Good (70-79%):${colors.reset} ${good}`);
  console.log(`  ${colors.yellow}Fair (60-69%):${colors.reset} ${fair}`);
  console.log(`  ${colors.red}Poor (<60%):${colors.reset} ${poor}`);
  if (errors > 0) {
    console.log(`  ${colors.red}Errors:${colors.reset} ${errors}`);
  }
  console.log('');

  // Overall assessment
  const successRate = (excellent + good) / totalTests;

  if (successRate >= 0.8) {
    console.log(`${colors.green}✅ PASS - Search quality is excellent!${colors.reset}`);
  } else if (successRate >= 0.6) {
    console.log(`${colors.yellow}⚠️  PASS - Search quality is acceptable but could be improved${colors.reset}`);
  } else {
    console.log(`${colors.red}❌ FAIL - Search quality needs improvement${colors.reset}`);
  }

  console.log('');

  // Recommendations
  if (successRate < 0.8) {
    console.log('💡 Recommendations:');
    console.log('  - Ensure KOL descriptions are comprehensive');
    console.log('  - Add more metadata to KOL profiles');
    console.log('  - Consider reindexing after adding more data');
    console.log('  - Adjust similarity threshold in searches');
    console.log('');
  }

  console.log('Next steps:');
  console.log('  - Review results and adjust KOL data if needed');
  console.log('  - Move to Phase 2: Build Agent Tools');
  console.log('');
}

// Run the tests
main()
  .then(() => {
    console.log('🎉 Testing complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error(`${colors.red}💥 Test failed:${colors.reset}`, error.message);
    console.error(error.stack);
    process.exit(1);
  });
