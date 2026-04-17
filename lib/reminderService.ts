/**
 * Reminder Service Engine
 * Loads active rules, evaluates them, formats messages, sends via Telegram, logs results.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { TelegramService } from '@/lib/telegramService';
import { evaluators, RULE_EMOJI } from '@/lib/reminderEvaluators';
import type { ReminderItem } from '@/lib/reminderEvaluators';

const MAX_ITEMS_PER_MESSAGE = 20;
const TG_MESSAGE_LIMIT = 4000; // Leave buffer below 4096

interface ReminderRule {
  id: string;
  name: string;
  rule_type: string;
  telegram_chat_id: string;
  telegram_thread_id: number | null;
  schedule_type: string;
  params: Record<string, any>;
}

interface RunResult {
  rule_id: string;
  rule_type: string;
  name: string;
  items_found: number;
  message_sent: boolean;
  error?: string;
  duration_ms: number;
}

function shouldRunToday(rule: ReminderRule): boolean {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat

  switch (rule.schedule_type) {
    case 'daily':
      return true;
    case 'weekly':
      return dayOfWeek === (rule.params.day_of_week ?? 1); // default Monday
    case 'saturday_only':
      return dayOfWeek === 6;
    case 'on_event':
      return false; // never run by cron
    default:
      return false;
  }
}

// Default templates per rule type — used when no custom template is set
export const DEFAULT_TEMPLATES: Record<string, { header: string; item: string; footer: string }> = {
  kol_stats_stale: {
    header: '<b>{{emoji}} {{name}}</b>\n<i>{{count}} KOL(s) need stats updated</i>\n',
    item: '\u2022 {{label}} — {{detail}}',
    footer: '',
  },
  client_checkin: {
    header: '<b>{{emoji}} {{name}}</b>\n<i>{{count}} upcoming check-in(s)</i>\n',
    item: '\u2022 {{label}} — {{detail}}',
    footer: '',
  },
  cdl_needs_update: {
    header: '<b>{{emoji}} {{name}}</b>\n<i>{{count}} client(s) need delivery log updates</i>\n',
    item: '\u2022 {{label}} — {{detail}}',
    footer: '',
  },
  weekly_cdl_review: {
    header: '<b>{{emoji}} Weekly CDL Review</b>\n',
    item: '\u2022 {{label}}',
    footer: '',
  },
  content_metrics_stale: {
    header: '<b>{{emoji}} {{name}}</b>\n<i>{{count}} content piece(s) missing metrics</i>\n',
    item: '\u2022 {{label}} — {{detail}}',
    footer: '',
  },
  form_submission: {
    header: '<b>{{emoji}} {{name}}</b>\n',
    item: '\u2022 {{label}}',
    footer: '',
  },
  crm_followup: {
    header: '<b>{{emoji}} {{name}}</b>\n<i>{{count}} opportunity/ies need follow-up</i>\n',
    item: '\u2022 {{label}} — {{detail}}',
    footer: '',
  },
  payment_reminder: {
    header: '<b>{{emoji}} {{name}}</b>\n<i>{{count}} unpaid payment(s) for published content</i>\n',
    item: '\u2022 {{label}} — {{detail}}',
    footer: '',
  },
  new_kol_no_gc: {
    header: '<b>{{emoji}} {{name}}</b>\n<i>{{count}} new KOL(s) without group chat</i>\n',
    item: '\u2022 {{label}} — {{detail}}',
    footer: '',
  },
  new_crm_no_gc: {
    header: '<b>{{emoji}} {{name}}</b>\n<i>{{count}} new CRM opp(s) without group chat</i>\n',
    item: '\u2022 {{label}} — {{detail}}',
    footer: '',
  },
};

const FALLBACK_TEMPLATE = {
  header: '<b>{{emoji}} {{name}}</b>\n<i>{{count}} item(s) need attention</i>\n',
  item: '\u2022 {{label}} — {{detail}}',
  footer: '',
};

function applyVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

function formatMessage(
  ruleName: string,
  ruleType: string,
  items: ReminderItem[],
  customTemplate?: { header?: string; item?: string; footer?: string }
): string[] {
  const emoji = RULE_EMOJI[ruleType] || '\u{1F514}';
  const template = {
    ...DEFAULT_TEMPLATES[ruleType] || FALLBACK_TEMPLATE,
    ...customTemplate,
  };

  const truncated = items.length > MAX_ITEMS_PER_MESSAGE;
  const displayItems = items.slice(0, MAX_ITEMS_PER_MESSAGE);

  const headerVars = { emoji, name: ruleName, count: String(items.length) };

  let body = applyVars(template.header, headerVars) + '\n';

  for (const item of displayItems) {
    const itemVars = { label: item.label, detail: item.detail || '' };
    let line = applyVars(template.item, itemVars);
    // Clean up trailing " — " if detail was empty
    line = line.replace(/ — $/, '');
    body += line + '\n';
  }

  if (truncated) {
    body += `\n<i>...and ${items.length - MAX_ITEMS_PER_MESSAGE} more</i>`;
  }

  if (template.footer) {
    body += '\n' + applyVars(template.footer, headerVars);
  }

  // Split into chunks if too long
  if (body.length <= TG_MESSAGE_LIMIT) {
    return [body];
  }

  const messages: string[] = [];
  let current = applyVars(template.header, headerVars) + '\n';
  let partNum = 1;

  for (const item of displayItems) {
    const itemVars = { label: item.label, detail: item.detail || '' };
    let line = applyVars(template.item, itemVars).replace(/ — $/, '') + '\n';
    if (current.length + line.length > TG_MESSAGE_LIMIT) {
      messages.push(current);
      partNum++;
      current = `<b>${emoji} ${ruleName} (part ${partNum})</b>\n\n`;
    }
    current += line;
  }

  if (truncated) {
    current += `\n<i>...and ${items.length - MAX_ITEMS_PER_MESSAGE} more</i>`;
  }

  if (template.footer) {
    current += '\n' + applyVars(template.footer, headerVars);
  }

  if (current.trim()) {
    messages.push(current);
  }

  return messages;
}

export async function runReminders(
  supabase: SupabaseClient<Database>,
  testRuleType?: string
): Promise<{ results: RunResult[]; errors: string[] }> {
  const results: RunResult[] = [];
  const errors: string[] = [];

  // Load active rules
  let query = supabase
    .from('reminder_rules' as any)
    .select('*')
    .eq('is_active', true);

  if (testRuleType) {
    query = query.eq('rule_type', testRuleType);
  }

  const { data: rules, error: rulesError } = await query;

  if (rulesError) {
    errors.push(`Failed to load rules: ${rulesError.message}`);
    return { results, errors };
  }

  if (!rules || rules.length === 0) {
    return { results, errors };
  }

  for (const rule of rules as unknown as ReminderRule[]) {
    // Skip rules that shouldn't run today (unless testing)
    if (!testRuleType && !shouldRunToday(rule)) continue;

    const start = Date.now();
    const evaluator = evaluators[rule.rule_type];

    if (!evaluator) {
      errors.push(`No evaluator for rule_type: ${rule.rule_type}`);
      continue;
    }

    try {
      const result = await evaluator(supabase, rule.params || {});
      const duration = Date.now() - start;

      if (result.isEmpty) {
        results.push({
          rule_id: rule.id,
          rule_type: rule.rule_type,
          name: rule.name,
          items_found: 0,
          message_sent: false,
          duration_ms: duration,
        });

        // Log even empty runs
        await supabase.from('reminder_logs' as any).insert({
          rule_id: rule.id,
          items_found: 0,
          message_sent: false,
          duration_ms: duration,
        });

        continue;
      }

      // Format and send message (use custom template from params if set)
      const customTemplate = rule.params.message_template || undefined;
      const messages = formatMessage(rule.name, rule.rule_type, result.items, customTemplate);
      let sent = true;

      for (const msg of messages) {
        const success = await TelegramService.sendToChat(
          rule.telegram_chat_id,
          msg,
          'HTML',
          rule.telegram_thread_id || undefined
        );
        if (!success) sent = false;
      }

      results.push({
        rule_id: rule.id,
        rule_type: rule.rule_type,
        name: rule.name,
        items_found: result.items.length,
        message_sent: sent,
        duration_ms: Date.now() - start,
      });

      // Log run
      await supabase.from('reminder_logs' as any).insert({
        rule_id: rule.id,
        items_found: result.items.length,
        message_sent: sent,
        message_text: messages[0]?.substring(0, 1000),
        duration_ms: Date.now() - start,
      });

      // Update rule's last_run
      await supabase
        .from('reminder_rules' as any)
        .update({
          last_run_at: new Date().toISOString(),
          last_run_result: { items_found: result.items.length, message_sent: sent },
          updated_at: new Date().toISOString(),
        })
        .eq('id', rule.id);
    } catch (err: any) {
      const duration = Date.now() - start;
      const errorMsg = err.message || String(err);
      errors.push(`Rule "${rule.name}" (${rule.rule_type}): ${errorMsg}`);

      results.push({
        rule_id: rule.id,
        rule_type: rule.rule_type,
        name: rule.name,
        items_found: 0,
        message_sent: false,
        error: errorMsg,
        duration_ms: duration,
      });

      // Log error
      await supabase.from('reminder_logs' as any).insert({
        rule_id: rule.id,
        items_found: 0,
        message_sent: false,
        error: errorMsg,
        duration_ms: duration,
      });
    }
  }

  return { results, errors };
}
