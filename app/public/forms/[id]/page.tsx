'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FormService, FormWithFields, FieldType } from '@/lib/formService';
import { CheckCircle2, FileText, Loader, Calendar as CalendarIcon, Upload, ChevronLeft, ChevronRight } from 'lucide-react';

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

  // Multiple answer tracking - stores arrays of values for fields that allow multiple
  const [multipleAnswers, setMultipleAnswers] = useState<Record<string, string[]>>({});

  // Other field tracking - stores custom text for "Other" option
  const [otherFieldValues, setOtherFieldValues] = useState<Record<string, string>>({});

  // Track which fields have "Other" selected
  const [otherFieldSelected, setOtherFieldSelected] = useState<Record<string, boolean>>({});

  // Track uploaded files for fields with attachments
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File[]>>({});
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, boolean>>({});

  // Track reason values for Yes/No selections
  const [yesNoReasons, setYesNoReasons] = useState<Record<string, string>>({});

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

  const handleNextPage = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (validateCurrentPage()) {
      setCurrentPage(prev => Math.min(prev + 1, totalPages));
      setValidationErrors({});
    }
  };

  const handlePreviousPage = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
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

      // Validate Yes/No reason fields for select fields
      if (field.field_type === 'select' && formData[field.id]) {
        const selectedValue = formData[field.id].toLowerCase();
        if (field.require_yes_reason && selectedValue === 'yes') {
          if (!yesNoReasons[field.id] || yesNoReasons[field.id].trim() === '') {
            errors[field.id] = 'Please provide a reason for selecting "Yes"';
          }
        }
        if (field.require_no_reason && selectedValue === 'no') {
          if (!yesNoReasons[field.id] || yesNoReasons[field.id].trim() === '') {
            errors[field.id] = 'Please provide a reason for selecting "No"';
          }
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

      // Upload files to Supabase Storage
      const responseDataWithFiles = { ...formData };

      // Add Yes/No reasons to response data
      for (const fieldId in yesNoReasons) {
        if (yesNoReasons[fieldId]) {
          responseDataWithFiles[`${fieldId}_reason`] = yesNoReasons[fieldId];
        }
      }

      for (const fieldId in uploadedFiles) {
        if (uploadedFiles[fieldId] && uploadedFiles[fieldId].length > 0) {
          const fileUrls: string[] = [];

          for (const file of uploadedFiles[fieldId]) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${formId}/${fieldId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

            const { data, error } = await supabasePublic.storage
              .from('form-attachments')
              .upload(fileName, file);

            if (error) {
              console.error('Error uploading file:', error);
              throw new Error(`Failed to upload ${file.name}`);
            }

            // Get public URL
            const { data: urlData } = supabasePublic.storage
              .from('form-attachments')
              .getPublicUrl(fileName);

            fileUrls.push(urlData.publicUrl);
          }

          // Store file URLs in response data
          responseDataWithFiles[`${fieldId}_attachments`] = fileUrls;
        }
      }

      await FormService.submitResponse(
        {
          form_id: formId,
          response_data: responseDataWithFiles,
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
        if (field.allow_multiple) {
          const answers = multipleAnswers[field.id] || [''];
          return (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={field.id}>
                <span dangerouslySetInnerHTML={{ __html: field.label }} style={{ whiteSpace: 'pre-wrap' }} />
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </Label>
              {answers.map((answer, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <span className="text-gray-600 font-medium min-w-[24px]">{index + 1}.</span>
                  <Input
                    type={field.field_type}
                    value={answer}
                    onChange={(e) => {
                      const newAnswers = [...answers];
                      newAnswers[index] = e.target.value;
                      setMultipleAnswers(prev => ({ ...prev, [field.id]: newAnswers }));
                      handleFieldChange(field.id, newAnswers.filter(a => a.trim()));
                    }}
                    className={`auth-input flex-1 ${hasError ? 'border-red-500' : ''}`}
                  />
                  {index === answers.length - 1 && (
                    <Button
                      type="button"
                      onClick={() => {
                        setMultipleAnswers(prev => ({
                          ...prev,
                          [field.id]: [...answers, '']
                        }));
                      }}
                      style={{ backgroundColor: '#3e8692', color: 'white' }}
                      className="hover:opacity-90"
                    >
                      +
                    </Button>
                  )}
                  {answers.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const newAnswers = answers.filter((_, i) => i !== index);
                        setMultipleAnswers(prev => ({ ...prev, [field.id]: newAnswers }));
                        handleFieldChange(field.id, newAnswers.filter(a => a.trim()));
                      }}
                      className="hover:bg-red-50 hover:text-red-700"
                    >
                      ×
                    </Button>
                  )}
                </div>
              ))}
              {hasError && <p className="text-sm text-red-500">{hasError}</p>}
            </div>
          );
        }
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              <span dangerouslySetInnerHTML={{ __html: field.label }} style={{ whiteSpace: 'pre-wrap' }} />
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type={field.field_type}
              value={formData[field.id] || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              className={`auth-input ${hasError ? 'border-red-500' : ''}`}
            />
            {field.allow_attachments && (
              <div className="space-y-2">
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add('border-[#3e8692]', 'bg-blue-50');
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('border-[#3e8692]', 'bg-blue-50');
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('border-[#3e8692]', 'bg-blue-50');
                    const files = Array.from(e.dataTransfer.files);
                    if (files.length > 0) {
                      setUploadedFiles(prev => ({
                        ...prev,
                        [field.id]: [...(prev[field.id] || []), ...files]
                      }));
                    }
                  }}
                  onClick={() => {
                    const input = document.getElementById(`file-${field.id}`) as HTMLInputElement;
                    input?.click();
                  }}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Upload className="w-4 h-4 text-gray-500" />
                    <p className="text-sm text-gray-500">Drag files here or click to upload</p>
                  </div>
                  <Input
                    id={`file-${field.id}`}
                    type="file"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) {
                        setUploadedFiles(prev => ({
                          ...prev,
                          [field.id]: [...(prev[field.id] || []), ...files]
                        }));
                      }
                    }}
                    className="hidden"
                  />
                </div>
                {uploadedFiles[field.id] && uploadedFiles[field.id].length > 0 && (
                  <div className="space-y-1">
                    {uploadedFiles[field.id].map((file, index) => (
                      <div key={index} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded">
                        <span className="text-gray-700">{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setUploadedFiles(prev => ({
                              ...prev,
                              [field.id]: prev[field.id].filter((_, i) => i !== index)
                            }));
                          }}
                          className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-700"
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {hasError && <p className="text-sm text-red-500">{hasError}</p>}
          </div>
        );

      case 'textarea':
        if (field.allow_multiple) {
          const answers = multipleAnswers[field.id] || [''];
          return (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={field.id}>
                <span dangerouslySetInnerHTML={{ __html: field.label }} style={{ whiteSpace: 'pre-wrap' }} />
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </Label>
              {answers.map((answer, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <span className="text-gray-600 font-medium min-w-[24px] mt-2">{index + 1}.</span>
                  <Textarea
                    value={answer}
                    onChange={(e) => {
                      const newAnswers = [...answers];
                      newAnswers[index] = e.target.value;
                      setMultipleAnswers(prev => ({ ...prev, [field.id]: newAnswers }));
                      handleFieldChange(field.id, newAnswers.filter(a => a.trim()));
                    }}
                    rows={4}
                    className={`auth-input flex-1 ${hasError ? 'border-red-500' : ''}`}
                  />
                  {index === answers.length - 1 && (
                    <Button
                      type="button"
                      onClick={() => {
                        setMultipleAnswers(prev => ({
                          ...prev,
                          [field.id]: [...answers, '']
                        }));
                      }}
                      style={{ backgroundColor: '#3e8692', color: 'white' }}
                      className="hover:opacity-90"
                    >
                      +
                    </Button>
                  )}
                  {answers.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const newAnswers = answers.filter((_, i) => i !== index);
                        setMultipleAnswers(prev => ({ ...prev, [field.id]: newAnswers }));
                        handleFieldChange(field.id, newAnswers.filter(a => a.trim()));
                      }}
                      className="hover:bg-red-50 hover:text-red-700"
                    >
                      ×
                    </Button>
                  )}
                </div>
              ))}
              {hasError && <p className="text-sm text-red-500">{hasError}</p>}
            </div>
          );
        }
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              <span dangerouslySetInnerHTML={{ __html: field.label }} style={{ whiteSpace: 'pre-wrap' }} />
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Textarea
              id={field.id}
              value={formData[field.id] || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              rows={4}
              className={`auth-input ${hasError ? 'border-red-500' : ''}`}
            />
            {field.allow_attachments && (
              <div className="space-y-2">
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add('border-[#3e8692]', 'bg-blue-50');
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('border-[#3e8692]', 'bg-blue-50');
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('border-[#3e8692]', 'bg-blue-50');
                    const files = Array.from(e.dataTransfer.files);
                    if (files.length > 0) {
                      setUploadedFiles(prev => ({
                        ...prev,
                        [field.id]: [...(prev[field.id] || []), ...files]
                      }));
                    }
                  }}
                  onClick={() => {
                    const input = document.getElementById(`file-${field.id}`) as HTMLInputElement;
                    input?.click();
                  }}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Upload className="w-4 h-4 text-gray-500" />
                    <p className="text-sm text-gray-500">Drag files here or click to upload</p>
                  </div>
                  <Input
                    id={`file-${field.id}`}
                    type="file"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) {
                        setUploadedFiles(prev => ({
                          ...prev,
                          [field.id]: [...(prev[field.id] || []), ...files]
                        }));
                      }
                    }}
                    className="hidden"
                  />
                </div>
                {uploadedFiles[field.id] && uploadedFiles[field.id].length > 0 && (
                  <div className="space-y-1">
                    {uploadedFiles[field.id].map((file, index) => (
                      <div key={index} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded">
                        <span className="text-gray-700">{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setUploadedFiles(prev => ({
                              ...prev,
                              [field.id]: prev[field.id].filter((_, i) => i !== index)
                            }));
                          }}
                          className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-700"
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {hasError && <p className="text-sm text-red-500">{hasError}</p>}
          </div>
        );

      case 'date':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              <span dangerouslySetInnerHTML={{ __html: field.label }} style={{ whiteSpace: 'pre-wrap' }} />
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
        const selectedValue = otherFieldSelected[field.id] ? '__OTHER__' : (formData[field.id] || '');
        const showYesReason = field.require_yes_reason && selectedValue.toLowerCase() === 'yes';
        const showNoReason = field.require_no_reason && selectedValue.toLowerCase() === 'no';

        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              <span dangerouslySetInnerHTML={{ __html: field.label }} style={{ whiteSpace: 'pre-wrap' }} />
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Select
              value={selectedValue}
              onValueChange={(value) => {
                if (value === '__OTHER__') {
                  // Mark that Other is selected
                  setOtherFieldSelected(prev => ({ ...prev, [field.id]: true }));
                  handleFieldChange(field.id, otherFieldValues[field.id] || '');
                } else {
                  // Regular option selected
                  setOtherFieldSelected(prev => ({ ...prev, [field.id]: false }));
                  handleFieldChange(field.id, value);
                  // Clear the other field value
                  setOtherFieldValues(prev => {
                    const newValues = { ...prev };
                    delete newValues[field.id];
                    return newValues;
                  });

                  // Clear reason if switching away from Yes/No
                  if (value.toLowerCase() !== 'yes' && value.toLowerCase() !== 'no') {
                    setYesNoReasons(prev => {
                      const newReasons = { ...prev };
                      delete newReasons[field.id];
                      return newReasons;
                    });
                  }
                }
              }}
            >
              <SelectTrigger className={`auth-input ${hasError ? 'border-red-500' : ''}`}>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((option: string) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
                {field.include_other && (
                  <SelectItem value="__OTHER__">Other</SelectItem>
                )}
              </SelectContent>
            </Select>
            {otherFieldSelected[field.id] && (
              <Input
                placeholder="Please specify..."
                value={otherFieldValues[field.id] || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setOtherFieldValues(prev => ({ ...prev, [field.id]: value }));
                  // Store the actual value in formData
                  handleFieldChange(field.id, value);
                }}
                className="auth-input mt-2"
              />
            )}
            {showYesReason && (
              <div className="mt-2">
                <Textarea
                  id={`${field.id}-yes-reason`}
                  placeholder="Please provide a reason..."
                  value={yesNoReasons[field.id] || ''}
                  onChange={(e) => {
                    setYesNoReasons(prev => ({ ...prev, [field.id]: e.target.value }));
                  }}
                  className="auth-input"
                  rows={3}
                />
              </div>
            )}
            {showNoReason && (
              <div className="mt-2">
                <Textarea
                  id={`${field.id}-no-reason`}
                  placeholder="Please provide a reason..."
                  value={yesNoReasons[field.id] || ''}
                  onChange={(e) => {
                    setYesNoReasons(prev => ({ ...prev, [field.id]: e.target.value }));
                  }}
                  className="auth-input"
                  rows={3}
                />
              </div>
            )}
            {hasError && <p className="text-sm text-red-500">{hasError}</p>}
          </div>
        );

      case 'radio':
        return (
          <div key={field.id} className="space-y-2">
            <Label>
              <span dangerouslySetInnerHTML={{ __html: field.label }} style={{ whiteSpace: 'pre-wrap' }} />
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
              <span dangerouslySetInnerHTML={{ __html: field.label }} style={{ whiteSpace: 'pre-wrap' }} />
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
            <div className="font-bold text-gray-900 border-b-2 border-gray-300 pb-2" style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: field.label }} />
          </div>
        );

      case 'description':
        return (
          <div key={field.id} className="py-2">
            <div className="text-gray-600" style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: field.label }} />
          </div>
        );

      default:
        return null;
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <Loader className="h-12 w-12 animate-spin text-[#3e8692] mx-auto mb-4" />
          <p className="text-gray-600 text-lg font-medium">Loading form...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="flex justify-center mb-6">
            <Image src="/images/logo.png" alt="Logo" width={60} height={60} className="rounded-xl" />
          </div>
          <div className="rounded-full bg-red-50 p-4 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <FileText className="h-10 w-10 text-red-500" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Form Not Available</h2>
          <p className="text-lg text-gray-600 leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  // Success state
  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="flex justify-center mb-6">
            <Image src="/images/logo.png" alt="Logo" width={60} height={60} className="rounded-xl" />
          </div>
          <div className="rounded-full bg-green-50 p-4 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Thank you!</h2>
          <p className="text-lg text-gray-600 leading-relaxed">Your response has been submitted successfully.</p>
        </div>
      </div>
    );
  }

  // Form state
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-16">
        {/* Logo and Title */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <Image src="/images/logo.png" alt="Logo" width={60} height={60} className="rounded-xl" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">{form?.name}</h1>
          {form?.description && (
            <p className="text-lg text-gray-600 leading-relaxed max-w-xl mx-auto">{form.description}</p>
          )}
        </div>

        {/* Form Content */}
        <div className="max-w-xl mx-auto">
          <form onSubmit={handleSubmit} className="space-y-8">
              {/* Page indicator */}
              {totalPages > 1 && (
                <div className="flex justify-center mb-8">
                  <div className="flex gap-2">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                      <div
                        key={pageNum}
                        className={`h-2 rounded-full transition-all duration-300 ${
                          pageNum === currentPage
                            ? 'bg-[#3e8692] w-8'
                            : pageNum < currentPage
                            ? 'bg-[#3e8692] opacity-30 w-2'
                            : 'bg-gray-300 w-2'
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
              <div className="pt-8 flex gap-4 justify-center items-center">
                {currentPage > 1 && (
                  <Button
                    type="button"
                    onClick={handlePreviousPage}
                    className="px-6 h-12 text-base font-medium rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all flex items-center gap-2"
                  >
                    <ChevronLeft className="h-5 w-5" />
                    Previous
                  </Button>
                )}
                {currentPage < totalPages ? (
                  <Button
                    type="button"
                    onClick={handleNextPage}
                    className="px-6 h-12 text-base font-medium rounded-lg bg-[#3e8692] hover:bg-[#2d6570] text-white transition-all flex items-center gap-2"
                  >
                    Next
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="px-6 h-12 text-base font-medium rounded-lg bg-[#3e8692] hover:bg-[#2d6570] text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader className="h-5 w-5 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        Submit
                        <ChevronRight className="h-5 w-5" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
  );
}

