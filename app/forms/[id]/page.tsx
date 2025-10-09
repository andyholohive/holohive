'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Plus, Edit, Trash2, Save, Share2, Copy, CheckCircle2, GripVertical, FileText, Download, Eye, ExternalLink, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FormService, FormWithFields, FormField, FieldType, FormStatus, FormResponse } from '@/lib/formService';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Field Item Component
interface SortableFieldItemProps {
  field: FormField;
  expandedFieldId: string | null;
  setExpandedFieldId: (id: string | null) => void;
  handleOpenFieldDialog: (field: FormField) => void;
  handleDeleteField: (id: string, label: string) => void;
}

function SortableFieldItem({ field, expandedFieldId, setExpandedFieldId, handleOpenFieldDialog, handleDeleteField }: SortableFieldItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="border rounded-lg overflow-hidden">
      {/* Field Header */}
      <div
        className="flex items-center gap-3 p-4 bg-white hover:bg-gray-50"
      >
        <div {...attributes} {...listeners} className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing">
          <GripVertical className="h-5 w-5" />
        </div>
        <div className="text-2xl">{FormService.getFieldTypeIcon(field.field_type)}</div>
        <div
          className="flex-1 cursor-pointer"
          onClick={() => setExpandedFieldId(expandedFieldId === field.id ? null : field.id)}
        >
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900">{field.label}</p>
            {field.required && (
              <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                Required
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-500">{FormService.getFieldTypeLabel(field.field_type)}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenFieldDialog(field);
            }}
            className="hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteField(field.id, field.label);
            }}
            className="hover:bg-red-50 hover:text-red-700 hover:border-red-300"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Expanded Field Details & Preview */}
      {expandedFieldId === field.id && (
        <div className="p-4 bg-gray-50 border-t">
          <div className="grid grid-cols-2 gap-6">
            {/* Field Configuration */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3 text-sm">Field Configuration</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Type:</span>
                  <span className="text-gray-900">{FormService.getFieldTypeLabel(field.field_type)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Required:</span>
                  <span className="text-gray-900">{field.required ? 'Yes' : 'No'}</span>
                </div>
                {field.options && field.options.length > 0 && (
                  <div>
                    <span className="text-gray-600">Options:</span>
                    <ul className="mt-1 ml-4 list-disc text-gray-900">
                      {field.options.map((option, idx) => (
                        <li key={idx}>{option}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Field Preview */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3 text-sm">Preview</h4>
              <div className="space-y-2">
                <Label className="text-sm">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                {field.field_type === 'text' && (
                  <Input placeholder="Enter text..." disabled className="auth-input bg-white" />
                )}
                {field.field_type === 'textarea' && (
                  <Textarea placeholder="Enter text..." rows={3} disabled className="auth-input bg-white" />
                )}
                {field.field_type === 'email' && (
                  <Input type="email" placeholder="email@example.com" disabled className="auth-input bg-white" />
                )}
                {field.field_type === 'number' && (
                  <Input type="number" placeholder="Enter number..." disabled className="auth-input bg-white" />
                )}
                {field.field_type === 'date' && (
                  <Input type="date" disabled className="auth-input bg-white" />
                )}
                {field.field_type === 'select' && (
                  <Select disabled>
                    <SelectTrigger className="auth-input bg-white">
                      <SelectValue placeholder="Select an option..." />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map((option, idx) => (
                        <SelectItem key={idx} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {field.field_type === 'radio' && (
                  <div className="space-y-2">
                    {field.options?.map((option, idx) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <input type="radio" disabled className="h-4 w-4" />
                        <Label className="text-sm font-normal">{option}</Label>
                      </div>
                    ))}
                  </div>
                )}
                {field.field_type === 'checkbox' && (
                  <div className="space-y-2">
                    {field.options?.map((option, idx) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <Checkbox disabled />
                        <Label className="text-sm font-normal">{option}</Label>
                      </div>
                    ))}
                  </div>
                )}
                {field.field_type === 'section' && (
                  <div className="border-b-2 border-gray-300 pb-2">
                    <h3 className="text-xl font-semibold text-gray-900">{field.label}</h3>
                  </div>
                )}
                {field.field_type === 'description' && (
                  <div>
                    <p className="text-sm text-gray-600">{field.label}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sortable Page Tab Component
interface SortablePageTabProps {
  pageNum: number;
  currentPage: number;
  fieldsCount: number;
  totalPages: number;
  onPageClick: (pageNum: number) => void;
  onDeletePage: (pageNum: number) => void;
}

function SortablePageTab({ pageNum, currentPage, fieldsCount, totalPages, onPageClick, onDeletePage }: SortablePageTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `page-${pageNum}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative flex items-center">
      <div className="flex items-center border rounded-md overflow-hidden">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing px-1 py-2 bg-gray-50 hover:bg-gray-100 border-r"
        >
          <GripVertical className="h-4 w-4 text-gray-400" />
        </div>
        <Button
          variant={currentPage === pageNum ? 'default' : 'outline'}
          size="sm"
          onClick={() => onPageClick(pageNum)}
          className={`rounded-none border-0 ${currentPage === pageNum ? 'hover:opacity-90' : ''}`}
          style={currentPage === pageNum ? { backgroundColor: '#3e8692', color: 'white' } : {}}
        >
          Page {pageNum}
          <span className="ml-2 text-xs opacity-75">({fieldsCount})</span>
        </Button>
      </div>
      {totalPages > 1 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDeletePage(pageNum);
          }}
          className="h-5 w-5 p-0 absolute -top-2 -right-2 bg-white border border-gray-200 rounded-full hover:bg-red-50 hover:border-red-300"
        >
          <X className="h-3 w-3 text-red-600" />
        </Button>
      )}
    </div>
  );
}

export default function FormBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const formId = params.id as string;

  const [form, setForm] = useState<FormWithFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('build');
  const [copiedLink, setCopiedLink] = useState(false);

  // Build tab state
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedStatus, setEditedStatus] = useState<FormStatus>('draft');
  const [isSavingInfo, setIsSavingInfo] = useState(false);

  // Field editor state
  const [isFieldDialogOpen, setIsFieldDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [fieldForm, setFieldForm] = useState({
    field_type: 'text' as FieldType,
    label: '',
    required: false,
    options: [] as string[],
    page_number: 1,
  });
  const [optionInput, setOptionInput] = useState('');
  const [isSavingField, setIsSavingField] = useState(false);
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);

  // Preview state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Responses tab state
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<FormResponse | null>(null);
  const [isResponseDialogOpen, setIsResponseDialogOpen] = useState(false);

  // Page management state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageOrder, setPageOrder] = useState<number[]>([]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchForm();
  }, [formId]);

  useEffect(() => {
    if (activeTab === 'responses') {
      fetchResponses();
    }
  }, [activeTab]);

  const fetchForm = async () => {
    try {
      setLoading(true);
      const data = await FormService.getFormById(formId);
      if (!data) {
        toast({
          title: 'Error',
          description: 'Form not found',
          variant: 'destructive',
        });
        router.push('/forms');
        return;
      }
      setForm(data);
      setEditedName(data.name);
      setEditedDescription(data.description || '');
      setEditedStatus(data.status);

      // Calculate total pages
      const maxPage = data.fields.reduce((max, field) => Math.max(max, field.page_number), 1);
      setTotalPages(maxPage);

      // Initialize page order if not set
      if (pageOrder.length !== maxPage) {
        setPageOrder(Array.from({ length: maxPage }, (_, i) => i + 1));
      }

      // Reset to first page if current page is beyond total
      if (currentPage > maxPage) {
        setCurrentPage(1);
      }
    } catch (error) {
      console.error('Error fetching form:', error);
      toast({
        title: 'Error',
        description: 'Failed to load form',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchResponses = async () => {
    try {
      setLoadingResponses(true);
      const data = await FormService.getResponses(formId);
      setResponses(data);
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

  const handleSaveInfo = async () => {
    if (!editedName.trim()) {
      toast({
        title: 'Error',
        description: 'Form name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSavingInfo(true);
      await FormService.updateForm({
        id: formId,
        name: editedName,
        description: editedDescription,
        status: editedStatus,
      });
      toast({
        title: 'Success',
        description: 'Form updated successfully',
      });
      setIsEditingInfo(false);
      await fetchForm();
    } catch (error) {
      console.error('Error updating form:', error);
      toast({
        title: 'Error',
        description: 'Failed to update form',
        variant: 'destructive',
      });
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handleOpenFieldDialog = (field?: FormField) => {
    if (field) {
      setEditingField(field);
      setFieldForm({
        field_type: field.field_type,
        label: field.label,
        required: field.required,
        options: field.options || [],
        page_number: field.page_number,
      });
    } else {
      setEditingField(null);
      setFieldForm({
        field_type: 'text',
        label: '',
        required: false,
        options: [],
        page_number: currentPage,
      });
    }
    setIsFieldDialogOpen(true);
  };

  const handleSaveField = async () => {
    if (!fieldForm.label.trim()) {
      toast({
        title: 'Error',
        description: 'Field label is required',
        variant: 'destructive',
      });
      return;
    }

    // Validate options for select/radio/checkbox
    if (['select', 'radio', 'checkbox'].includes(fieldForm.field_type) && fieldForm.options.length === 0) {
      toast({
        title: 'Error',
        description: 'Please add at least one option',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSavingField(true);
      if (editingField) {
        await FormService.updateField({
          id: editingField.id,
          ...fieldForm,
        });
      } else {
        await FormService.createField({
          form_id: formId,
          ...fieldForm,
        });
      }
      toast({
        title: 'Success',
        description: `Field ${editingField ? 'updated' : 'created'} successfully`,
      });
      setIsFieldDialogOpen(false);
      await fetchForm();
    } catch (error) {
      console.error('Error saving field:', error);
      toast({
        title: 'Error',
        description: 'Failed to save field',
        variant: 'destructive',
      });
    } finally {
      setIsSavingField(false);
    }
  };

  const handleDeleteField = async (fieldId: string, fieldLabel: string) => {
    if (!confirm(`Delete field "${fieldLabel}"?`)) return;

    try {
      await FormService.deleteField(fieldId);
      toast({
        title: 'Success',
        description: 'Field deleted successfully',
      });
      await fetchForm();
    } catch (error) {
      console.error('Error deleting field:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete field',
        variant: 'destructive',
      });
    }
  };

  const handleCopyShareLink = () => {
    const shareUrl = `${window.location.origin}/public/forms/${formId}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    toast({
      title: 'Copied!',
      description: 'Share link copied to clipboard',
    });
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleOpenShareLink = () => {
    const shareUrl = `${window.location.origin}/public/forms/${formId}`;
    window.open(shareUrl, '_blank');
  };

  const handleExportCSV = async () => {
    try {
      const csv = await FormService.exportResponsesToCSV(formId);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form?.name || 'form'}_responses.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast({
        title: 'Success',
        description: 'Responses exported successfully',
      });
    } catch (error) {
      console.error('Error exporting responses:', error);
      toast({
        title: 'Error',
        description: 'Failed to export responses',
        variant: 'destructive',
      });
    }
  };

  const handleViewResponse = (response: FormResponse) => {
    setSelectedResponse(response);
    setIsResponseDialogOpen(true);
  };

  const handleDeleteResponse = async (responseId: string) => {
    if (!confirm('Delete this response?')) return;

    try {
      await FormService.deleteResponse(responseId);
      toast({
        title: 'Success',
        description: 'Response deleted successfully',
      });
      await fetchResponses();
    } catch (error) {
      console.error('Error deleting response:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete response',
        variant: 'destructive',
      });
    }
  };

  const addOption = () => {
    if (optionInput.trim()) {
      setFieldForm(prev => ({
        ...prev,
        options: [...prev.options, optionInput.trim()]
      }));
      setOptionInput('');
    }
  };

  const removeOption = (index: number) => {
    setFieldForm(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !form) return;

    if (active.id !== over.id) {
      const fieldsOnCurrentPage = form.fields.filter(f => f.page_number === currentPage);
      const fieldsOnOtherPages = form.fields.filter(f => f.page_number !== currentPage);

      const oldIndex = fieldsOnCurrentPage.findIndex(f => f.id === active.id);
      const newIndex = fieldsOnCurrentPage.findIndex(f => f.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      const reorderedFields = arrayMove(fieldsOnCurrentPage, oldIndex, newIndex);

      // Update display orders in the reordered fields
      const updatedFieldsOnCurrentPage = reorderedFields.map((field, index) => ({
        ...field,
        display_order: index
      }));

      // Optimistically update local state immediately
      setForm({
        ...form,
        fields: [...fieldsOnOtherPages, ...updatedFieldsOnCurrentPage].sort((a, b) => {
          if (a.page_number !== b.page_number) return a.page_number - b.page_number;
          return a.display_order - b.display_order;
        })
      });

      // Save to database in background
      const updates = updatedFieldsOnCurrentPage.map((field, index) => ({
        id: field.id,
        display_order: index,
        page_number: currentPage
      }));

      try {
        await FormService.updateFieldPositions(updates);
      } catch (error) {
        console.error('Error reordering fields:', error);
        toast({
          title: 'Error',
          description: 'Failed to save field order',
          variant: 'destructive',
        });
        // Revert by fetching from server
        await fetchForm();
      }
    }
  };

  const handlePageDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !form) return;

    const activeId = String(active.id).replace('page-', '');
    const overId = String(over.id).replace('page-', '');

    if (activeId !== overId) {
      const oldIndex = pageOrder.findIndex(p => p === parseInt(activeId));
      const newIndex = pageOrder.findIndex(p => p === parseInt(overId));

      if (oldIndex === -1 || newIndex === -1) return;

      // Reorder pages
      const reorderedPages = arrayMove(pageOrder, oldIndex, newIndex);

      // Create mapping: old page number -> new page number (position)
      const pageMapping: Record<number, number> = {};
      reorderedPages.forEach((oldPageNum, newPosition) => {
        pageMapping[oldPageNum] = newPosition + 1;
      });

      // Update current page to maintain the view
      const newCurrentPage = pageMapping[currentPage];
      setCurrentPage(newCurrentPage);

      // Update form fields with new page numbers optimistically
      const updatedFormFields = form.fields.map(field => ({
        ...field,
        page_number: pageMapping[field.page_number]
      }));

      setForm({
        ...form,
        fields: updatedFormFields
      });

      // Update page order to be sequential [1, 2, 3, ...]
      setPageOrder(Array.from({ length: totalPages }, (_, i) => i + 1));

      // Update all fields with new page numbers in database
      const updatedFields = form.fields.map(field => ({
        id: field.id,
        display_order: field.display_order,
        page_number: pageMapping[field.page_number]
      }));

      try {
        await FormService.updateFieldPositions(updatedFields);
      } catch (error) {
        console.error('Error reordering pages:', error);
        toast({
          title: 'Error',
          description: 'Failed to reorder pages',
          variant: 'destructive',
        });
        // Revert by fetching from server
        await fetchForm();
      }
    }
  };

  const handleAddPage = () => {
    const newPageNum = totalPages + 1;
    setTotalPages(newPageNum);
    setPageOrder(prev => [...prev, newPageNum]);
    setCurrentPage(newPageNum);
  };

  const handleDeletePage = async (pageNumber: number) => {
    if (totalPages === 1) {
      toast({
        title: 'Error',
        description: 'Cannot delete the only page',
        variant: 'destructive',
      });
      return;
    }

    if (!form) return;

    const fieldsOnPage = form.fields.filter(f => f.page_number === pageNumber);

    if (fieldsOnPage.length > 0) {
      if (!confirm(`Page ${pageNumber} has ${fieldsOnPage.length} field(s). Are you sure you want to delete it? Fields will be deleted.`)) {
        return;
      }

      try {
        // Delete all fields on this page
        await Promise.all(fieldsOnPage.map(f => FormService.deleteField(f.id)));

        // Update page numbers for fields after this page
        const fieldsToUpdate = form.fields
          .filter(f => f.page_number > pageNumber)
          .map(f => ({
            id: f.id,
            display_order: f.display_order,
            page_number: f.page_number - 1
          }));

        if (fieldsToUpdate.length > 0) {
          await FormService.updateFieldPositions(fieldsToUpdate);
        }

        setTotalPages(prev => prev - 1);
        setPageOrder(prev => prev.filter(p => p !== pageNumber).map(p => p > pageNumber ? p - 1 : p));
        if (currentPage >= pageNumber && currentPage > 1) {
          setCurrentPage(prev => prev - 1);
        }

        await fetchForm();

        toast({
          title: 'Success',
          description: 'Page deleted successfully',
        });
      } catch (error) {
        console.error('Error deleting page:', error);
        toast({
          title: 'Error',
          description: 'Failed to delete page',
          variant: 'destructive',
        });
      }
    } else {
      // Empty page, just remove it
      const fieldsToUpdate = form.fields
        .filter(f => f.page_number > pageNumber)
        .map(f => ({
          id: f.id,
          display_order: f.display_order,
          page_number: f.page_number - 1
        }));

      try {
        if (fieldsToUpdate.length > 0) {
          await FormService.updateFieldPositions(fieldsToUpdate);
        }

        setTotalPages(prev => prev - 1);
        setPageOrder(prev => prev.filter(p => p !== pageNumber).map(p => p > pageNumber ? p - 1 : p));
        if (currentPage >= pageNumber && currentPage > 1) {
          setCurrentPage(prev => prev - 1);
        }

        await fetchForm();

        toast({
          title: 'Success',
          description: 'Page deleted successfully',
        });
      } catch (error) {
        console.error('Error deleting page:', error);
        toast({
          title: 'Error',
          description: 'Failed to delete page',
          variant: 'destructive',
        });
      }
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!form) return null;

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/forms')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{form.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge className={`${FormService.getStatusColor(form.status)} pointer-events-none`}>
                  {form.status.charAt(0).toUpperCase() + form.status.slice(1)}
                </Badge>
                <span className="text-sm text-gray-500">
                  Created {new Date(form.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
          {form.status === 'published' && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCopyShareLink} className="hover:opacity-90">
                {copiedLink ? <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" /> : <Copy className="h-4 w-4 mr-2" />}
                Copy Link
              </Button>
              <Button variant="outline" onClick={handleOpenShareLink} className="hover:opacity-90">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open
              </Button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="build">Build</TabsTrigger>
            <TabsTrigger value="responses">
              Responses ({responses.length})
            </TabsTrigger>
          </TabsList>

          {/* Build Tab */}
          <TabsContent value="build" className="space-y-6">
            {/* Form Info Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Form Information</CardTitle>
                  {!isEditingInfo ? (
                    <Button variant="outline" size="sm" onClick={() => setIsEditingInfo(true)} className="hover:opacity-90">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setIsEditingInfo(false)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSaveInfo} disabled={isSavingInfo} className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditingInfo ? (
                  <>
                    <div>
                      <Label>Form Name</Label>
                      <Input value={editedName} onChange={(e) => setEditedName(e.target.value)} className="auth-input" />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea value={editedDescription} onChange={(e) => setEditedDescription(e.target.value)} rows={3} className="auth-input" />
                    </div>
                    <div>
                      <Label>Status</Label>
                      <Select value={editedStatus} onValueChange={(value) => setEditedStatus(value as FormStatus)}>
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
                  </>
                ) : (
                  <>
                    <div>
                      <Label className="text-gray-600">Name</Label>
                      <p className="text-gray-900">{form.name}</p>
                    </div>
                    {form.description && (
                      <div>
                        <Label className="text-gray-600">Description</Label>
                        <p className="text-gray-900">{form.description}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-gray-600">Status</Label>
                      <div>
                        <Badge className={`${FormService.getStatusColor(form.status)} pointer-events-none`}>
                          {form.status.charAt(0).toUpperCase() + form.status.slice(1)}
                        </Badge>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Fields Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <CardTitle>Form Fields ({form.fields.length} total)</CardTitle>
                  <div className="flex gap-2">
                    <Button onClick={handleAddPage} variant="outline" className="hover:opacity-90">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Page
                    </Button>
                    <Button onClick={() => handleOpenFieldDialog()} className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Field
                    </Button>
                  </div>
                </div>

                {/* Page Navigation */}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handlePageDragEnd}
                >
                  <SortableContext
                    items={pageOrder.map(p => `page-${p}`)}
                    strategy={horizontalListSortingStrategy}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      {pageOrder.map((pageNum) => {
                        const fieldsOnPage = form.fields.filter(f => f.page_number === pageNum).length;
                        return (
                          <SortablePageTab
                            key={pageNum}
                            pageNum={pageNum}
                            currentPage={currentPage}
                            fieldsCount={fieldsOnPage}
                            totalPages={totalPages}
                            onPageClick={setCurrentPage}
                            onDeletePage={handleDeletePage}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </CardHeader>
              <CardContent>
                {(() => {
                  const fieldsOnCurrentPage = form.fields.filter(f => f.page_number === currentPage);

                  if (fieldsOnCurrentPage.length === 0) {
                    return (
                      <div className="text-center py-12">
                        <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600">No fields on this page yet.</p>
                        <Button onClick={() => handleOpenFieldDialog()} variant="outline" className="mt-4">
                          <Plus className="h-4 w-4 mr-2" />
                          Add First Field
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={fieldsOnCurrentPage.map(f => f.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-3">
                          {fieldsOnCurrentPage.map((field) => (
                            <SortableFieldItem
                              key={field.id}
                              field={field}
                              expandedFieldId={expandedFieldId}
                              setExpandedFieldId={setExpandedFieldId}
                              handleOpenFieldDialog={handleOpenFieldDialog}
                              handleDeleteField={handleDeleteField}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Responses Tab */}
          <TabsContent value="responses" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Responses ({responses.length})</CardTitle>
                  {responses.length > 0 && (
                    <Button onClick={handleExportCSV} variant="outline" className="hover:opacity-90">
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loadingResponses ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
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
                              <Button variant="outline" size="sm" onClick={() => handleViewResponse(response)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleDeleteResponse(response.id)}>
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Field Editor Dialog */}
        <Dialog open={isFieldDialogOpen} onOpenChange={setIsFieldDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingField ? 'Edit Field' : 'Add Field'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Field Type</Label>
                <Select value={fieldForm.field_type} onValueChange={(value) => setFieldForm(prev => ({ ...prev, field_type: value as FieldType }))}>
                  <SelectTrigger className="auth-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="section">Section Header</SelectItem>
                    <SelectItem value="description">Description Text</SelectItem>
                    <SelectItem value="text">Short Text</SelectItem>
                    <SelectItem value="textarea">Long Text</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="select">Dropdown</SelectItem>
                    <SelectItem value="radio">Multiple Choice</SelectItem>
                    <SelectItem value="checkbox">Checkboxes</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Label</Label>
                <Input value={fieldForm.label} onChange={(e) => setFieldForm(prev => ({ ...prev, label: e.target.value }))} placeholder="e.g., Full Name" className="auth-input" />
              </div>
              <div>
                <Label>Page</Label>
                <Select value={String(fieldForm.page_number)} onValueChange={(value) => setFieldForm(prev => ({ ...prev, page_number: parseInt(value) }))}>
                  <SelectTrigger className="auth-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                      <SelectItem key={pageNum} value={String(pageNum)}>
                        Page {pageNum}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!['section', 'description'].includes(fieldForm.field_type) && (
                <div className="flex items-center gap-2">
                  <Checkbox checked={fieldForm.required} onCheckedChange={(checked) => setFieldForm(prev => ({ ...prev, required: checked as boolean }))} />
                  <Label>Required field</Label>
                </div>
              )}
              {['select', 'radio', 'checkbox'].includes(fieldForm.field_type) && (
                <div>
                  <Label>Options</Label>
                  <div className="flex gap-2 mb-2">
                    <Input value={optionInput} onChange={(e) => setOptionInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addOption())} placeholder="Add option" className="auth-input" />
                    <Button type="button" onClick={addOption} size="sm" className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }}>Add</Button>
                  </div>
                  <div className="space-y-1">
                    {fieldForm.options.map((option, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 border rounded">
                        <span className="flex-1">{option}</span>
                        <Button variant="ghost" size="sm" onClick={() => removeOption(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsFieldDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveField} disabled={isSavingField} className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                {isSavingField ? 'Saving...' : 'Save Field'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Response Viewer Dialog */}
        <Dialog open={isResponseDialogOpen} onOpenChange={setIsResponseDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Response Details</DialogTitle>
            </DialogHeader>
            {selectedResponse && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 pb-4 border-b">
                  <div>
                    <Label className="text-gray-600">Submitted</Label>
                    <p>{new Date(selectedResponse.submitted_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Name</Label>
                    <p>{selectedResponse.submitted_by_name || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Email</Label>
                    <p>{selectedResponse.submitted_by_email || '-'}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {form?.fields.map((field) => (
                    <div key={field.id}>
                      <Label className="text-gray-600">{field.label}</Label>
                      <p className="text-gray-900">
                        {Array.isArray(selectedResponse.response_data[field.id])
                          ? selectedResponse.response_data[field.id].join(', ')
                          : selectedResponse.response_data[field.id] || '-'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
  );
}
