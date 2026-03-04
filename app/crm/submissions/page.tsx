'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Search, Inbox, Clock, DollarSign, User, Mail, MessageSquare,
  Target, Calendar, ChevronDown, ChevronUp, ExternalLink
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface ContactSubmission {
  id: number;
  name: string;
  project_name: string;
  email: string;
  role: string;
  telegram: string;
  funding: string;
  timeline: string;
  goals: string;
  created_at: string;
}

export default function SubmissionsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<ContactSubmission | null>(null);
  const [sortField, setSortField] = useState<'created_at' | 'name' | 'project_name'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('contact_submissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubmissions(data || []);
    } catch (error) {
      console.error('Error fetching submissions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load submissions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let items = submissions;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      items = items.filter(s =>
        s.name?.toLowerCase().includes(term) ||
        s.project_name?.toLowerCase().includes(term) ||
        s.email?.toLowerCase().includes(term) ||
        s.telegram?.toLowerCase().includes(term) ||
        s.role?.toLowerCase().includes(term)
      );
    }
    return [...items].sort((a, b) => {
      const aVal = a[sortField] || '';
      const bVal = b[sortField] || '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [submissions, searchTerm, sortField, sortDir]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 inline ml-1" />
      : <ChevronDown className="h-3 w-3 inline ml-1" />;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const timelineColor = (timeline: string) => {
    if (timeline?.toLowerCase().includes('asap') || timeline?.toLowerCase().includes('immediately')) return 'bg-red-100 text-red-700 border-red-200';
    if (timeline?.toLowerCase().includes('soon') || timeline?.toLowerCase().includes('1-2')) return 'bg-amber-100 text-amber-700 border-amber-200';
    if (timeline?.toLowerCase().includes('3-6') || timeline?.toLowerCase().includes('quarter')) return 'bg-blue-100 text-blue-700 border-blue-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const fundingColor = (funding: string) => {
    if (funding?.includes('10M') || funding?.includes('50M') || funding?.includes('100M')) return 'bg-green-100 text-green-700 border-green-200';
    if (funding?.includes('2M') || funding?.includes('5M')) return 'bg-teal-100 text-teal-700 border-teal-200';
    if (funding?.includes('500K') || funding?.includes('1M')) return 'bg-blue-100 text-blue-700 border-blue-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  // Stats
  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisWeek = submissions.filter(s => new Date(s.created_at) >= weekAgo).length;
    return { total: submissions.length, thisWeek };
  }, [submissions]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Contact Submissions</h2>
          <p className="text-gray-600">Inbound inquiries from the contact form</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 px-5">
            <div className="flex items-center gap-2 mb-1">
              <Inbox className="h-4 w-4 text-gray-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-400 mt-1">All submissions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-5">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-blue-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">This Week</p>
            </div>
            <p className="text-2xl font-bold text-blue-700">{stats.thisWeek}</p>
            <p className="text-xs text-gray-400 mt-1">Last 7 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-5">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-gray-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Latest</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {submissions.length > 0 ? formatDate(submissions[0].created_at) : '—'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Most recent submission</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by name, project, email..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-10 w-64 auth-input"
        />
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer hover:text-gray-900 w-[180px]"
                onClick={() => handleSort('created_at')}
              >
                Date <SortIcon field="created_at" />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('name')}
              >
                Name <SortIcon field="name" />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('project_name')}
              >
                Project <SortIcon field="project_name" />
              </TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telegram</TableHead>
              <TableHead>Funding</TableHead>
              <TableHead>Timeline</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-gray-400">
                  {searchTerm ? 'No submissions match your search' : 'No submissions yet'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(s => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => setSelectedSubmission(s)}
                >
                  <TableCell className="text-sm text-gray-500">
                    <div>{formatDate(s.created_at)}</div>
                    <div className="text-xs text-gray-400">{formatTime(s.created_at)}</div>
                  </TableCell>
                  <TableCell className="font-medium text-gray-900">{s.name}</TableCell>
                  <TableCell className="text-gray-700">{s.project_name}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{s.role}</TableCell>
                  <TableCell>
                    <a
                      href={`mailto:${s.email}`}
                      onClick={e => e.stopPropagation()}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {s.email}
                    </a>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{s.telegram}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${fundingColor(s.funding)}`}>
                      {s.funding}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${timelineColor(s.timeline)}`}>
                      {s.timeline}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedSubmission} onOpenChange={open => !open && setSelectedSubmission(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" style={{ color: '#3e8692' }} />
              {selectedSubmission?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedSubmission && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Project</p>
                  <p className="text-sm font-medium text-gray-900">{selectedSubmission.project_name}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Role</p>
                  <p className="text-sm text-gray-700">{selectedSubmission.role}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Email</p>
                  <a href={`mailto:${selectedSubmission.email}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {selectedSubmission.email}
                  </a>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Telegram</p>
                  <p className="text-sm text-gray-700 flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {selectedSubmission.telegram}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Funding</p>
                  <Badge variant="outline" className={`text-xs ${fundingColor(selectedSubmission.funding)}`}>
                    <DollarSign className="h-3 w-3 mr-1" />
                    {selectedSubmission.funding}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Timeline</p>
                  <Badge variant="outline" className={`text-xs ${timelineColor(selectedSubmission.timeline)}`}>
                    <Clock className="h-3 w-3 mr-1" />
                    {selectedSubmission.timeline}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Goals</p>
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 leading-relaxed border">
                  {selectedSubmission.goals || '—'}
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t text-xs text-gray-400">
                <span>Submitted {formatDate(selectedSubmission.created_at)} at {formatTime(selectedSubmission.created_at)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
