'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Bell, Plus, Pencil, Trash2, Clock, MessageSquare, Play, Loader2, CheckCircle, XCircle, AlertTriangle, Send, Eye } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { DEFAULT_TEMPLATES } from '@/lib/reminderService';

// ─── Constants ───────────────────────────────────────────────────────

const RULE_TYPES: Record<string, { label: string; description: string }> = {
  kol_stats_stale: { label: 'KOL Stats Stale', description: 'Alert when KOL stats haven\'t been updated' },
  client_checkin: { label: 'Client Check-in', description: 'Remind team of upcoming client meetings' },
  cdl_needs_update: { label: 'CDL Needs Updating', description: 'Flag clients with no recent delivery log' },
  weekly_cdl_review: { label: 'Weekly CDL Review', description: 'Weekly reminder to review delivery logs' },
  content_metrics_stale: { label: 'Content Metrics Stale', description: 'Published content with no metrics' },
  form_submission: { label: 'Form Submission', description: 'Route form notifications to chatroom' },
  crm_followup: { label: 'CRM Follow-up', description: 'Remind to follow up on CRM opportunities' },
  payment_reminder: { label: 'Payment Reminder', description: 'Unpaid payments for published content' },
  new_kol_no_gc: { label: 'New KOL - No GC', description: 'New KOLs without group chat connected' },
  new_crm_no_gc: { label: 'New CRM Opp - No GC', description: 'New CRM opps without group chat' },
  google_meeting_reminder: { label: 'Google Meeting Reminders', description: 'DM each connected user before their Google Meet calls' },
};

