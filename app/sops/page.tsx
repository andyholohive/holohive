'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus, Search, Edit, BookOpen, User, Trash2, Calendar, ExternalLink,
  AlertCircle, CheckCircle, Clock, ChevronLeft, ChevronRight, Link as LinkIcon,
  Play, FileText, History
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { toneClassName, type BadgeTone } from '@/components/ui/status-badge';
import { DeliverableWizard } from '@/components/tasks/DeliverableWizard';
import dynamic from 'next/dynamic';

// Dynamically import ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
import 'react-quill/dist/quill.snow.css';

interface SOP {
  id: string;
  name: string;
  trigger: string | null;
  outcome: string | null;
  content: string | null;
  clickup_link: string | null;
  documentation_link: string | null;
  owner_id: string | null;
  category: string;
  status: string;
  automation_review_requested: boolean;
  automation_review_completed: boolean;
  automation_notes: string | null;
  /** Optional link to a deliverable_template. When set, the SOP detail
   *  view shows a "Run this SOP" button that opens the DeliverableWizard
   *  pre-loaded with the linked template (added 2026-05-07, migration 048). */
  deliverable_template_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  owner?: {
    id: string;
    name: string;
    email: string;
  };
  creator?: {
    id: string;
    name: string;
    email: string;
  };
}

interface SOPVersion {
  id: string;
  sop_id: string;
  version_number: number;
  snapshot: any;
  changed_by: string | null;
  changed_at: string;
  change_summary: string | null;
  changer?: {
    name: string;
  };
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

const CATEGORIES = [
  { value: 'campaign', label: 'Campaign' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'bd', label: 'BD' },
  { value: 'kol', label: 'KOL' },
  { value: 'client', label: 'Client' },
  { value: 'general', label: 'General' },
];

// Status + category tone maps. Migrated to centralized StatusBadge palette
// 2026-05-06 — was inventing yellow/teal/orange tones inline. The palette
// defined in components/ui/status-badge.tsx is the source of truth; pick
// the closest existing tone rather than adding new colors here.
const STATUS_TONES: Record<string, BadgeTone> = {
  draft:    'warning',  // amber, was bg-yellow-100
  active:   'success',  // emerald, was bg-green-100
  inactive: 'neutral',  // gray, unchanged
};
const STATUSES = [
  { value: 'draft',    label: 'Draft' },
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const CATEGORY_TONES: Record<string, BadgeTone> = {
  campaign:   'info',    // sky, was blue
  onboarding: 'purple',  // unchanged
  bd:         'warning', // amber, was orange — closest in palette
  kol:        'pink',    // unchanged
  client:     'brand',   // brand teal, was teal-100 (same intent, palette token)
  general:    'neutral', // gray, unchanged
};

const getStatusColor = (status: string) =>
  toneClassName(STATUS_TONES[status] ?? 'neutral');

const getCategoryColor = (category: string) =>
  toneClassName(CATEGORY_TONES[category] ?? 'neutral');

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// Quill editor modules configuration
const quillModules = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'indent': '-1'}, { 'indent': '+1' }],
    ['link'],
    ['clean']
  ],
};

