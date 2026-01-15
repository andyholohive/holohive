'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, Edit, Trash2, Share2, FileText, Copy, CheckCircle2, ExternalLink, Globe, Eye, Download, Upload, Users, Handshake, Link2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { FormService, FormWithStats, FormStatus, FormResponse, FormWithFields, FormField } from '@/lib/formService';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// Types for submissions
interface LeadSubmission {
  id: string;
  name: string;
  stage: string;
  source: string | null;
  deal_value: number | null;
  created_at: string;
  notes: string | null;
}

interface PartnerSubmission {
  id: string;
  name: string;
  category: string | null;
  status: string;
  poc_name: string | null;
  poc_email: string | null;
  poc_telegram: string | null;
  created_at: string;
  notes: string | null;
}

interface LinkSubmission {
  id: string;
  name: string;
  url: string;
  client: string | null;
  link_types: string[] | null;
  status: string;
  created_at: string;
  description: string | null;
}

export default function FormsPage() {
  const router = useRouter();
  const { toast } = useToast();

  // Active tab
  const [activeTab, setActiveTab] = useState('forms');

  // Forms state
  const [forms, setForms] = useState<FormWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  // Submissions state
  const [leads, setLeads] = useState<LeadSubmission[]>([]);
  const [partners, setPartners] = useState<PartnerSubmission[]>([]);
  const [links, setLinks] = useState<LinkSubmission[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | FormStatus>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedFormId, setCopiedFormId] = useState<string | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [sharingForm, setSharingForm] = useState<FormWithStats | null>(null);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [duplicatingForm, setDuplicatingForm] = useState<FormWithStats | null>(null);
  const [duplicateFormName, setDuplicateFormName] = useState('');
  const [isDuplicating, setIsDuplicating] = useState(false);

  // Responses dialog state
  const [isResponsesDialogOpen, setIsResponsesDialogOpen] = useState(false);
  const [viewingResponsesForm, setViewingResponsesForm] = useState<FormWithStats | null>(null);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);

  // Single response view state
  const [isResponseDetailOpen, setIsResponseDetailOpen] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<FormResponse | null>(null);
  const [formWithFields, setFormWithFields] = useState<FormWithFields | null>(null);

  // New form data
  const [newFormName, setNewFormName] = useState('');
  const [newFormDescription, setNewFormDescription] = useState('');
  const [newFormStatus, setNewFormStatus] = useState<FormStatus>('draft');

  useEffect(() => {
    fetchForms();
  }, []);

  const fetchForms = async () => {
    try {
      setLoading(true);
      const data = await FormService.getAllForms();
      setForms(data);
    } catch (error) {
      console.error('Error fetching forms:', error);
      toast({
        title: 'Error',
        description: 'Failed to load forms',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchLeads = async () => {
    try {
      setLoadingLeads(true);
      const { data, error } = await supabase
        .from('crm_opportunities')
        .select('id, name, stage, source, deal_value, created_at, notes')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLeads(data || []);
    } catch (error) {
      console.error('Error fetching leads:', error);
      toast({
        title: 'Error',
        description: 'Failed to load lead submissions',
        variant: 'destructive',
      });
    } finally {
      setLoadingLeads(false);
    }
  };

  const fetchPartners = async () => {
    try {
      setLoadingPartners(true);
      const { data, error } = await supabase
        .from('crm_affiliates')
        .select('id, name, category, status, poc_name, poc_email, poc_telegram, created_at, notes')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setPartners(data || []);
    } catch (error) {
      console.error('Error fetching partners:', error);
      toast({
        title: 'Error',
        description: 'Failed to load partner submissions',
        variant: 'destructive',
      });
    } finally {
      setLoadingPartners(false);
    }
  };

  const fetchLinks = async () => {
    try {
      setLoadingLinks(true);
      const { data, error } = await supabase
        .from('links')
        .select('id, name, url, client, link_types, status, created_at, description')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLinks(data || []);
    } catch (error) {
      console.error('Error fetching links:', error);
      toast({
        title: 'Error',
        description: 'Failed to load link submissions',
        variant: 'destructive',
      });
    } finally {
      setLoadingLinks(false);
    }
  };

  // Fetch data when tab changes
  useEffect(() => {
    if (activeTab === 'leads' && leads.length === 0) {
      fetchLeads();
    } else if (activeTab === 'partners' && partners.length === 0) {
      fetchPartners();
    } else if (activeTab === 'links' && links.length === 0) {
      fetchLinks();
    }
  }, [activeTab]);

  const handleCreateForm = async () => {
    if (!newFormName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a form name',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const form = await FormService.createForm({
        name: newFormName,
        description: newFormDescription,
        status: newFormStatus,
      });

      toast({
        title: 'Success',
        description: 'Form created successfully',
      });

      // Reset form and close dialog
      setNewFormName('');
      setNewFormDescription('');
      setNewFormStatus('draft');
      setIsCreateDialogOpen(false);

      // Refresh forms list
      await fetchForms();

      // Navigate to the new form (use slug if available)
      router.push(`/forms/${form.slug || form.id}`);
    } catch (error) {
      console.error('Error creating form:', error);
      toast({
        title: 'Error',
        description: 'Failed to create form',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteForm = async (formId: string, formName: string) => {
    if (!confirm(`Are you sure you want to archive "${formName}"? You can restore it later from the Archive page.`)) {
      return;
    }

    try {
      await FormService.archiveForm(formId);
      toast({
        title: 'Success',
        description: 'Form archived successfully. You can restore it from the Archive page.',
      });
      await fetchForms();
    } catch (error) {
      console.error('Error archiving form:', error);
      toast({
        title: 'Error',
        description: 'Failed to archive form',
        variant: 'destructive',
      });
    }
  };

  const handleCopyShareLink = (form: FormWithStats) => {
    const identifier = form.slug || form.id;
    const shareUrl = `${window.location.origin}/public/forms/${identifier}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedFormId(form.id);
    toast({
      title: 'Copied!',
      description: 'Share link copied to clipboard',
    });
    setTimeout(() => setCopiedFormId(null), 2000);
  };

  const handleOpenShareLink = (form: FormWithStats) => {
    const identifier = form.slug || form.id;
    const shareUrl = `${window.location.origin}/public/forms/${identifier}`;
    window.open(shareUrl, '_blank');
  };

  const handleShareForm = (form: FormWithStats) => {
    setSharingForm(form);
    setIsShareDialogOpen(true);
  };

  const handleOpenDuplicateDialog = (form: FormWithStats) => {
    setDuplicatingForm(form);
    setDuplicateFormName(`${form.name} (Copy)`);
    setIsDuplicateDialogOpen(true);
  };

  const handleDuplicateForm = async () => {
    if (!duplicatingForm || !duplicateFormName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a form name',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsDuplicating(true);

      // Create new form
      const newForm = await FormService.createForm({
        name: duplicateFormName,
        description: duplicatingForm.description || undefined,
        status: 'draft', // Always create duplicates as draft
      });

      // Get original form fields
      const originalFormWithFields = await FormService.getFormById(duplicatingForm.id);

      // Duplicate all fields
      if (originalFormWithFields?.fields) {
        for (const field of originalFormWithFields.fields) {
          await FormService.createField({
            form_id: newForm.id,
            field_type: field.field_type,
            label: field.label,
            required: field.required,
            options: field.options || undefined,
            allow_multiple: field.allow_multiple || undefined,
            include_other: field.include_other || undefined,
            allow_attachments: field.allow_attachments || undefined,
            is_yes_no_dropdown: field.is_yes_no_dropdown || undefined,
            require_yes_reason: field.require_yes_reason || undefined,
            require_no_reason: field.require_no_reason || undefined,
            display_order: field.display_order,
            page_number: field.page_number,
          });
        }
      }

      toast({
        title: 'Success',
        description: 'Form duplicated successfully',
      });

      // Reset and close dialog
      setDuplicateFormName('');
      setDuplicatingForm(null);
      setIsDuplicateDialogOpen(false);

      // Refresh forms list
      await fetchForms();

      // Navigate to the new form (use slug if available)
      router.push(`/forms/${newForm.slug || newForm.id}`);
    } catch (error) {
      console.error('Error duplicating form:', error);
      toast({
        title: 'Error',
        description: 'Failed to duplicate form',
        variant: 'destructive',
      });
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleViewResponses = async (form: FormWithStats) => {
    setViewingResponsesForm(form);
    setIsResponsesDialogOpen(true);
    setLoadingResponses(true);
    try {
      const formResponses = await FormService.getResponses(form.id);
      setResponses(formResponses);
    } catch (error) {
      console.error('Error fetching responses:', error);
      toast({
        title: 'Error',
        description: 'Failed to load responses',
        variant: 'destructive',
      });
    } finally {
      setLoadingResponses(false);
    }
  };

  const handleViewSingleResponse = async (response: FormResponse) => {
    if (!viewingResponsesForm) return;

    // Fetch form with fields if not already loaded
    if (!formWithFields || formWithFields.id !== viewingResponsesForm.id) {
      try {
        const form = await FormService.getFormById(viewingResponsesForm.id);
        setFormWithFields(form);
      } catch (error) {
        console.error('Error fetching form:', error);
        toast({
          title: 'Error',
          description: 'Failed to load form details',
          variant: 'destructive',
        });
        return;
      }
    }

    setSelectedResponse(response);
    setIsResponseDetailOpen(true);
  };

  const handleDeleteResponse = async (responseId: string) => {
    if (!confirm('Delete this response?')) return;

    try {
      await FormService.deleteResponse(responseId);
      toast({
        title: 'Success',
        description: 'Response deleted successfully',
      });
      // Refresh responses
      setResponses(prev => prev.filter(r => r.id !== responseId));
      // Update response count in forms list
      if (viewingResponsesForm) {
        setForms(prev => prev.map(f =>
          f.id === viewingResponsesForm.id
            ? { ...f, response_count: f.response_count - 1 }
            : f
        ));
      }
    } catch (error) {
      console.error('Error deleting response:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete response',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadResponsePDF = async (response: FormResponse) => {
    if (!viewingResponsesForm) return;

    // Fetch form with fields if not already loaded
    let form = formWithFields;
    if (!form || form.id !== viewingResponsesForm.id) {
      try {
        form = await FormService.getFormById(viewingResponsesForm.id);
        setFormWithFields(form);
      } catch (error) {
        console.error('Error fetching form:', error);
        toast({
          title: 'Error',
          description: 'Failed to load form details',
          variant: 'destructive',
        });
        return;
      }
    }

    if (!form) return;

    // Create a simple text-based PDF
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();

    let yPosition = 20;
    const lineHeight = 7;
    const pageHeight = 280;
    const margin = 20;

    // Title
    doc.setFontSize(16);
    doc.text(form.name, margin, yPosition);
    yPosition += lineHeight * 2;

    // Submission info
    doc.setFontSize(10);
    doc.text(`Submitted: ${new Date(response.submitted_at).toLocaleString()}`, margin, yPosition);
    yPosition += lineHeight;
    doc.text(`Name: ${response.submitted_by_name || '-'}`, margin, yPosition);
    yPosition += lineHeight;
    doc.text(`Email: ${response.submitted_by_email || '-'}`, margin, yPosition);
    yPosition += lineHeight * 2;

    // Fields
    doc.setFontSize(10);
    for (const field of form.fields.sort((a, b) => (a.page_number - b.page_number) || (a.display_order - b.display_order))) {
      const displayOnlyTypes = ['section', 'description', 'link'];
      if (displayOnlyTypes.includes(field.field_type)) continue;

      // Check if we need a new page
      if (yPosition > pageHeight) {
        doc.addPage();
        yPosition = 20;
      }

      // Field label (strip HTML)
      const label = field.label.replace(/<[^>]*>/g, '');
      doc.setFont('helvetica', 'bold');
      doc.text(label, margin, yPosition);
      yPosition += lineHeight;

      // Field value
      doc.setFont('helvetica', 'normal');
      const value = response.response_data[field.id];
      const displayValue = Array.isArray(value) ? value.join(', ') : (value || '-');

      // Word wrap long text
      const splitText = doc.splitTextToSize(String(displayValue), 170);
      for (const line of splitText) {
        if (yPosition > pageHeight) {
          doc.addPage();
          yPosition = 20;
        }
        doc.text(line, margin, yPosition);
        yPosition += lineHeight;
      }

      yPosition += lineHeight;
    }

    doc.save(`${form.name}-response-${new Date(response.submitted_at).toISOString().split('T')[0]}.pdf`);
  };

  // Filter forms
  const filteredForms = forms.filter(form => {
    const matchesSearch = form.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          form.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || form.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Forms & Submissions</h2>
            <p className="text-gray-600">
              Create forms and view external submissions
            </p>
          </div>
          {activeTab === 'forms' && (
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Form
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Form</DialogTitle>
                <DialogDescription>
                  Create a new form to collect information from clients or team members.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="form-name">Form Name *</Label>
                  <Input
                    id="form-name"
                    placeholder="e.g., KOL Application Form"
                    value={newFormName}
                    onChange={(e) => setNewFormName(e.target.value)}
                    className="auth-input"
                  />
                </div>
                <div>
                  <Label htmlFor="form-description">Description</Label>
                  <Textarea
                    id="form-description"
                    placeholder="What is this form for?"
                    value={newFormDescription}
                    onChange={(e) => setNewFormDescription(e.target.value)}
                    rows={3}
                    className="auth-input"
                  />
                </div>
                <div>
                  <Label htmlFor="form-status">Status</Label>
                  <Select value={newFormStatus} onValueChange={(value) => setNewFormStatus(value as FormStatus)}>
                    <SelectTrigger className="auth-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateForm}
                  disabled={isSubmitting}
                  className="hover:opacity-90"
                  style={{ backgroundColor: '#3e8692', color: 'white' }}
                >
                  {isSubmitting ? 'Creating...' : 'Create Form'}
                </Button>
              </DialogFooter>
            </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="forms" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Forms
            </TabsTrigger>
            <TabsTrigger value="leads" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Leads
            </TabsTrigger>
            <TabsTrigger value="partners" className="flex items-center gap-2">
              <Handshake className="h-4 w-4" />
              Partners
            </TabsTrigger>
            <TabsTrigger value="links" className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Links
            </TabsTrigger>
          </TabsList>

          {/* Forms Tab */}
          <TabsContent value="forms" className="space-y-6">
            {/* Search and Filters */}
            <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search forms..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 auth-input"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
            <SelectTrigger className="w-[150px] auth-input">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full mb-4" />
                  <div className="flex gap-2">
                    <Skeleton className="h-9 flex-1" />
                    <Skeleton className="h-9 w-9" />
                    <Skeleton className="h-9 w-9" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Forms Grid */}
        {!loading && filteredForms.length === 0 && (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchTerm || statusFilter !== 'all' ? 'No forms found' : 'No forms yet'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first form to start collecting data'}
            </p>
            {!searchTerm && statusFilter === 'all' && (
              <Button
                onClick={() => setIsCreateDialogOpen(true)}
                className="hover:opacity-90"
                style={{ backgroundColor: '#3e8692', color: 'white' }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Form
              </Button>
            )}
          </div>
        )}

        {!loading && filteredForms.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredForms.map((form) => (
              <Card key={form.id} className="transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg text-gray-900 mb-1">{form.name}</h3>
                      <Badge className={`${FormService.getStatusColor(form.status)} pointer-events-none`}>
                        {form.status.charAt(0).toUpperCase() + form.status.slice(1)}
                      </Badge>
                    </div>
                  </div>
                  {form.description && (
                    <p className="text-sm text-gray-600 line-clamp-2">{form.description}</p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Stats */}
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <button
                        onClick={() => handleViewResponses(form)}
                        className="flex items-center gap-1 hover:text-[#3e8692] transition-colors"
                        title="View responses"
                      >
                        <FileText className="h-4 w-4" />
                        <span>{form.response_count} responses</span>
                        <Eye className="h-3 w-3 ml-1" />
                      </button>
                      <div className="text-xs text-gray-500">
                        {new Date(form.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    {/* Subdomain Connection */}
                    {form.subdomain_enabled && form.subdomain_url && (
                      <div className="flex items-center gap-2 text-sm">
                        <Globe className="h-4 w-4 text-green-600" />
                        <span className="text-green-700 font-medium truncate max-w-[200px]" title={form.subdomain_url}>
                          {form.subdomain_url.replace(/^https?:\/\//, '')}
                        </span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => router.push(`/forms/${form.slug || form.id}`)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDuplicateDialog(form)}
                        title="Duplicate form"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteForm(form.id, form.name)}
                        title="Delete form"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                    {form.status === 'published' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => handleShareForm(form)}
                      >
                        <Share2 className="h-4 w-4 mr-2" />
                        Share Form
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
          </TabsContent>

          {/* Leads Tab */}
          <TabsContent value="leads" className="space-y-4">
            {loadingLeads ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : leads.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No lead submissions</h3>
                <p className="text-gray-600">Lead form submissions will appear here</p>
              </div>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Deal Value</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium">{lead.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{lead.stage}</Badge>
                        </TableCell>
                        <TableCell>{lead.source || '-'}</TableCell>
                        <TableCell>
                          {lead.deal_value ? `$${lead.deal_value.toLocaleString()}` : '-'}
                        </TableCell>
                        <TableCell>{new Date(lead.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push('/crm/pipeline')}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View in CRM
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Partners Tab */}
          <TabsContent value="partners" className="space-y-4">
            {loadingPartners ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : partners.length === 0 ? (
              <div className="text-center py-12">
                <Handshake className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No partner submissions</h3>
                <p className="text-gray-600">Partner application submissions will appear here</p>
              </div>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partners.map((partner) => (
                      <TableRow key={partner.id}>
                        <TableCell className="font-medium">{partner.name}</TableCell>
                        <TableCell>{partner.category || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{partner.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {partner.poc_name && <div>{partner.poc_name}</div>}
                            {partner.poc_email && <div className="text-gray-500">{partner.poc_email}</div>}
                          </div>
                        </TableCell>
                        <TableCell>{new Date(partner.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push('/crm/network')}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View in CRM
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Links Tab */}
          <TabsContent value="links" className="space-y-4">
            {loadingLinks ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : links.length === 0 ? (
              <div className="text-center py-12">
                <Link2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No link submissions</h3>
                <p className="text-gray-600">Link form submissions will appear here</p>
              </div>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {links.map((link) => (
                      <TableRow key={link.id}>
                        <TableCell className="font-medium">{link.name}</TableCell>
                        <TableCell>{link.client || '-'}</TableCell>
                        <TableCell>
                          {link.link_types?.map((type, i) => (
                            <Badge key={i} variant="outline" className="mr-1">
                              {type.charAt(0).toUpperCase() + type.slice(1)}
                            </Badge>
                          )) || '-'}
                        </TableCell>
                        <TableCell>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1 max-w-[200px] truncate"
                          >
                            {link.url}
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          </a>
                        </TableCell>
                        <TableCell>{new Date(link.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push('/links')}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View in Links
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Share Form Dialog */}
        <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Share Form</DialogTitle>
              <DialogDescription>
                Share this form link with clients or team members to collect responses.
              </DialogDescription>
            </DialogHeader>
            {sharingForm && (
              <div className="space-y-4">
                {/* Form Details */}
                <div className="border-l-4 border-[#3e8692] bg-gray-50 p-4 rounded">
                  <h4 className="font-semibold text-gray-900 mb-2">{sharingForm.name}</h4>
                  {sharingForm.description && (
                    <p className="text-sm text-gray-600 mb-3">{sharingForm.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <FileText className="h-4 w-4" />
                      <span>{sharingForm.response_count} responses</span>
                    </div>
                    <Badge className={`${FormService.getStatusColor(sharingForm.status)} pointer-events-none`}>
                      {sharingForm.status.charAt(0).toUpperCase() + sharingForm.status.slice(1)}
                    </Badge>
                  </div>
                </div>

                {/* Share Link */}
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">
                    Share Link
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={`${window.location.origin}/public/forms/${sharingForm.slug || sharingForm.id}`}
                      readOnly
                      className="auth-input flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleCopyShareLink(sharingForm)}
                      title="Copy link"
                    >
                      {copiedFormId === sharingForm.id ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleOpenShareLink(sharingForm)}
                      title="Open in new tab"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Anyone with this link can submit a response to this form.
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsShareDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Duplicate Form Dialog */}
        <Dialog open={isDuplicateDialogOpen} onOpenChange={setIsDuplicateDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Duplicate Form</DialogTitle>
              <DialogDescription>
                Create a copy of this form with all fields. Responses will not be copied.
              </DialogDescription>
            </DialogHeader>
            {duplicatingForm && (
              <div className="space-y-4">
                {/* Original Form Info */}
                <div className="border-l-4 border-[#3e8692] bg-gray-50 p-4 rounded">
                  <p className="text-sm text-gray-600 mb-1">Duplicating from:</p>
                  <h4 className="font-semibold text-gray-900">{duplicatingForm.name}</h4>
                </div>

                {/* New Form Name */}
                <div>
                  <Label htmlFor="duplicate-name">New Form Name</Label>
                  <Input
                    id="duplicate-name"
                    value={duplicateFormName}
                    onChange={(e) => setDuplicateFormName(e.target.value)}
                    placeholder="Enter name for duplicated form"
                    className="auth-input"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsDuplicateDialogOpen(false);
                  setDuplicateFormName('');
                  setDuplicatingForm(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDuplicateForm}
                disabled={isDuplicating || !duplicateFormName.trim()}
                className="hover:opacity-90"
                style={{ backgroundColor: '#3e8692', color: 'white' }}
              >
                {isDuplicating ? 'Duplicating...' : 'Duplicate Form'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Responses Dialog */}
        <Dialog open={isResponsesDialogOpen} onOpenChange={setIsResponsesDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Responses</DialogTitle>
              <DialogDescription>
                {viewingResponsesForm?.name} - {responses.length} responses
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-auto">
              {loadingResponses ? (
                <div className="space-y-2 p-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : responses.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No responses yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {responses.map((response) => (
                      <TableRow key={response.id}>
                        <TableCell>
                          {new Date(response.submitted_at).toLocaleString()}
                        </TableCell>
                        <TableCell>{response.submitted_by_name || '-'}</TableCell>
                        <TableCell>{response.submitted_by_email || '-'}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewSingleResponse(response)}
                              title="View response"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadResponsePDF(response)}
                              title="Download PDF"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteResponse(response.id)}
                              title="Delete response"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => router.push(`/forms/${viewingResponsesForm?.slug || viewingResponsesForm?.id}?tab=responses`)}
              >
                View Full Details
              </Button>
              <Button variant="outline" onClick={() => setIsResponsesDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Response Detail Dialog */}
        <Dialog open={isResponseDetailOpen} onOpenChange={setIsResponseDetailOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">Response Details</DialogTitle>
            </DialogHeader>
            {selectedResponse && formWithFields && (
              <div className="space-y-6">
                {/* Submission Info */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs font-semibold text-gray-600 uppercase">Submitted</Label>
                      <p className="text-sm font-medium text-gray-900 mt-1">
                        {new Date(selectedResponse.submitted_at).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-gray-600 uppercase">Name</Label>
                      <p className="text-sm font-medium text-gray-900 mt-1">
                        {selectedResponse.submitted_by_name || '-'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-gray-600 uppercase">Email</Label>
                      <p className="text-sm font-medium text-gray-900 mt-1">
                        {selectedResponse.submitted_by_email || '-'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Form Fields */}
                <div className="space-y-4">
                  {formWithFields.fields
                    .sort((a, b) => (a.page_number - b.page_number) || (a.display_order - b.display_order))
                    .map((field) => {
                      const value = selectedResponse.response_data[field.id];
                      const reasonKey = `${field.id}_reason`;
                      const reason = selectedResponse.response_data[reasonKey];
                      const attachmentsKey = `${field.id}_attachments`;
                      const attachments = selectedResponse.response_data[attachmentsKey];

                      // Skip display-only fields that don't collect responses
                      const displayOnlyTypes = ['section', 'description', 'link'];
                      const isDisplayOnly = displayOnlyTypes.includes(field.field_type);

                      return (
                        <div key={field.id} className="bg-white p-4 rounded-lg border border-gray-200">
                          <div className="mb-3 flex items-start gap-1">
                            <div
                              className="text-sm text-gray-900 flex-1"
                              dangerouslySetInnerHTML={{ __html: field.label }}
                            />
                            {field.required && !isDisplayOnly && <span className="text-red-500">*</span>}
                          </div>

                          {/* Value Display - Only show for actual input fields */}
                          {!isDisplayOnly && (
                            <div className="text-sm text-gray-900 mt-2">
                              {/* Show the main field value */}
                              {field.field_type === 'yes_no' ? (
                                <div>
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                    value === 'Yes'
                                      ? 'bg-green-100 text-green-800'
                                      : value === 'No'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {value || '-'}
                                  </span>
                                  {reason && (
                                    <div className="mt-2 pl-4 border-l-2 border-gray-300">
                                      <Label className="text-xs text-gray-600">Reason:</Label>
                                      <p className="text-sm text-gray-900 mt-1">{reason}</p>
                                    </div>
                                  )}
                                </div>
                              ) : Array.isArray(value) ? (
                                <div className="space-y-1">
                                  {value.length > 0 ? (
                                    value.map((item: string, idx: number) => (
                                      <div key={idx} className="flex gap-2">
                                        <span className="font-medium text-gray-700">{idx + 1}.</span>
                                        <span className="text-gray-900">{item}</span>
                                      </div>
                                    ))
                                  ) : (
                                    <span className="text-gray-400 italic">No selection</span>
                                  )}
                                </div>
                              ) : field.field_type === 'long_text' || field.field_type === 'textarea' ? (
                                <p className="whitespace-pre-wrap bg-gray-50 p-3 rounded border border-gray-200">
                                  {value || <span className="text-gray-400 italic">No response</span>}
                                </p>
                              ) : (
                                <p className="font-medium">
                                  {value || <span className="text-gray-400 italic">No response</span>}
                                </p>
                              )}

                              {/* Display attachments if any exist for this field */}
                              {attachments && Array.isArray(attachments) && attachments.length > 0 && (
                                <div className="mt-3 space-y-2">
                                  <p className="text-xs font-medium text-gray-500 uppercase">Attachments:</p>
                                  {attachments.map((url: string, idx: number) => (
                                    <div key={idx} className="flex items-center gap-2">
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 text-blue-600 hover:text-blue-800 underline text-sm"
                                      >
                                        <Upload className="h-4 w-4" />
                                        Attachment {idx + 1}
                                      </a>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={async () => {
                                          try {
                                            const response = await fetch(url);
                                            const blob = await response.blob();
                                            const downloadUrl = window.URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = downloadUrl;
                                            a.download = `attachment-${idx + 1}`;
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                            window.URL.revokeObjectURL(downloadUrl);
                                          } catch (error) {
                                            console.error('Error downloading file:', error);
                                          }
                                        }}
                                        className="h-7 px-2"
                                      >
                                        <Download className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsResponseDetailOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );
}
