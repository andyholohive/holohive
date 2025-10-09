import { NextRequest, NextResponse } from 'next/server';
import { ChatService } from '@/lib/chatService';
import { createServerClient } from '@/lib/supabase-server';

/**
 * Agent Chat API Route
 *
 * This endpoint processes user messages through the Agent Orchestrator
 * and returns intelligent, action-capable responses.
 *
 * POST /api/chat/agent
 *
 * Body:
 * {
 *   sessionId: string;
 *   message: string;
 * }
 *
 * Response:
 * {
 *   response: string;
 *   agent_actions?: Array<{tool_name, parameters, result, execution_time_ms}>;
 *   agent_status: 'completed' | 'error';
 *   execution_time_ms: number;
 *   tools_used: string[];
 * }
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, message } = body;

    if (!sessionId || !message) {
      return NextResponse.json(
        { error: 'sessionId and message are required' },
        { status: 400 }
      );
    }

    // Get authenticated user using server client
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[Agent Chat API] Auth error:', authError?.message || 'No user session');
      return NextResponse.json(
        { error: 'Unauthorized', details: authError?.message || 'No user session found' },
        { status: 401 }
      );
    }

    // Get user role
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const userRole = userData?.role || 'member';

    // Process message through Agent Orchestrator
    const agentMessage = await ChatService.getAgentResponse(
      sessionId,
      message,
      {
        userId: user.id,
        userRole: userRole as 'admin' | 'member' | 'client',
        supabaseClient: supabase, // Pass authenticated server client
        onStatus: (status) => {
          console.log(`[Agent Chat] Status: ${status}`);
        },
        onToolExecution: (toolName, step) => {
          console.log(`[Agent Chat] Executing tool ${toolName} (step ${step})`);
        },
      }
    );

    // Return response
    return NextResponse.json({
      response: agentMessage.content,
      agent_actions: agentMessage.agent_actions,
      agent_status: agentMessage.agent_status,
      execution_time_ms: agentMessage.execution_time_ms,
      tools_used: (agentMessage.metadata && typeof agentMessage.metadata === 'object' && 'tools_used' in agentMessage.metadata) ? agentMessage.metadata.tools_used : [],
      message_id: agentMessage.id,
    });

  } catch (error) {
    console.error('[Agent Chat API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process message',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Get reversible actions for a session
 *
 * GET /api/chat/agent?sessionId=xxx&action=get_reversible
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const action = searchParams.get('action');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    if (action === 'get_reversible') {
      const actions = await ChatService.getReversibleActions(sessionId, supabase);

      return NextResponse.json({
        actions: actions.map(a => ({
          id: a.id,
          tool_name: a.tool_name,
          action_type: a.action_type,
          entity_type: a.entity_type,
          entity_id: a.entity_id,
          created_at: a.created_at,
        })),
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('[Agent Chat API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}

/**
 * Undo an action
 *
 * DELETE /api/chat/agent?actionId=xxx
 */
export async function DELETE(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const actionId = searchParams.get('actionId');

    if (!actionId) {
      return NextResponse.json(
        { error: 'actionId is required' },
        { status: 400 }
      );
    }

    const success = await ChatService.undoAction(actionId, supabase);

    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Action undone successfully',
      });
    } else {
      return NextResponse.json(
        { error: 'Failed to undo action' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('[Agent Chat API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to undo action' },
      { status: 500 }
    );
  }
}
