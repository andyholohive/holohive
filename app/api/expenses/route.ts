import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { ExpenseService, ExpenseFrequency, ExpenseType } from '@/lib/expenseService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/expenses
 *   Query params (all optional):
 *     user_id, expense_type, frequency, paid (true|false),
 *     from_date, to_date, include_deleted, include_templates, limit
 *
 * POST /api/expenses
 *   Body: CreateExpenseInput (see lib/expenseService.ts).
 *   For one_time: expense_date required.
 *   For recurring: recurrence_start_date required; first instance is
 *   auto-generated at the same date so the user sees a row immediately.
 */

export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const sp = new URL(request.url).searchParams;
  try {
    const rows = await ExpenseService.list({
      user_id: sp.get('user_id') || undefined,
      expense_type: (sp.get('expense_type') as ExpenseType) || undefined,
      frequency: (sp.get('frequency') as ExpenseFrequency) || undefined,
      paid: sp.get('paid') === 'true' ? true : sp.get('paid') === 'false' ? false : undefined,
      from_date: sp.get('from_date') || undefined,
      to_date: sp.get('to_date') || undefined,
      include_deleted: sp.get('include_deleted') === 'true',
      include_templates: sp.get('include_templates') === 'true',
      limit: sp.get('limit') ? parseInt(sp.get('limit')!, 10) : undefined,
    });
    return NextResponse.json({ expenses: rows });
  } catch (err: any) {
    console.error('[GET /api/expenses]', err);
    return NextResponse.json({ error: err?.message || 'List failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  if (!guard.user && !guard.isCron) {
    return NextResponse.json({ error: 'Created_by user unknown' }, { status: 400 });
  }

  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Validate required fields
  const required = ['user_id', 'amount_usd', 'frequency', 'expense_type', 'description'];
  for (const f of required) {
    if (body[f] === undefined || body[f] === null || body[f] === '') {
      return NextResponse.json({ error: `Missing field: ${f}` }, { status: 400 });
    }
  }
  if (typeof body.amount_usd !== 'number' || body.amount_usd < 0) {
    return NextResponse.json({ error: 'amount_usd must be a non-negative number' }, { status: 400 });
  }
  const validFreq: ExpenseFrequency[] = ['one_time', 'daily', 'weekly', 'monthly'];
  if (!validFreq.includes(body.frequency)) {
    return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
  }
  const validType: ExpenseType[] = ['travel', 'software', 'meals_drinks', 'others'];
  if (!validType.includes(body.expense_type)) {
    return NextResponse.json({ error: 'Invalid expense_type' }, { status: 400 });
  }

  if (body.frequency === 'one_time' && !body.expense_date) {
    return NextResponse.json({ error: 'expense_date required for one_time' }, { status: 400 });
  }
  if (body.frequency !== 'one_time' && !body.recurrence_start_date) {
    return NextResponse.json({ error: 'recurrence_start_date required for recurring' }, { status: 400 });
  }

  try {
    const created = await ExpenseService.create({
      user_id: body.user_id,
      amount_usd: body.amount_usd,
      frequency: body.frequency,
      expense_type: body.expense_type,
      description: body.description,
      notes: body.notes ?? null,
      recurrence_start_date: body.recurrence_start_date ?? null,
      recurrence_end_date: body.recurrence_end_date ?? null,
      expense_date: body.expense_date ?? null,
      created_by: guard.user?.id || body.user_id,
    });
    return NextResponse.json({ expense: created }, { status: 201 });
  } catch (err: any) {
    console.error('[POST /api/expenses]', err);
    return NextResponse.json({ error: err?.message || 'Create failed' }, { status: 500 });
  }
}
