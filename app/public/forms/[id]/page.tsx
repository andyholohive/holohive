'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FormService, FormWithFields, FieldType } from '@/lib/formService';
import { CheckCircle2, FileText, Loader, Calendar as CalendarIcon } from 'lucide-react';

// Create a standalone Supabase client for public access
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabasePublic = createClient(supabaseUrl, supabaseAnonKey);

export default function PublicFormPage({ params }: { params: { id: string } }) {
  const formId = params.id;
  const [form, setForm] = useState<FormWithFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form data
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Page navigation
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Date formatting helpers
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString();
  };

  const formatDateForInput = (date: Date | undefined) => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const parseDateFromInput = (dateString: string) => {
    if (!dateString) return undefined;
    const [year, month, day] = dateString.split("-");
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  };

  useEffect(() => {
    fetchForm();
  }, [formId]);

  const fetchForm = async () => {
    try {
      setLoading(true);
      const data = await FormService.getPublicForm(formId, supabasePublic);

      if (!data) {
        setError('Form not found or not published');
        return;
      }

      if (data.status === 'closed') {
        setError('This form is no longer accepting responses');
        return;
      }

      setForm(data);

      // Calculate total pages
      const maxPage = data.fields.reduce((max, field) => Math.max(max, field.page_number), 1);
      setTotalPages(maxPage);

      // Initialize form data with empty values
      const initialData: Record<string, any> = {};
      data.fields.forEach(field => {
        if (field.field_type === 'checkbox') {
          initialData[field.id] = [];
        } else {
          initialData[field.id] = '';
        }
      });
      setFormData(initialData);
    } catch (error) {
      console.error('Error fetching form:', error);
      setError('Failed to load form');
    } finally {
      setLoading(false);
    }
  };

  const validateCurrentPage = (): boolean => {
    const errors: Record<string, string> = {};

    if (!form) return false;

    // Validate only fields on current page (skip section headers and descriptions)
    const fieldsOnCurrentPage = form.fields.filter(f => f.page_number === currentPage && !['section', 'description'].includes(f.field_type));
    fieldsOnCurrentPage.forEach(field => {
      if (field.required) {
        const value = formData[field.id];
        if (!value || (Array.isArray(value) && value.length === 0)) {
          errors[field.id] = 'This field is required';
        }
      }

      // Validate email fields
      if (field.field_type === 'email' && formData[field.id]) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData[field.id])) {
          errors[field.id] = 'Please enter a valid email address';
        }
      }
    });

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextPage = () => {
    if (validateCurrentPage()) {
      setCurrentPage(prev => Math.min(prev + 1, totalPages));
      setValidationErrors({});
    }
  };

  const handlePreviousPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
    setValidationErrors({});
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!form) return false;

    // Validate required fields (skip section headers and descriptions)
    form.fields.filter(f => !['section', 'description'].includes(f.field_type)).forEach(field => {
      if (field.required) {
        const value = formData[field.id];
        if (!value || (Array.isArray(value) && value.length === 0)) {
          errors[field.id] = 'This field is required';
        }
      }

      // Validate email fields
      if (field.field_type === 'email' && formData[field.id]) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData[field.id])) {
          errors[field.id] = 'Please enter a valid email address';
        }
      }
    });

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setSubmitting(true);
      await FormService.submitResponse(
        {
          form_id: formId,
          response_data: formData,
        },
        supabasePublic
      );
      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting form:', error);
      setError('Failed to submit form. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
    // Clear validation error when user starts typing
    if (validationErrors[fieldId]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  };

  const handleCheckboxChange = (fieldId: string, option: string, checked: boolean) => {
    setFormData(prev => {
      const currentValues = prev[fieldId] || [];
      if (checked) {
        return { ...prev, [fieldId]: [...currentValues, option] };
      } else {
        return { ...prev, [fieldId]: currentValues.filter((v: string) => v !== option) };
      }
    });
  };

  const renderField = (field: any) => {
    const hasError = validationErrors[field.id];

    switch (field.field_type as FieldType) {
      case 'text':
      case 'email':
      case 'number':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type={field.field_type}
              value={formData[field.id] || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              className={`auth-input ${hasError ? 'border-red-500' : ''}`}
            />
            {hasError && <p className="text-sm text-red-500">{hasError}</p>}
          </div>
        );

      case 'textarea':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Textarea
              id={field.id}
              value={formData[field.id] || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              rows={4}
              className={`auth-input ${hasError ? 'border-red-500' : ''}`}
            />
            {hasError && <p className="text-sm text-red-500">{hasError}</p>}
          </div>
        );

      case 'date':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={`auth-input w-full justify-start text-left font-normal ${hasError ? 'border-red-500' : ''}`}
                  style={{
                    borderColor: hasError ? '#ef4444' : '#e5e7eb',
                    backgroundColor: 'white',
                    color: formData[field.id] ? '#111827' : '#9ca3af'
                  }}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData[field.id] ? formatDate(formData[field.id]) : "Select date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={parseDateFromInput(formData[field.id])}
                  onSelect={(date) => handleFieldChange(field.id, formatDateForInput(date))}
                  initialFocus
                  classNames={{
                    day_selected: "text-white hover:text-white focus:text-white",
                  }}
                  modifiersStyles={{
                    selected: { backgroundColor: "#3e8692" }
                  }}
                />
              </PopoverContent>
            </Popover>
            {hasError && <p className="text-sm text-red-500">{hasError}</p>}
          </div>
        );

      case 'select':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Select value={formData[field.id] || ''} onValueChange={(value) => handleFieldChange(field.id, value)}>
              <SelectTrigger className={`auth-input ${hasError ? 'border-red-500' : ''}`}>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((option: string) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasError && <p className="text-sm text-red-500">{hasError}</p>}
          </div>
        );

      case 'radio':
        return (
          <div key={field.id} className="space-y-2">
            <Label>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <RadioGroup value={formData[field.id] || ''} onValueChange={(value) => handleFieldChange(field.id, value)}>
              <div className="space-y-2">
                {field.options?.map((option: string) => (
                  <div key={option} className="flex items-center space-x-2">
                    <RadioGroupItem value={option} id={`${field.id}-${option}`} />
                    <Label htmlFor={`${field.id}-${option}`} className="font-normal cursor-pointer">
                      {option}
                    </Label>
                  </div>
                ))}
              </div>
            </RadioGroup>
            {hasError && <p className="text-sm text-red-500">{hasError}</p>}
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.id} className="space-y-2">
            <Label>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <div className="space-y-2">
              {field.options?.map((option: string) => (
                <div key={option} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${field.id}-${option}`}
                    checked={formData[field.id]?.includes(option) || false}
                    onCheckedChange={(checked) => handleCheckboxChange(field.id, option, checked as boolean)}
                  />
                  <Label htmlFor={`${field.id}-${option}`} className="font-normal cursor-pointer">
                    {option}
                  </Label>
                </div>
              ))}
            </div>
            {hasError && <p className="text-sm text-red-500">{hasError}</p>}
          </div>
        );

      case 'section':
        return (
          <div key={field.id} className="py-4">
            <h3 className="text-2xl font-bold text-gray-900 border-b-2 border-gray-300 pb-2">
              {field.label}
            </h3>
          </div>
        );

      case 'description':
        return (
          <div key={field.id} className="py-2">
            <p className="text-sm text-gray-600">{field.label}</p>
          </div>
        );

      default:
        return null;
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin text-gray-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center">
            <Image src="/images/logo.png" alt="Logo" width={36} height={36} />
            <span className="ml-2 text-xl font-semibold text-gray-800">Holo Hive</span>
          </div>
        </header>
        <div className="flex items-center justify-center py-20">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Form Not Available</h2>
              <p className="text-gray-600">{error}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Success state
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center">
            <Image src="/images/logo.png" alt="Logo" width={36} height={36} />
            <span className="ml-2 text-xl font-semibold text-gray-800">Holo Hive</span>
          </div>
        </header>
        <div className="flex items-center justify-center py-20">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <div className="rounded-full bg-green-100 p-3 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Thank you!</h2>
              <p className="text-gray-600">Your response has been submitted successfully.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Form state
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center">
          <Image src="/images/logo.png" alt="Logo" width={36} height={36} />
          <span className="ml-2 text-xl font-semibold text-gray-800">Holo Hive</span>
        </div>
      </header>
      <div className="max-w-2xl mx-auto py-12 px-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{form?.name}</CardTitle>
            {form?.description && (
              <p className="text-gray-600 mt-2">{form.description}</p>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Page indicator */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pb-4 border-b">
                  <p className="text-sm text-gray-600">
                    Page {currentPage} of {totalPages}
                  </p>
                  <div className="flex gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                      <div
                        key={pageNum}
                        className={`h-2 w-2 rounded-full ${
                          pageNum === currentPage
                            ? 'bg-[#3e8692]'
                            : pageNum < currentPage
                            ? 'bg-[#3e8692] opacity-50'
                            : 'bg-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Form fields for current page */}
              {form?.fields
                .filter(field => field.page_number === currentPage)
                .map(field => renderField(field))}

              {/* Navigation buttons */}
              <div className="pt-4 flex gap-3">
                {currentPage > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePreviousPage}
                    className="flex-1"
                  >
                    Previous
                  </Button>
                )}
                {currentPage < totalPages ? (
                  <Button
                    type="button"
                    onClick={handleNextPage}
                    className="flex-1"
                    style={{ backgroundColor: '#3e8692', color: 'white' }}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="flex-1"
                    style={{ backgroundColor: '#3e8692', color: 'white' }}
                  >
                    {submitting ? (
                      <>
                        <Loader className="h-4 w-4 animate-spin mr-2" />
                        Submitting...
                      </>
                    ) : (
                      'Submit'
                    )}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