export default function SOPsPage() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [sops, setSops] = useState<SOP[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Dialog states
  const [isCreateEditOpen, setIsCreateEditOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingSOP, setEditingSOP] = useState<SOP | null>(null);
  const [viewingSOP, setViewingSOP] = useState<SOP | null>(null);
  const [deletingSOP, setDeletingSOP] = useState<SOP | null>(null);
  const [sopVersions, setSopVersions] = useState<SOPVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    trigger: '',
    outcome: '',
    content: '',
    clickup_link: '',
    documentation_link: '',
    owner_id: '',
    category: 'general',
    status: 'draft',
    deliverable_template_id: '',  // empty string = unlinked (form convention)
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Deliverable templates dropdown for the "link this SOP to a template"
  // field. Loaded once on mount alongside the SOP list.
  const [deliverableTemplates, setDeliverableTemplates] = useState<Array<{ id: string; name: string }>>([]);
  // Wizard state — opened when user clicks "Run this SOP" on the
  // detail view. Pre-loaded with the linked template + SOP name.
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardTemplateId, setWizardTemplateId] = useState<string | null>(null);
  const [wizardInitialTitle, setWizardInitialTitle] = useState<string>('');
  const [wizardClients, setWizardClients] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    fetchSOPs();
    fetchTeamMembers();
    fetchDeliverableTemplatesAndClients();
  }, []);

  // Load deliverable templates (for the link picker) + active clients
  // (for the wizard's client field). Both are small + rarely change,
  // so a single load on mount is fine.
  const fetchDeliverableTemplatesAndClients = async () => {
    try {
      const [tmplRes, clientsRes] = await Promise.all([
        (supabase as any)
          .from('deliverable_templates')
          .select('id, name')
          .eq('is_active', true)
          .order('name'),
        (supabase as any)
          .from('clients')
          .select('id, name')
          .eq('is_active', true)
          .is('archived_at', null)
          .order('name'),
      ]);
      setDeliverableTemplates(tmplRes.data || []);
      setWizardClients(clientsRes.data || []);
    } catch (err) {
      console.error('Error loading templates/clients:', err);
    }
  };

  const fetchSOPs = async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('sops')
        .select(`
          *,
          owner:users!sops_owner_id_fkey(id, name, email),
          creator:users!sops_created_by_fkey(id, name, email)
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setSops(data || []);
    } catch (error) {
      console.error('Error fetching SOPs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load SOPs',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email')
        .order('name');

      if (error) throw error;
      setTeamMembers(data || []);
    } catch (error) {
      console.error('Error fetching team members:', error);
    }
  };

  const fetchVersionHistory = async (sopId: string) => {
    try {
      setLoadingVersions(true);
      const { data, error } = await (supabase as any)
        .from('sop_versions')
        .select(`
          *,
          changer:users!sop_versions_changed_by_fkey(name)
        `)
        .eq('sop_id', sopId)
        .order('version_number', { ascending: false });

      if (error) throw error;
      setSopVersions(data || []);
    } catch (error) {
      console.error('Error fetching version history:', error);
    } finally {
      setLoadingVersions(false);
    }
  };

  // Filter SOPs
  const filteredSOPs = sops.filter(sop => {
    const matchesSearch =
      sop.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sop.trigger?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sop.outcome?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sop.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || sop.category === categoryFilter;
    const matchesOwner = ownerFilter === 'all' || sop.owner_id === ownerFilter;
    return matchesSearch && matchesStatus && matchesCategory && matchesOwner;
  });

  // Pagination
  const totalPages = Math.ceil(filteredSOPs.length / itemsPerPage);
  const paginatedSOPs = filteredSOPs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, categoryFilter, ownerFilter]);

  // Count for automation review queue
  const automationReviewCount = sops.filter(
    sop => sop.automation_review_requested && !sop.automation_review_completed
  ).length;

  // Status counts
  const statusCounts = {
    all: sops.length,
    draft: sops.filter(s => s.status === 'draft').length,
    active: sops.filter(s => s.status === 'active').length,
    inactive: sops.filter(s => s.status === 'inactive').length,
  };

  const handleCreateNew = () => {
    setEditingSOP(null);
    setFormData({
      name: '',
      trigger: '',
      outcome: '',
      content: '',
      clickup_link: '',
      documentation_link: '',
      owner_id: user?.id || '',
      category: 'general',
      status: 'draft',
      deliverable_template_id: '',
    });
    setIsCreateEditOpen(true);
  };

  const handleEdit = (sop: SOP) => {
    setEditingSOP(sop);
    setFormData({
      name: sop.name,
      trigger: sop.trigger || '',
      outcome: sop.outcome || '',
      content: sop.content || '',
      clickup_link: sop.clickup_link || '',
      documentation_link: sop.documentation_link || '',
      owner_id: sop.owner_id || '',
      category: sop.category,
      status: sop.status,
      deliverable_template_id: sop.deliverable_template_id || '',
    });
    setIsCreateEditOpen(true);
  };

  const handleView = (sop: SOP) => {
    setViewingSOP(sop);
    setIsViewOpen(true);
  };

  const handleDelete = (sop: SOP) => {
    setDeletingSOP(sop);
    setIsDeleteOpen(true);
  };

  const handleViewHistory = async (sop: SOP) => {
    setViewingSOP(sop);
    await fetchVersionHistory(sop.id);
    setIsHistoryOpen(true);
  };

  const saveVersion = async (sopId: string, sopData: any, changeSummary?: string) => {
    // Get current version number
    const { data: versions } = await (supabase as any)
      .from('sop_versions')
      .select('version_number')
      .eq('sop_id', sopId)
      .order('version_number', { ascending: false })
      .limit(1);

    const nextVersion = versions && versions.length > 0 ? versions[0].version_number + 1 : 1;

    await (supabase as any).from('sop_versions').insert({
      sop_id: sopId,
      version_number: nextVersion,
      snapshot: sopData,
      changed_by: user?.id,
      change_summary: changeSummary || null,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'SOP name is required',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingSOP) {
        // Update existing SOP
        const { error } = await (supabase as any)
          .from('sops')
          .update({
            name: formData.name,
            trigger: formData.trigger || null,
            outcome: formData.outcome || null,
            content: formData.content || null,
            clickup_link: formData.clickup_link || null,
            documentation_link: formData.documentation_link || null,
            owner_id: formData.owner_id || null,
            category: formData.category,
            status: formData.status,
            deliverable_template_id: formData.deliverable_template_id || null,
          })
          .eq('id', editingSOP.id);

        if (error) throw error;

        // Save version
        await saveVersion(editingSOP.id, formData, 'Updated SOP');

        toast({
          title: 'Success',
          description: 'SOP updated successfully',
        });
      } else {
        // Create new SOP
        const { data, error } = await (supabase as any)
          .from('sops')
          .insert({
            name: formData.name,
            trigger: formData.trigger || null,
            outcome: formData.outcome || null,
            content: formData.content || null,
            clickup_link: formData.clickup_link || null,
            documentation_link: formData.documentation_link || null,
            owner_id: formData.owner_id || null,
            category: formData.category,
            status: formData.status,
            deliverable_template_id: formData.deliverable_template_id || null,
            created_by: user?.id,
          })
          .select()
          .single();

        if (error) throw error;

        // Save initial version
        if (data) {
          await saveVersion(data.id, formData, 'Initial version');
        }

        toast({
          title: 'Success',
          description: 'SOP created successfully',
        });
      }

      setIsCreateEditOpen(false);
      fetchSOPs();
    } catch (error) {
      console.error('Error saving SOP:', error);
      toast({
        title: 'Error',
        description: 'Failed to save SOP',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingSOP) return;

    try {
      const { error } = await (supabase as any)
        .from('sops')
        .delete()
        .eq('id', deletingSOP.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'SOP deleted successfully',
      });
      setIsDeleteOpen(false);
      setDeletingSOP(null);
      fetchSOPs();
    } catch (error) {
      console.error('Error deleting SOP:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete SOP',
        variant: 'destructive',
      });
    }
  };

  const handleRequestAutomationReview = async (sop: SOP) => {
    try {
      const { error } = await (supabase as any)
        .from('sops')
        .update({
          automation_review_requested: true,
          automation_review_completed: false,
        })
        .eq('id', sop.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Automation review requested',
      });
      fetchSOPs();
    } catch (error) {
      console.error('Error requesting review:', error);
      toast({
        title: 'Error',
        description: 'Failed to request review',
        variant: 'destructive',
      });
    }
  };

  const handleCompleteAutomationReview = async (sop: SOP, notes: string) => {
    try {
      const { error } = await (supabase as any)
        .from('sops')
        .update({
          automation_review_completed: true,
          automation_notes: notes,
        })
        .eq('id', sop.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Automation review completed',
      });
      fetchSOPs();
    } catch (error) {
      console.error('Error completing review:', error);
    }
  };

  // Loading skeleton
  const SOPCardSkeleton = () => (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex gap-2 mt-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4 mb-4" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">SOPs</h2>
              <p className="text-gray-600">Standard Operating Procedures</p>
            </div>
            <Button disabled style={{ backgroundColor: '#3e8692', color: 'white' }}>
              <Plus className="h-4 w-4 mr-2" />
              Create SOP
            </Button>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative flex-1 max-w-sm">
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-10 w-[150px]" />
            <Skeleton className="h-10 w-[150px]" />
          </div>
          {/* Tabs Skeleton */}
          <div className="flex gap-2">
            <Skeleton className="h-9 w-16 rounded-md" />
            <Skeleton className="h-9 w-20 rounded-md" />
            <Skeleton className="h-9 w-20 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SOPCardSkeleton key={i} />
            ))}
          </div>
        </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">SOPs</h2>
            <p className="text-gray-600">Standard Operating Procedures</p>
          </div>
          <Button
            onClick={handleCreateNew}
            className="hover:opacity-90"
            style={{ backgroundColor: '#3e8692', color: 'white' }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Create SOP
          </Button>
        </div>

        {/* Automation Review Queue Alert */}
        {automationReviewCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800">Automation Review Queue</p>
                <p className="text-sm text-amber-700">
                  {automationReviewCount} SOP{automationReviewCount !== 1 ? 's' : ''} waiting for automation review
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStatusFilter('all');
                setCategoryFilter('all');
                setOwnerFilter('all');
                setSearchTerm('');
              }}
              className="border-amber-300 text-amber-700 hover:bg-amber-100"
            >
              View Queue
            </Button>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search SOPs..."
              className="pl-10 focus-brand"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px] focus-brand">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[150px] focus-brand">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              {teamMembers.map(member => (
                <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status Tabs */}
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="bg-gray-100 p-1 h-auto">
            <TabsTrigger
              value="all"
              className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm px-4 py-2"
            >
              All
              <span className="ml-2 text-xs bg-gray-200 data-[state=active]:bg-gray-100 px-2 py-0.5 rounded-full pointer-events-none">
                {statusCounts.all}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="draft"
              className="data-[state=active]:bg-white data-[state=active]:text-yellow-700 data-[state=active]:shadow-sm px-4 py-2"
            >
              Draft
              <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full pointer-events-none">
                {statusCounts.draft}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="active"
              className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm px-4 py-2"
            >
              Active
              <span className="ml-2 text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full pointer-events-none">
                {statusCounts.active}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="inactive"
              className="data-[state=active]:bg-white data-[state=active]:text-gray-700 data-[state=active]:shadow-sm px-4 py-2"
            >
              Inactive
              <span className="ml-2 text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full pointer-events-none">
                {statusCounts.inactive}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* SOP Cards */}
        {filteredSOPs.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">
              {searchTerm || statusFilter !== 'all' || categoryFilter !== 'all' || ownerFilter !== 'all'
                ? 'No SOPs found matching your filters.'
                : 'No SOPs yet. Create your first SOP to get started.'}
            </p>
            {!searchTerm && statusFilter === 'all' && categoryFilter === 'all' && ownerFilter === 'all' && (
              <Button
                onClick={handleCreateNew}
                className="hover:opacity-90"
                style={{ backgroundColor: '#3e8692', color: 'white' }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First SOP
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedSOPs.map((sop) => (
              <Card key={sop.id} className="h-full flex flex-col group hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="bg-gray-100 p-1.5 rounded-lg flex-shrink-0">
                        <BookOpen className="h-4 w-4 text-gray-600" />
                      </div>
                      <h3 className="font-semibold text-gray-900 truncate">{sop.name}</h3>
                    </div>
                    <Badge className={`flex-shrink-0 pointer-events-none ${getStatusColor(sop.status)}`}>
                      {sop.status.charAt(0).toUpperCase() + sop.status.slice(1)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="outline" className={`pointer-events-none ${getCategoryColor(sop.category)}`}>
                      {CATEGORIES.find(c => c.value === sop.category)?.label || sop.category}
                    </Badge>
                    {sop.deliverable_template_id && (
                      <Badge variant="outline" className="bg-brand/10 text-brand border-brand/30 pointer-events-none">
                        <Play className="h-3 w-3 mr-1" />
                        Runnable
                      </Badge>
                    )}
                    {sop.automation_review_requested && !sop.automation_review_completed && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 pointer-events-none">
                        <Clock className="h-3 w-3 mr-1" />
                        Review Pending
                      </Badge>
                    )}
                    {sop.automation_review_completed && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 pointer-events-none">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Reviewed
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  {sop.trigger && (
                    <div className="mb-2">
                      <p className="text-xs text-gray-500 font-medium">Trigger:</p>
                      <p className="text-sm text-gray-700 line-clamp-1 whitespace-pre-wrap">{sop.trigger}</p>
                    </div>
                  )}
                  {sop.outcome && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 font-medium">Outcome:</p>
                      <p className="text-sm text-gray-700 line-clamp-2 whitespace-pre-wrap">{sop.outcome}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                    {sop.owner && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {sop.owner.name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(sop.updated_at)}
                    </span>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleView(sop)}>
                      View
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleEdit(sop)}>
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewHistory(sop)}
                    >
                      <History className="h-3 w-3 mr-1" />
                      History
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {filteredSOPs.length > itemsPerPage && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-gray-600">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredSOPs.length)} of {filteredSOPs.length} SOPs
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={isCreateEditOpen} onOpenChange={setIsCreateEditOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingSOP ? 'Edit SOP' : 'Create New SOP'}</DialogTitle>
              <DialogDescription>
                {editingSOP ? 'Update the SOP details below.' : 'Fill in the details to create a new SOP.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="name">SOP Name *</Label>
                  <Input
                    id="name"
                    className="focus-brand"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., KOL Campaign – From Confirmation to Post Live"
                  />
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger className="focus-brand">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger className="focus-brand">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(status => (
                        <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="owner">Owner</Label>
                  <Select
                    value={formData.owner_id}
                    onValueChange={(value) => setFormData({ ...formData, owner_id: value })}
                  >
                    <SelectTrigger className="focus-brand">
                      <SelectValue placeholder="Select owner" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamMembers.map(member => (
                        <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="clickup_link">ClickUp Template Link</Label>
                  <Input
                    id="clickup_link"
                    className="focus-brand"
                    value={formData.clickup_link}
                    onChange={(e) => setFormData({ ...formData, clickup_link: e.target.value })}
                    placeholder="https://app.clickup.com/..."
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="documentation_link">Documentation Link</Label>
                  <Input
                    id="documentation_link"
                    className="focus-brand"
                    value={formData.documentation_link}
                    onChange={(e) => setFormData({ ...formData, documentation_link: e.target.value })}
                    placeholder="https://notion.so/... or other documentation"
                  />
                </div>
                {/* Linked deliverable template — when set, the SOP detail
                    view shows a "Run this SOP" button that opens the
                    DeliverableWizard pre-loaded with this template
                    (added 2026-05-07, migration 048). */}
                <div className="col-span-2">
                  <Label htmlFor="deliverable_template_id">Linked Deliverable Template <span className="text-gray-400 font-normal">(optional)</span></Label>
                  <Select
                    value={formData.deliverable_template_id || 'none'}
                    onValueChange={(value) => setFormData({ ...formData, deliverable_template_id: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger className="focus-brand">
                      <SelectValue placeholder="No linked template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— No linked template</SelectItem>
                      {deliverableTemplates.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">
                    Linking a template adds a &quot;Run this SOP&quot; button to the detail view, which spawns a multi-person task tree from the template.
                  </p>
                </div>
                <div className="col-span-2">
                  <Label htmlFor="trigger">Trigger (What starts this process?)</Label>
                  <Textarea
                    id="trigger"
                    className="focus-brand"
                    value={formData.trigger}
                    onChange={(e) => setFormData({ ...formData, trigger: e.target.value })}
                    placeholder="e.g., New client signs contract"
                    rows={2}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="outcome">Outcome (What does 'done' mean?)</Label>
                  <Textarea
                    id="outcome"
                    className="focus-brand"
                    value={formData.outcome}
                    onChange={(e) => setFormData({ ...formData, outcome: e.target.value })}
                    placeholder="e.g., All KOL posts are live, links tracked, and performance logged in HHP"
                    rows={2}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="content">SOP Content / Steps</Label>
                  <div className="mt-1 sop-editor-wrapper">
                    <style jsx global>{`
                      .sop-editor-wrapper {
                        height: 300px;
                        min-height: 150px;
                        max-height: 70vh;
                        overflow-y: auto;
                        border: 1px solid #e5e7eb;
                        border-radius: 0.375rem;
                        resize: vertical;
                      }
                      .sop-editor-wrapper .ql-toolbar {
                        position: sticky;
                        top: 0;
                        z-index: 10;
                        background: white;
                        border-top: none;
                        border-left: none;
                        border-right: none;
                      }
                      .sop-editor-wrapper .ql-container {
                        border: none;
                        min-height: 200px;
                      }
                    `}</style>
                    <ReactQuill
                      theme="snow"
                      value={formData.content}
                      onChange={(value) => setFormData({ ...formData, content: value })}
                      modules={quillModules}
                      placeholder="Write the SOP steps here..."
                      className="bg-white"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Drag the bottom-right corner to resize</p>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateEditOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="hover:opacity-90"
                  style={{ backgroundColor: '#3e8692', color: 'white' }}
                >
                  {isSubmitting ? 'Saving...' : (editingSOP ? 'Update SOP' : 'Create SOP')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* View Dialog */}
        <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  {viewingSOP?.name}
                </DialogTitle>
                {viewingSOP && (
                  <Badge className={`pointer-events-none ${getStatusColor(viewingSOP.status)}`}>
                    {viewingSOP.status.charAt(0).toUpperCase() + viewingSOP.status.slice(1)}
                  </Badge>
                )}
              </div>
            </DialogHeader>
            {viewingSOP && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={`pointer-events-none ${getCategoryColor(viewingSOP.category)}`}>
                    {CATEGORIES.find(c => c.value === viewingSOP.category)?.label}
                  </Badge>
                  {viewingSOP.owner && (
                    <Badge variant="outline" className="pointer-events-none">
                      <User className="h-3 w-3 mr-1" />
                      {viewingSOP.owner.name}
                    </Badge>
                  )}
                </div>

                {viewingSOP.trigger && (
                  <div>
                    <h4 className="font-semibold text-sm text-gray-700 mb-1">Trigger</h4>
                    <p className="text-gray-600 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">{viewingSOP.trigger}</p>
                  </div>
                )}

                {viewingSOP.outcome && (
                  <div>
                    <h4 className="font-semibold text-sm text-gray-700 mb-1">Outcome</h4>
                    <p className="text-gray-600 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">{viewingSOP.outcome}</p>
                  </div>
                )}

                {viewingSOP.content && (
                  <div>
                    <h4 className="font-semibold text-sm text-gray-700 mb-1">SOP Content</h4>
                    <div
                      className="prose prose-sm max-w-none bg-gray-50 p-4 rounded-lg"
                      dangerouslySetInnerHTML={{ __html: viewingSOP.content }}
                    />
                  </div>
                )}

                <div className="flex flex-wrap gap-3 pt-2">
                  {viewingSOP.clickup_link && (
                    <a
                      href={viewingSOP.clickup_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                      ClickUp Template
                    </a>
                  )}
                  {viewingSOP.documentation_link && (
                    <a
                      href={viewingSOP.documentation_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
                    >
                      <FileText className="h-4 w-4" />
                      Documentation
                    </a>
                  )}
                </div>

                {viewingSOP.automation_notes && (
                  <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
                    <h4 className="font-semibold text-sm text-green-800 mb-1">Automation Notes</h4>
                    <p className="text-green-700 text-sm">{viewingSOP.automation_notes}</p>
                  </div>
                )}

                <div className="flex justify-between items-center pt-4 border-t">
                  <p className="text-xs text-gray-500">
                    Last updated: {formatDate(viewingSOP.updated_at)}
                  </p>
                  <div className="flex gap-2">
                    {/* Run this SOP — only when a deliverable template is
                        linked. Closes the view dialog and opens the
                        DeliverableWizard pre-loaded with the template +
                        SOP name as the initial deliverable title. */}
                    {viewingSOP.deliverable_template_id && (
                      <Button
                        size="sm"
                        className="hover:opacity-90"
                        style={{ backgroundColor: '#3e8692', color: 'white' }}
                        onClick={() => {
                          setWizardTemplateId(viewingSOP.deliverable_template_id);
                          setWizardInitialTitle(viewingSOP.name);
                          setIsViewOpen(false);
                          setWizardOpen(true);
                        }}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Run this SOP
                      </Button>
                    )}
                    {!viewingSOP.automation_review_requested && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          handleRequestAutomationReview(viewingSOP);
                          setIsViewOpen(false);
                        }}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Request Automation Review
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsViewOpen(false);
                        handleEdit(viewingSOP);
                      }}
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete SOP</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{deletingSOP?.name}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Version History Dialog */}
        <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Version History: {viewingSOP?.name}</DialogTitle>
              <DialogDescription>
                View all changes made to this SOP over time.
              </DialogDescription>
            </DialogHeader>
            {loadingVersions ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : sopVersions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No version history available.</p>
            ) : (
              <div className="space-y-3">
                {sopVersions.map((version) => (
                  <div
                    key={version.id}
                    className="border rounded-lg p-4 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">v{version.version_number}</Badge>
                        <span className="text-sm text-gray-600">
                          {version.changer?.name || 'Unknown'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(version.changed_at).toLocaleString()}
                      </span>
                    </div>
                    {version.change_summary && (
                      <p className="text-sm text-gray-700">{version.change_summary}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Run-this-SOP wizard. Lazy-mounted; only renders when a user
            clicks "Run this SOP" on a linked SOP. Pre-selects the
            template + seeds the title with the SOP name. The wizard's
            existing per-step assignment table handles multi-person
            assignment (fixed 2026-05-07 in the deliverables flow). */}
        <DeliverableWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          teamMembers={teamMembers.map(m => ({
            id: m.id,
            name: m.name,
            email: m.email,
            role: null,
            profile_photo_url: null,
          })) as any}
          clients={wizardClients}
          onCreated={() => {
            setWizardOpen(false);
            toast({
              title: 'Deliverable created',
              description: 'Tasks have been generated from the SOP. Open Tasks to view them.',
            });
          }}
          preselectedTemplateId={wizardTemplateId ?? undefined}
          initialTitle={wizardInitialTitle}
        />
      </div>
  );
}
