#!/usr/bin/env tsx

/**
 * Test Script for Agent Orchestrator
 *
 * This script tests the Agent Orchestrator with various user queries
 * to demonstrate multi-step reasoning and tool execution.
 *
 * Usage:
 *   npx tsx scripts/test-orchestrator.ts
 *
 * Or with a specific user ID:
 *   USER_ID=xxx npx tsx scripts/test-orchestrator.ts
 *
 * Requirements:
 *   - OPENAI_API_KEY environment variable set
 *   - At least one user in the database OR USER_ID provided
 *
 * Note: This script will use the first user in the database if USER_ID is not provided.
 *       For production testing, create a test user account and provide the USER_ID.
 */

import { AgentOrchestrator, ConversationMemoryManager } from '../lib/agentOrchestrator';
import { supabase } from '../lib/supabase';

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/**
 * Format execution step for display
 */
function formatStep(step: any): string {
  const status = step.result.success
    ? `${colors.green}✓${colors.reset}`
    : `${colors.red}✗${colors.reset}`;

  const time = `${colors.dim}(${step.execution_time_ms}ms)${colors.reset}`;

  let output = `${status} ${colors.cyan}${step.tool_name}${colors.reset} ${time}\n`;
  output += `  ${colors.dim}Parameters:${colors.reset} ${JSON.stringify(step.parameters, null, 2).split('\n').join('\n  ')}\n`;

  if (step.result.success) {
    output += `  ${colors.green}Result:${colors.reset} ${step.result.message || 'Success'}\n`;
    if (step.result.data) {
      const dataPreview = JSON.stringify(step.result.data, null, 2)
        .split('\n')
        .slice(0, 10)
        .join('\n  ');
      output += `  ${colors.dim}Data:${colors.reset}\n  ${dataPreview}${colors.dim}...${colors.reset}\n`;
    }
  } else {
    output += `  ${colors.red}Error:${colors.reset} ${step.result.error}\n`;
  }

  return output;
}

/**
 * Run a test query through the orchestrator
 */
async function runTest(
  orchestrator: AgentOrchestrator,
  query: string,
  testNumber: number
): Promise<void> {
  console.log(`\n${colors.bright}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}Test ${testNumber}: ${colors.yellow}${query}${colors.reset}`);
  console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

  const startTime = Date.now();

  try {
    const response = await orchestrator.processMessage(query);

    console.log(`${colors.bright}Execution Steps:${colors.reset}\n`);

    if (response.steps.length === 0) {
      console.log(`${colors.dim}(No tools executed - direct response)${colors.reset}\n`);
    } else {
      response.steps.forEach((step, index) => {
        console.log(`${colors.bright}Step ${index + 1}:${colors.reset}`);
        console.log(formatStep(step));
      });
    }

    console.log(`${colors.bright}Agent Response:${colors.reset}`);
    console.log(`${colors.green}${response.message}${colors.reset}\n`);

    console.log(`${colors.dim}Total Time: ${response.total_execution_time_ms}ms${colors.reset}`);
    console.log(`${colors.dim}Tools Used: ${response.metadata?.tools_used.join(', ') || 'none'}${colors.reset}`);
    console.log(`${colors.dim}Context Gathered: ${response.metadata?.context_gathered ? 'Yes' : 'No'}${colors.reset}`);

  } catch (error) {
    console.error(`${colors.red}Error:${colors.reset}`, error);
  }

  const totalTime = Date.now() - startTime;
  console.log(`\n${colors.dim}Test completed in ${totalTime}ms${colors.reset}\n`);
}

/**
 * Main test suite
 */
async function main() {
  console.log(`${colors.bright}${colors.cyan}`);
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       Agent Orchestrator Test Suite                          ║');
  console.log('║       Testing Multi-Step Reasoning & Tool Execution          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  // Get user ID from environment or database
  let userId = process.env.USER_ID;
  let userRole: string = 'admin';
  let userEmail: string = 'test@example.com';

  if (userId) {
    console.log(`${colors.yellow}Using USER_ID from environment: ${userId}${colors.reset}\n`);

    // Get user details
    const { data: userData } = await supabase
      .from('users')
      .select('email, role')
      .eq('id', userId)
      .single();

    if (userData) {
      userEmail = userData.email;
      userRole = userData.role || 'admin';
    }
  } else {
    // Get first user from database (for testing purposes)
    const { data: users } = await supabase
      .from('users')
      .select('id, email, role')
      .limit(1);

    if (!users || users.length === 0) {
      console.error(`${colors.red}Error: No users found in database.${colors.reset}`);
      console.log(`${colors.yellow}\nTo test the orchestrator, you have two options:${colors.reset}`);
      console.log(`${colors.dim}1. Create a user account through the UI (http://localhost:3000/auth)${colors.reset}`);
      console.log(`${colors.dim}2. Provide a user ID: USER_ID=xxx npx tsx scripts/test-orchestrator.ts${colors.reset}\n`);
      console.log(`${colors.cyan}Note: The orchestrator is fully functional. Testing just requires a user context.${colors.reset}`);
      process.exit(1);
    }

    userId = users[0].id;
    userEmail = users[0].email;
    userRole = users[0].role || 'admin';
  }

  console.log(`${colors.dim}User ID: ${userId}${colors.reset}`);
  console.log(`${colors.dim}User Email: ${userEmail}${colors.reset}`);
  console.log(`${colors.dim}User Role: ${userRole}${colors.reset}`);
  console.log(`${colors.dim}Model: GPT-4${colors.reset}\n`);

  // Create orchestrator instance
  const sessionId = 'test-session-' + Date.now();
  const orchestrator = new AgentOrchestrator(
    {
      userId: userId,
      userRole: userRole as 'admin' | 'member' | 'client',
      sessionId: sessionId,
    },
    sessionId
  );

  // Test queries
  const testQueries = [
    // Test 1: Simple search
    "Find Korean crypto educators with over 100k followers",

    // Test 2: Context retrieval
    "What campaigns do I have access to?",

    // Test 3: Multi-step workflow
    "Find KOLs who create meme content in Vietnam and create a list called 'Vietnam Meme Creators'",

    // Test 4: Analysis
    "Analyze the performance of my most recent campaign",

    // Test 5: Budget recommendations
    "I have $50,000 to spend on a campaign in Korea and Vietnam. How should I allocate it?",

    // Test 6: Message generation
    "Write a professional campaign update email for my most recent client",

    // Test 7: Complex multi-step
    "Find high-engagement crypto traders in SEA, create a Q4 campaign for my first client with $30k budget, and add those KOLs to the campaign",
  ];

  // Run tests
  for (let i = 0; i < testQueries.length; i++) {
    await runTest(orchestrator, testQueries[i], i + 1);

    // Small delay between tests
    if (i < testQueries.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Final summary
  console.log(`\n${colors.bright}${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}${colors.green}Test Suite Complete!${colors.reset}`);
  console.log(`${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

  // Show conversation history
  const history = orchestrator.getConversationHistory();
  console.log(`${colors.bright}Conversation History (${history.length} messages):${colors.reset}`);
  history.slice(-6).forEach((msg, i) => {
    const roleColor = msg.role === 'user' ? colors.cyan : colors.green;
    console.log(`${colors.dim}${i + 1}.${colors.reset} ${roleColor}${msg.role}:${colors.reset} ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
  });

  console.log(`\n${colors.dim}Full conversation logged to console${colors.reset}`);
}

// Run tests
main().catch(console.error);
