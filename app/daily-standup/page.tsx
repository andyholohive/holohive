'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { UserService } from '@/lib/userService';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import {
  Plus,
  CheckCircle,
  Search,
  Trash2,
  Edit,
  Calendar as CalendarIcon,
  ClipboardList,
  X,
  Check,
  XCircle,
  ExternalLink,
} from 'lucide-react';

type DailyStandup = {
  id: string;
  user_id: string;
  user_name: string;
  completed_yesterday: 'Yes' | 'No';
  priorities: string;
  output_goal: string;
  blockers: string | null;
  submitted_at: string;
  submission_date: string;
  created_at: string;
};

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  profile_photo_url: string | null;
};

export default function DailyStandupPage() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [standups, setStandups] = useState<DailyStandup[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    completed_yesterday: '' as string,
    priorities: '',
    output_goal: '',
    blockers: '',
  });

  useEffect(() => {
    fetchStandups();
    UserService.getAllUsers().then((users) => {
      setTeamMembers(
        users
          .filter(u => u.role !== 'client')
          .map(u => ({ id: u.id, name: u.name || u.email, email: u.email, role: u.role, profile_photo_url: u.profile_photo_url || null }))
      );
    });
  }, []);

  const fetchStandups = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('daily_standups')
      .select('*')
      .order('submission_date', { ascending: false })
      .order('submitted_at', { ascending: false });
    setStandups(data || []);
    setLoading(false);
  };

  // Check if user already submitted today
  const todayStr = new Date().toISOString().split('T')[0];
  const hasSubmittedToday = useMemo(() => {
    return standups.some(s => s.user_id === user?.id && s.submission_date === todayStr);
  }, [standups, user?.id, todayStr]);

  // Filter standups
  const filtered = useMemo(() => {
    return standups.filter(s => {
      const matchesUser = selectedUserId === 'all' || s.user_id === selectedUserId;
      const matchesSearch = !searchTerm ||
        s.priorities.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.output_goal.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.blockers && s.blockers.toLowerCase().includes(searchTerm.toLowerCase())) ||
        s.user_name.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesUser && matchesSearch;
    });
  }, [standups, selectedUserId, searchTerm]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, DailyStandup[]> = {};
    for (const s of filtered) {
      if (!groups[s.submission_date]) groups[s.submission_date] = [];
      groups[s.submission_date].push(s);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  // Get team members who have submitted at least one standup
  const activeMembers = useMemo(() => {
    const userIds = new Set(standups.map(s => s.user_id));
    return teamMembers.filter(m => userIds.has(m.id));
  }, [standups, teamMembers]);

  // Map user_id to profile photo
  const userPhotoMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    teamMembers.forEach(m => { map[m.id] = m.profile_photo_url; });
    return map;
  }, [teamMembers]);

  const openForm = (standup?: DailyStandup) => {
    if (standup) {
      setEditingId(standup.id);
      setForm({
        completed_yesterday: standup.completed_yesterday,
        priorities: standup.priorities,
        output_goal: standup.output_goal,
        blockers: standup.blockers || '',
      });
    } else {
      setEditingId(null);
      setForm({
        completed_yesterday: '',
        priorities: '',
        output_goal: '',
        blockers: '',
      });
    }
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.completed_yesterday || !form.priorities.trim() || !form.output_goal.trim()) return;
    if (!user?.id || !userProfile) return;

    setSubmitting(true);
    try {
      const payload = {
        completed_yesterday: form.completed_yesterday,
        priorities: form.priorities.trim(),
        output_goal: form.output_goal.trim(),
        blockers: form.blockers.trim() || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from('daily_standups')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Updated', description: 'Stand-up entry updated.' });
      } else {
        const { error } = await supabase
          .from('daily_standups')
          .insert({
            ...payload,
            user_id: user.id,
            user_name: userProfile.name || userProfile.email || 'Unknown',
            submission_date: todayStr,
          });
        if (error) throw error;
        toast({ title: 'Submitted', description: 'Daily stand-up submitted.' });
      }

      setIsFormOpen(false);
      setEditingId(null);
      setForm({ completed_yesterday: '', priorities: '', output_goal: '', blockers: '' });
      await fetchStandups();
    } catch (err) {
      console.error('Error submitting standup:', err);
      toast({ title: 'Error', description: 'Failed to submit stand-up.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(null);
    setStandups(prev => prev.filter(s => s.id !== id));
    try {
      await supabase.from('daily_standups').delete().eq('id', id);
    } catch (error) {
      console.error('Error deleting:', error);
      await fetchStandups();
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split('T')[0]) return 'Today';
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="min-h-[calc(100vh-64px)] w-full bg-gray-50">
      <div className="w-full">
        <div className="space-y-4">
          {/* Header */}
          <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
            <div className="pb-5 border-b border-gray-100 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-gray-100 p-2 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Daily Stand-Up</h2>
                  <p className="text-sm text-gray-500">Track daily priorities and progress across the team</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => window.open('/public/standup/submit', '_blank')}
                className="hover:opacity-90"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Submission Form
              </Button>
              <Button
                className="hover:opacity-90"
                style={{ backgroundColor: '#3e8692', color: 'white' }}
                onClick={() => openForm()}
                disabled={hasSubmittedToday && !editingId}
              >
                <Plus className="h-4 w-4 mr-2" />
                {hasSubmittedToday ? 'Already Submitted Today' : 'Submit Stand-Up'}
              </Button>
              </div>
            </div>

            {/* User Tabs */}
            <div className="pt-4">
              {loading ? (
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-24 rounded" />)}
                </div>
              ) : (
                <Tabs value={selectedUserId} onValueChange={setSelectedUserId}>
                  <TabsList className="bg-gray-100 p-1 h-auto flex-wrap">
                    <TabsTrigger
                      value="all"
                      className="data-[state=active]:bg-white data-[state=active]:text-[#3e8692] data-[state=active]:shadow-sm text-sm px-4 py-2"
                    >
                      All
                      <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{standups.length}</span>
                    </TabsTrigger>
                    {activeMembers.map((member) => (
                      <TabsTrigger
                        key={member.id}
                        value={member.id}
                        className="data-[state=active]:bg-white data-[state=active]:text-[#3e8692] data-[state=active]:shadow-sm text-sm px-4 py-2"
                      >
                        {member.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}
            </div>

            {/* Search */}
            <div className="flex flex-wrap items-center gap-3 pt-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search priorities, goals, blockers..."
                  className="pl-10 auth-input"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {searchTerm && (
                <Button variant="ghost" size="sm" onClick={() => setSearchTerm('')}>
                  Clear
                </Button>
              )}
            </div>

            {/* Content */}
            <div className="mt-5 -mx-6 -mb-6">
              {loading ? (
                <div className="p-6 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="h-32 w-full rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                  <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">
                    {standups.length === 0 ? 'No stand-up submissions yet.' : 'No entries match your filters.'}
                  </p>
                  {standups.length === 0 && !hasSubmittedToday && (
                    <Button
                      className="mt-4 hover:opacity-90"
                      style={{ backgroundColor: '#3e8692', color: 'white' }}
                      onClick={() => openForm()}
                    >
                      <Plus className="h-4 w-4 mr-2" /> Submit Your First Stand-Up
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {groupedByDate.map(([date, entries]) => (
                    <div key={date} className="px-6 py-5">
                      {/* Date header */}
                      <div className="flex items-center gap-2 mb-4">
                        <CalendarIcon className="h-4 w-4 text-gray-400" />
                        <h3 className="text-sm font-semibold text-gray-700">{formatDate(date)}</h3>
                        <span className="text-xs text-gray-400">{date}</span>
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{entries.length} {entries.length === 1 ? 'submission' : 'submissions'}</span>
                      </div>

                      {/* Entries grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {entries.map((entry) => (
                          <div key={entry.id} className="border border-gray-200 rounded-xl bg-white hover:shadow-md transition-all group overflow-hidden">
                            {/* Card header with colored top border */}
                            <div className="border-b border-gray-100 bg-gray-50/50 px-5 py-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {userPhotoMap[entry.user_id] ? (
                                    <Image
                                      src={userPhotoMap[entry.user_id]!}
                                      alt={entry.user_name}
                                      width={36}
                                      height={36}
                                      className="rounded-full object-cover h-9 w-9"
                                    />
                                  ) : (
                                    <div className="h-9 w-9 rounded-full bg-[#3e8692]/10 flex items-center justify-center text-[#3e8692] text-sm font-bold">
                                      {entry.user_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                    </div>
                                  )}
                                  <div>
                                    <p className="text-sm font-semibold text-gray-900">{entry.user_name}</p>
                                    <p className="text-xs text-gray-400">{formatTime(entry.submitted_at)}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {entry.completed_yesterday === 'Yes' ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                                      <Check className="h-3 w-3" /> Done
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2.5 py-1 rounded-full">
                                      <X className="h-3 w-3" /> Not Done
                                    </span>
                                  )}
                                  {entry.user_id === user?.id && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-gray-200" onClick={() => openForm(entry)}>
                                        <Edit className="h-3.5 w-3.5 text-gray-500" />
                                      </Button>
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-red-50" onClick={() => setDeletingId(entry.id)}>
                                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Card body */}
                            <div className="px-5 py-4 space-y-4">
                              {/* Priorities */}
                              <div>
                                <p className="text-xs font-semibold text-[#3e8692] uppercase tracking-wider mb-1.5">Top Priorities</p>
                                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{entry.priorities}</p>
                              </div>

                              {/* Output Goal */}
                              <div>
                                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1.5">Output Goal</p>
                                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{entry.output_goal}</p>
                              </div>

                              {/* Blockers */}
                              {entry.blockers && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5">
                                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Blockers</p>
                                  <p className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">{entry.blockers}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Submit / Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) { setIsFormOpen(false); setEditingId(null); } }}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Stand-Up' : 'Daily Stand-Up'}</DialogTitle>
            <DialogDescription>
              {userProfile?.name || userProfile?.email} &mdash; {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 max-h-[60vh] overflow-y-auto px-1 pb-2">
            {/* Completed yesterday */}
            <div className="grid gap-2">
              <Label>Did you complete yesterday's priorities? <span className="text-red-500">*</span></Label>
              <Select value={form.completed_yesterday} onValueChange={(v) => setForm({ ...form, completed_yesterday: v })}>
                <SelectTrigger className="auth-input">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Top Priorities */}
            <div className="grid gap-2">
              <Label>Top 1-2 Priorities <span className="text-red-500">*</span></Label>
              <p className="text-xs text-gray-400 -mt-1">What will you finish or move forward significantly today? (e.g., "Send outbound pitch deck to 10 partners" instead of "Work on deck")</p>
              <Textarea
                value={form.priorities}
                onChange={(e) => setForm({ ...form, priorities: e.target.value })}
                placeholder="e.g., Send outbound pitch deck to 10 partners"
                className="auth-input"
                rows={3}
              />
            </div>

            {/* Output Goal */}
            <div className="grid gap-2">
              <Label>Output Goal <span className="text-red-500">*</span></Label>
              <p className="text-xs text-gray-400 -mt-1">Quantify what success looks like today (e.g., "Book 2 calls")</p>
              <Textarea
                value={form.output_goal}
                onChange={(e) => setForm({ ...form, output_goal: e.target.value })}
                placeholder='e.g., Book 2 calls'
                className="auth-input"
                rows={2}
              />
            </div>

            {/* Blockers */}
            <div className="grid gap-2">
              <Label>Any blockers, comments, etc.</Label>
              <p className="text-xs text-gray-400 -mt-1">Is anything slowing you down?</p>
              <Textarea
                value={form.blockers}
                onChange={(e) => setForm({ ...form, blockers: e.target.value })}
                placeholder="Optional — leave blank if none"
                className="auth-input"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsFormOpen(false); setEditingId(null); }}>Cancel</Button>
            <Button
              className="hover:opacity-90"
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              onClick={handleSubmit}
              disabled={!form.completed_yesterday || !form.priorities.trim() || !form.output_goal.trim() || submitting}
            >
              {submitting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : editingId ? 'Save Changes' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Stand-Up Entry</DialogTitle>
            <DialogDescription>Are you sure you want to delete this stand-up entry? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingId && handleDelete(deletingId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
