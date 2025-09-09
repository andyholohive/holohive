import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client on server side
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { messages, context, systemPrompt } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    // Build the system prompt
    const defaultSystemPrompt = `You are an AI assistant specialized in KOL (Key Opinion Leader) campaign management. You help users with:

- Campaign creation and strategy
- KOL selection and analysis
- Budget planning and allocation
- Content strategy and messaging
- Performance analysis and insights
- Message templates and generation

Provide helpful, actionable advice based on the user's needs. Be specific and practical in your recommendations.`;

    const finalSystemPrompt = systemPrompt || defaultSystemPrompt;

    // Prepare messages for OpenAI
    const openAIMessages = [
      {
        role: 'system' as const,
        content: finalSystemPrompt
      },
      ...messages.map((msg: any) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }))
    ];

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: openAIMessages,
      max_tokens: 1000,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || 'I apologize, but I couldn\'t generate a response.';
    const usage = response.usage;

    // Calculate cost (GPT-3.5-turbo pricing)
    const inputCost = (usage?.prompt_tokens || 0) * 0.0015 / 1000;
    const outputCost = (usage?.completion_tokens || 0) * 0.002 / 1000;
    const totalCost = inputCost + outputCost;

    return NextResponse.json({
      content,
      tokens: {
        input: usage?.prompt_tokens || 0,
        output: usage?.completion_tokens || 0,
        total: usage?.total_tokens || 0,
      },
      cost: totalCost
    });

  } catch (error) {
    console.error('OpenAI API Error:', error);
    
    // Return fallback response
    return NextResponse.json({
      content: 'I apologize, but I\'m having trouble connecting to my AI services right now. Please try again in a moment.',
      tokens: { input: 0, output: 0, total: 0 },
      cost: 0
    });
  }
}