const SCHEDULE_TYPES: Record<string, { label: string; description: string }> = {
  daily: { label: 'Daily', description: 'Runs every day at 9 AM UTC' },
  weekly: { label: 'Weekly', description: 'Runs once a week on the configured day' },
  saturday_only: { label: 'Saturday Only', description: 'Runs only on Saturdays' },
  on_event: { label: 'On Event', description: 'Triggered by events, not scheduled' },
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const RULE_EMOJI: Record<string, string> = {
  kol_stats_stale: '\u{1F4CA}',
  client_checkin: '\u{1F4C5}',
  cdl_needs_update: '\u{1F4DD}',
  weekly_cdl_review: '\u{1F4CB}',
  content_metrics_stale: '\u{1F4C8}',
  form_submission: '\u{1F4E9}',
  crm_followup: '\u{1F4DE}',
  payment_reminder: '\u{1F4B0}',
  new_kol_no_gc: '\u{1F517}',
  new_crm_no_gc: '\u{1F517}',
  google_meeting_reminder: '\u{1F4F9}',
};

// ─── Types ───────────────────────────────────────────────────────────

interface ReminderRule {
  id: string;
  name: string;
  rule_type: string;
  description: string | null;
  telegram_chat_id: string;
  telegram_thread_id: number | null;
  schedule_type: string;
  params: Record<string, any>;
  is_active: boolean;
  last_run_at: string | null;
  last_run_result: { items_found?: number; message_sent?: boolean } | null;
  created_at: string;
  updated_at: string;
  recent_logs: Array<{
    id: string;
    run_at: string;
    items_found: number;
    message_sent: boolean;
    error: string | null;
    duration_ms: number | null;
  }>;
}

interface RuleFormData {
  name: string;
  rule_type: string;
  description: string;
  telegram_chat_id: string;
  telegram_thread_id: string;
  schedule_type: string;
  params: Record<string, any>;
}

interface TelegramChat {
  id: string;
  chat_id: string;
  title: string | null;
  chat_type: string | null;
}

const DEFAULT_FORM: RuleFormData = {
  name: '',
  rule_type: 'kol_stats_stale',
  description: '',
  telegram_chat_id: '',
  telegram_thread_id: '',
  schedule_type: 'daily',
  params: {},
};

// ─── Page ────────────────────────────────────────────────────────────

export default function RemindersPage() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialog, setEditDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<ReminderRule | null>(null);
  const [formData, setFormData] = useState<RuleFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [tgChats, setTgChats] = useState<TelegramChat[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRule, setDeletingRule] = useState<ReminderRule | null>(null);

  const fetchTgChats = useCallback(async () => {
    const { data } = await supabase
      .from('telegram_chats')
      .select('id, chat_id, title, chat_type')
      .order('title', { ascending: true });
    if (data) setTgChats(data);
  }, []);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/reminders');
      const data = await res.json();
      if (data.rules) setRules(data.rules);
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to load reminders', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchRules(); fetchTgChats(); }, [fetchRules, fetchTgChats]);

  const openCreate = () => {
    setEditingRule(null);
    setFormData(DEFAULT_FORM);
    setShowPreview(false);
    setEditDialog(true);
  };

  const openEdit = (rule: ReminderRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      rule_type: rule.rule_type,
      description: rule.description || '',
      telegram_chat_id: rule.telegram_chat_id,
      telegram_thread_id: rule.telegram_thread_id?.toString() || '',
      schedule_type: rule.schedule_type,
      params: rule.params || {},
    });
    setEditDialog(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.telegram_chat_id) {
      toast({ title: 'Error', description: 'Name and Telegram Chat ID are required', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        telegram_thread_id: formData.telegram_thread_id ? parseInt(formData.telegram_thread_id) : null,
      };

      const isEdit = !!editingRule;
      const res = await fetch('/api/reminders', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { id: editingRule.id, ...payload } : payload),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      toast({ title: isEdit ? 'Reminder updated' : 'Reminder created' });
      setEditDialog(false);
      fetchRules();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule: ReminderRule) => {
    try {
      const res = await fetch('/api/reminders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: !r.is_active } : r)));
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingRule) return;
    try {
      const res = await fetch('/api/reminders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deletingRule.id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast({ title: 'Reminder deleted' });
      setRules((prev) => prev.filter((r) => r.id !== deletingRule.id));
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setDeletingRule(null);
    }
  };

  const handleTest = async (ruleType: string) => {
    setTesting(ruleType);
    setTestResult(null);
    try {
      const res = await fetch(`/api/cron/reminders?test_rule=${ruleType}`, {
        headers: { 'Authorization': `Bearer ${window.prompt('Enter CRON_SECRET to test:', '')}` },
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        toast({ title: 'Test complete', description: `Found ${data.total_items_found} items, sent ${data.messages_sent} messages` });
        fetchRules();
      } else {
        toast({ title: 'Test failed', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setTesting(null);
    }
  };

  const renderParamEditor = () => {
    const ruleType = formData.rule_type;
    const params = formData.params;
    const setParam = (key: string, value: any) => {
      setFormData((prev) => ({ ...prev, params: { ...prev.params, [key]: value } }));
    };

    switch (ruleType) {
      case 'kol_stats_stale':
        return (
          <div>
            <Label>Threshold (days)</Label>
            <Input
              type="number"
              className="focus-brand"
              value={params.threshold_days ?? 90}
              onChange={(e) => setParam('threshold_days', parseInt(e.target.value) || 90)}
            />
            <p className="text-xs text-gray-500 mt-1">Alert if KOL stats not updated within this many days</p>
          </div>
        );
      case 'client_checkin':
        return (
          <div>
            <Label>Advance notice (days)</Label>
            <Input
              type="number"
              className="focus-brand"
              value={params.advance_days ?? 1}
              onChange={(e) => setParam('advance_days', parseInt(e.target.value) || 1)}
            />
            <p className="text-xs text-gray-500 mt-1">Remind this many days before the meeting</p>
          </div>
        );
      case 'cdl_needs_update':
        return (
          <div>
            <Label>Threshold (days)</Label>
            <Input
              type="number"
              className="focus-brand"
              value={params.threshold_days ?? 14}
              onChange={(e) => setParam('threshold_days', parseInt(e.target.value) || 14)}
            />
            <p className="text-xs text-gray-500 mt-1">Flag clients with no CDL entry within this many days</p>
          </div>
        );
      case 'weekly_cdl_review':
        return (
          <div>
            <Label>Day of week</Label>
            <Select
              value={String(params.day_of_week ?? 1)}
              onValueChange={(v) => setParam('day_of_week', parseInt(v))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAY_NAMES.map((d, i) => (
                  <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      case 'content_metrics_stale':
        return (
          <div>
            <Label>Threshold (days)</Label>
            <Input
              type="number"
              className="focus-brand"
              value={params.threshold_days ?? 7}
              onChange={(e) => setParam('threshold_days', parseInt(e.target.value) || 7)}
            />
            <p className="text-xs text-gray-500 mt-1">Content published more than this many days ago with no metrics</p>
          </div>
        );
      case 'crm_followup':
        return (
          <div>
            <Label>Follow-up threshold (days)</Label>
            <Input
              type="number"
              className="focus-brand"
              value={params.threshold_days ?? 7}
              onChange={(e) => setParam('threshold_days', parseInt(e.target.value) || 7)}
            />
            <p className="text-xs text-gray-500 mt-1">Remind if no contact within this many days</p>
          </div>
        );
      case 'payment_reminder':
        return (
          <div>
            <Label>Exclude campaign patterns</Label>
            <Input
              className="focus-brand"
              value={(params.exclude_campaign_patterns || []).join(', ')}
              onChange={(e) => setParam('exclude_campaign_patterns', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
            />
            <p className="text-xs text-gray-500 mt-1">Comma-separated campaign name patterns to exclude (e.g. KOL Round)</p>
          </div>
        );
      case 'new_kol_no_gc':
      case 'new_crm_no_gc':
        return (
          <div>
            <Label>Lookback (days)</Label>
            <Input
              type="number"
              className="focus-brand"
              value={params.lookback_days ?? 7}
              onChange={(e) => setParam('lookback_days', parseInt(e.target.value) || 7)}
            />
            <p className="text-xs text-gray-500 mt-1">Check items created within this many days</p>
          </div>
        );
      case 'form_submission':
        return (
          <p className="text-sm text-gray-500">This rule is event-driven. It routes form submission notifications to the configured chatroom.</p>
        );
      case 'google_meeting_reminder': {
        // advance_minutes is an array of positive ints — render as a
        // comma-separated string for the input, parse back on change.
        // Strips zero/negative values; "0 (at start)" is controlled by
        // the send_at_start switch below to avoid two ways to express it.
        const adv: number[] = Array.isArray(params.advance_minutes)
          ? params.advance_minutes.filter((n: any) => typeof n === 'number' && n > 0)
          : (typeof params.advance_minutes === 'number' && params.advance_minutes > 0
              ? [params.advance_minutes]
              : []);
        const advText = adv.join(', ');

        const lookahead = params.lookahead_minutes ?? 60;
        const maxAdv = Math.max(...adv, 0);
        const lookaheadTooSmall = maxAdv > 0 && lookahead < maxAdv + 5;

        return (
          <div className="space-y-4">
            <div>
              <Label>Advance reminders (minutes before meeting)</Label>
              <Input
                className="focus-brand"
                defaultValue={advText}
                placeholder="e.g. 30, 10, 5"
                onBlur={(e) => {
                  // Parse on blur so the user can type freely without
                  // each keystroke re-rendering the list.
                  const parts = e.target.value
                    .split(',')
                    .map((s) => parseInt(s.trim(), 10))
                    .filter((n) => Number.isFinite(n) && n > 0);
                  // De-dup + sort descending (30 → 10 → 5 reads naturally).
                  const unique = Array.from(new Set(parts)).sort((a, b) => b - a);
                  setParam('advance_minutes', unique);
                }}
              />
              <p className="text-xs text-gray-500 mt-1">
                Comma-separated list. Each entry sends one DM that many minutes before each Meet. Example: <code className="bg-gray-100 px-1 rounded">30, 10, 5</code> sends three DMs (30, 10, 5 min before).
                {adv.length > 0 && (
                  <> Currently configured: <span className="font-medium text-gray-700">{adv.map((n) => `${n} min`).join(', ')}</span>.</>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={params.send_at_start !== false}
                onCheckedChange={(v) => setParam('send_at_start', v)}
              />
              <div>
                <Label className="text-sm">Also DM at meeting start</Label>
                <p className="text-xs text-gray-500">Send an additional DM the moment the meeting begins.</p>
              </div>
            </div>
            <div>
              <Label>Lookahead window (minutes)</Label>
              <Input
                type="number"
                className="focus-brand"
                value={lookahead}
                onChange={(e) => setParam('lookahead_minutes', parseInt(e.target.value) || 60)}
              />
              <p className="text-xs text-gray-500 mt-1">
                How far ahead the cron looks at each user&apos;s calendar. Should be at least <strong>(largest advance + 5)</strong>.
                {lookaheadTooSmall && (
                  <span className="text-amber-700 font-medium"> Currently too small for your largest advance ({maxAdv} min) — bump to at least {maxAdv + 10}.</span>
                )}
              </p>
            </div>
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="text-xs text-amber-800">
                <strong>Setup:</strong> This rule is event-driven and runs on a dedicated 5-minute cron, not the daily one. Each user must connect Google Calendar from their <a href="/settings" className="underline">Settings</a> page and have their Telegram DM linked on the <a href="/team" className="underline">Team</a> page.
              </p>
              <p className="text-xs text-amber-800 mt-1">
                The <strong>Telegram Chat</strong> and <strong>Message Template</strong> fields below are unused for this rule — reminders are DM&apos;d to each connected user&apos;s own Telegram with a fixed format (event title + countdown + Join Meet link).
              </p>
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  // Helper to resolve chat ID to title
  const getChatLabel = (chatId: string) => {
    if (chatId === 'PLACEHOLDER_CHAT_ID') return null;
    const chat = tgChats.find((c) => c.chat_id === chatId);
    return chat?.title || chatId;
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] w-full bg-gray-50">
        <div className="w-full">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Reminders</h2>
                <p className="text-gray-600">Automated Telegram reminders for your team</p>
              </div>
              <Button disabled className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Reminder
              </Button>
            </div>
            <div className="grid gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-7 w-7 rounded-lg" />
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Skeleton className="h-5 w-24 rounded-full" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Skeleton className="h-4 w-72 mb-2" />
                    <Skeleton className="h-3 w-56" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reminders</h2>
          <p className="text-gray-600">Automated Telegram reminders for your team</p>
        </div>
        <Button onClick={openCreate} className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Reminder
        </Button>
      </div>

      {/* Rules List */}
      <div className="grid gap-4">
        {rules.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No reminders configured. Create your first reminder to get started.</p>
            <Button
              onClick={openCreate}
              className="hover:opacity-90"
              style={{ backgroundColor: '#3e8692', color: 'white' }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Reminder
            </Button>
          </div>
        ) : (
          rules.map((rule) => (
            <Card key={rule.id} className={`hover:shadow-md transition-shadow ${!rule.is_active ? 'opacity-60' : ''}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-gray-100 p-1.5 rounded-lg flex-shrink-0">
                      <Bell className="h-4 w-4 text-gray-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 truncate">{rule.name}</h3>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={`pointer-events-none ${rule.is_active ? 'bg-brand-light text-brand' : 'bg-gray-100 text-gray-800'}`}>
                      {rule.is_active ? 'Active' : 'Disabled'}
                    </Badge>
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={() => handleToggle(rule)}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline" className="pointer-events-none text-xs">
                    {RULE_EMOJI[rule.rule_type] || '\u{1F514}'} {RULE_TYPES[rule.rule_type]?.label || rule.rule_type}
                  </Badge>
                  <Badge variant="outline" className="pointer-events-none text-xs">
                    {SCHEDULE_TYPES[rule.schedule_type]?.label || rule.schedule_type}
                  </Badge>
                  {rule.schedule_type === 'weekly' && rule.params.day_of_week !== undefined && (
                    <Badge variant="outline" className="pointer-events-none text-xs">
                      {DAY_NAMES[rule.params.day_of_week]}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-gray-600">{rule.description || RULE_TYPES[rule.rule_type]?.description || ''}</p>

                {/* Status row */}
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {rule.telegram_chat_id === 'PLACEHOLDER_CHAT_ID' ? (
                      <span className="text-amber-600 font-medium">Chat not set</span>
                    ) : (
                      <span>{getChatLabel(rule.telegram_chat_id)}</span>
                    )}
                    {rule.telegram_thread_id && <span>(thread: {rule.telegram_thread_id})</span>}
                  </span>
                  {rule.last_run_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Last run: {new Date(rule.last_run_at).toLocaleString()}
                      {rule.last_run_result && (
                        <span>
                          ({rule.last_run_result.items_found} items
                          {rule.last_run_result.message_sent ? (
                            <CheckCircle className="h-3 w-3 inline ml-1 text-green-500" />
                          ) : (
                            <XCircle className="h-3 w-3 inline ml-1 text-red-500" />
                          )})
                        </span>
                      )}
                    </span>
                  )}
                  {rule.params.threshold_days && (
                    <span>Threshold: {rule.params.threshold_days}d</span>
                  )}
                  {rule.params.advance_days && (
                    <span>Advance: {rule.params.advance_days}d</span>
                  )}
                  {rule.params.lookback_days && (
                    <span>Lookback: {rule.params.lookback_days}d</span>
                  )}
                </div>

                {/* Recent logs */}
                {rule.recent_logs.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-gray-100 space-y-0.5">
                    {rule.recent_logs.slice(0, 3).map((log) => (
                      <div key={log.id} className="text-xs text-gray-500 flex items-center gap-2">
                        {log.error ? (
                          <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                        ) : log.message_sent ? (
                          <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                        ) : (
                          <span className="h-3 w-3 rounded-full bg-gray-300 inline-block shrink-0" />
                        )}
                        <span>{new Date(log.run_at).toLocaleString()}</span>
                        <span>{log.items_found} items</span>
                        {log.duration_ms && <span>{log.duration_ms}ms</span>}
                        {log.error && <span className="text-red-500 truncate max-w-[200px]">{log.error}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleTest(rule.rule_type)} disabled={testing === rule.rule_type}>
                    {testing === rule.rule_type ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                    Test
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(rule)}>
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setDeletingRule(rule); setDeleteDialogOpen(true); }}>
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Reminder' : 'New Reminder'}</DialogTitle>
            <DialogDescription>
              {editingRule ? 'Update reminder settings and Telegram routing.' : 'Create a new automated reminder rule.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                placeholder="KOL Stats Stale 90+ Days"
                className="focus-brand"
              />
            </div>

            {!editingRule && (
              <div>
                <Label>Rule Type</Label>
                <Select
                  value={formData.rule_type}
                  onValueChange={(v) => setFormData((f) => ({ ...f, rule_type: v, params: {} }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(RULE_TYPES).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Description (optional)</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                placeholder="Short description of what this reminder does"
                className="focus-brand"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Telegram Chat</Label>
                {tgChats.length > 0 ? (
                  <Select
                    value={formData.telegram_chat_id}
                    onValueChange={(v) => setFormData((f) => ({ ...f, telegram_chat_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a chat..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tgChats.map((chat) => (
                        <SelectItem key={chat.id} value={chat.chat_id}>
                          <span className="flex items-center gap-1.5">
                            <Send className="h-3 w-3 text-gray-400" />
                            {chat.title || chat.chat_id}
                            {chat.chat_type && (
                              <span className="text-gray-400 text-xs">({chat.chat_type})</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={formData.telegram_chat_id}
                    onChange={(e) => setFormData((f) => ({ ...f, telegram_chat_id: e.target.value }))}
                    placeholder="-100123456789"
                    className="focus-brand"
                  />
                )}
              </div>
              <div>
                <Label>Thread ID (optional)</Label>
                <Input
                  value={formData.telegram_thread_id}
                  onChange={(e) => setFormData((f) => ({ ...f, telegram_thread_id: e.target.value }))}
                  placeholder="12345"
                  className="focus-brand"
                />
              </div>
            </div>

            <div>
              <Label>Schedule</Label>
              <Select
                value={formData.schedule_type}
                onValueChange={(v) => setFormData((f) => ({ ...f, schedule_type: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SCHEDULE_TYPES).map(([key, { label, description }]) => (
                    <SelectItem key={key} value={key}>{label} - {description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-4">
              <Label className="text-sm font-medium mb-2 block">Parameters</Label>
              {renderParamEditor()}
            </div>

            {/* Message Template */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Message Template</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-gray-500"
                  onClick={() => setShowPreview(!showPreview)}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  {showPreview ? 'Hide Preview' : 'Show Preview'}
                </Button>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Customize the Telegram message. Variables: <code className="bg-gray-100 px-1 rounded">{'{{name}}'}</code> <code className="bg-gray-100 px-1 rounded">{'{{emoji}}'}</code> <code className="bg-gray-100 px-1 rounded">{'{{count}}'}</code> <code className="bg-gray-100 px-1 rounded">{'{{label}}'}</code> <code className="bg-gray-100 px-1 rounded">{'{{detail}}'}</code>
              </p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-gray-500">Header</Label>
                  <Textarea
                    value={formData.params.message_template?.header ?? (DEFAULT_TEMPLATES[formData.rule_type]?.header || '')}
                    onChange={(e) => setFormData((prev) => ({
                      ...prev,
                      params: {
                        ...prev.params,
                        message_template: {
                          ...(prev.params.message_template || {}),
                          header: e.target.value,
                        },
                      },
                    }))}
                    rows={2}
                    className="focus-brand font-mono text-xs"
                    placeholder="<b>{{emoji}} {{name}}</b>"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Item format (repeated per item)</Label>
                  <Input
                    value={formData.params.message_template?.item ?? (DEFAULT_TEMPLATES[formData.rule_type]?.item || '')}
                    onChange={(e) => setFormData((prev) => ({
                      ...prev,
                      params: {
                        ...prev.params,
                        message_template: {
                          ...(prev.params.message_template || {}),
                          item: e.target.value,
                        },
                      },
                    }))}
                    className="focus-brand font-mono text-xs"
                    placeholder="\u2022 {{label}} — {{detail}}"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Footer (optional)</Label>
                  <Input
                    value={formData.params.message_template?.footer ?? (DEFAULT_TEMPLATES[formData.rule_type]?.footer || '')}
                    onChange={(e) => setFormData((prev) => ({
                      ...prev,
                      params: {
                        ...prev.params,
                        message_template: {
                          ...(prev.params.message_template || {}),
                          footer: e.target.value,
                        },
                      },
                    }))}
                    className="focus-brand font-mono text-xs"
                    placeholder="Optional footer text"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setFormData((prev) => ({
                      ...prev,
                      params: {
                        ...prev.params,
                        message_template: undefined,
                      },
                    }))}
                  >
                    Reset to Default
                  </Button>
                </div>
              </div>

              {/* Live Preview */}
              {showPreview && (() => {
                const tmpl = formData.params.message_template || DEFAULT_TEMPLATES[formData.rule_type] || DEFAULT_TEMPLATES.kol_stats_stale;
                const emoji = RULE_EMOJI[formData.rule_type] || '\u{1F514}';
                const headerText = (tmpl.header || DEFAULT_TEMPLATES[formData.rule_type]?.header || '')
                  .replace('{{emoji}}', emoji)
                  .replace('{{name}}', formData.name || 'Reminder Name')
                  .replace('{{count}}', '3');
                const itemText = (tmpl.item || DEFAULT_TEMPLATES[formData.rule_type]?.item || '')
                  .replace('{{label}}', 'Example Item')
                  .replace('{{detail}}', 'sample detail')
                  .replace(/ — $/, '');
                const footerText = (tmpl.footer || '')
                  .replace('{{emoji}}', emoji)
                  .replace('{{name}}', formData.name || 'Reminder Name')
                  .replace('{{count}}', '3');

                return (
                  <div className="mt-3 bg-gray-50 border rounded-lg p-3">
                    <Label className="text-xs text-gray-500 mb-1 block">Preview</Label>
                    <div
                      className="text-sm text-gray-900 whitespace-pre-wrap font-mono"
                      dangerouslySetInnerHTML={{
                        __html: headerText + '\n' + itemText + '\n' + itemText + '\n' + itemText + (footerText ? '\n\n' + footerText : ''),
                      }}
                    />
                  </div>
                );
              })()}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingRule ? 'Save Changes' : 'Create Reminder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Reminder</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingRule?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
