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
import { Plus, Search, Edit, Trash2, Share2, FileText, Copy, CheckCircle2, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FormService, FormWithStats, FormStatus } from '@/lib/formService';
import { useRouter } from 'next/navigation';

export default function FormsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [forms, setForms] = useState<FormWithStats[]>([]);
  const [loading, setLoading] = useState(true);
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

      // Navigate to the new form
      router.push(`/forms/${form.id}`);
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
    if (!confirm(`Are you sure you want to delete "${formName}"? This will also delete all responses.`)) {
      return;
    }

    try {
      await FormService.deleteForm(formId);
      toast({
        title: 'Success',
        description: 'Form deleted successfully',
      });
      await fetchForms();
    } catch (error) {
      console.error('Error deleting form:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete form',
        variant: 'destructive',
      });
    }
  };

  const handleCopyShareLink = (formId: string) => {
    const shareUrl = `${window.location.origin}/public/forms/${formId}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedFormId(formId);
    toast({
      title: 'Copied!',
      description: 'Share link copied to clipboard',
    });
    setTimeout(() => setCopiedFormId(null), 2000);
  };

  const handleOpenShareLink = (formId: string) => {
    const shareUrl = `${window.location.origin}/public/forms/${formId}`;
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

      // Navigate to the new form
      router.push(`/forms/${newForm.id}`);
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
            <h2 className="text-2xl font-bold text-gray-900">Forms</h2>
            <p className="text-gray-600">
              Create and manage custom forms for data collection
            </p>
          </div>
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
        </div>

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
                      <div className="flex items-center gap-1">
                        <FileText className="h-4 w-4" />
                        <span>{form.response_count} responses</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(form.created_at).toLocaleDateString()}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => router.push(`/forms/${form.id}`)}
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
                      value={`${window.location.origin}/public/forms/${sharingForm.id}`}
                      readOnly
                      className="auth-input flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleCopyShareLink(sharingForm.id)}
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
                      onClick={() => handleOpenShareLink(sharingForm.id)}
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
      </div>
  );
}
