'use client';

import { useState, useEffect, useRef } from 'react';
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
import { ArrowLeft, Plus, Edit, Trash2, Save, Share2, Copy, CheckCircle2, GripVertical, FileText, Download, Eye, ExternalLink, X, Bold, Italic, Palette, Upload, Minus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FormService, FormWithFields, FormField, FieldType, FormStatus, FormResponse } from '@/lib/formService';
import { CustomColorPicker } from '@/components/ui/custom-color-picker';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Field Item Component
interface SortableFieldItemProps {
  field: FormField;
  handleOpenFieldDialog: (field: FormField) => void;
  handleDeleteField: (id: string, label: string) => void;
  editingFieldId: string | null;
  setEditingFieldId: (id: string | null) => void;
  onSaveField: (fieldId: string, updates: Partial<FormField>) => Promise<void>;
}

function SortableFieldItem({ field, handleOpenFieldDialog, handleDeleteField, editingFieldId, setEditingFieldId, onSaveField }: SortableFieldItemProps) {
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

  const isEditing = editingFieldId === field.id;
  const [editLabel, setEditLabel] = useState(field.label);
  const [editRequired, setEditRequired] = useState(field.required);
  const [editFieldType, setEditFieldType] = useState<FieldType>(field.field_type);
  const [editAllowMultiple, setEditAllowMultiple] = useState(field.allow_multiple || false);
  const [editIncludeOther, setEditIncludeOther] = useState(field.include_other || false);
  const [editAllowAttachments, setEditAllowAttachments] = useState(field.allow_attachments || false);
  const [editRequireYesReason, setEditRequireYesReason] = useState(field.require_yes_reason || false);
  const [editRequireNoReason, setEditRequireNoReason] = useState(field.require_no_reason || false);
  const [editOptions, setEditOptions] = useState<string[]>(field.options || []);
  const [isYesNoDropdown, setIsYesNoDropdown] = useState(field.is_yes_no_dropdown || false);
  const [newOption, setNewOption] = useState('');
  const labelEditRef = useRef<HTMLDivElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showCustomColorPicker, setShowCustomColorPicker] = useState(false);
  const [currentColor, setCurrentColor] = useState('#000000');
  const [savedSelection, setSavedSelection] = useState<Range | null>(null);

  // Sync edit state when field changes
  useEffect(() => {
    setEditLabel(field.label);
    setEditRequired(field.required);
    setEditFieldType(field.field_type);
    setEditAllowMultiple(field.allow_multiple || false);
    setEditIncludeOther(field.include_other || false);
    setEditAllowAttachments(field.allow_attachments || false);
    setEditRequireYesReason(field.require_yes_reason || false);
    setEditRequireNoReason(field.require_no_reason || false);
    setEditOptions(field.options || []);
    setIsYesNoDropdown(field.is_yes_no_dropdown || false);
  }, [field.label, field.required, field.field_type, field.allow_multiple, field.include_other, field.allow_attachments, field.require_yes_reason, field.require_no_reason, field.is_yes_no_dropdown, field.options, field.id]);

  // Focus label input when entering edit mode
  useEffect(() => {
    if (isEditing && labelEditRef.current) {
      labelEditRef.current.focus();
      labelEditRef.current.innerHTML = editLabel;
    }
  }, [isEditing]);

  // Helper functions for text selection
  const saveSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      setSavedSelection(selection.getRangeAt(0));
    }
  };

  const restoreSelection = () => {
    if (savedSelection) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(savedSelection);
      }
    }
  };

  const applyColorToSelection = (color: string) => {
    if (!labelEditRef.current) return;
    labelEditRef.current.focus();
    restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      document.execCommand('foreColor', false, color);
    } else {
      document.execCommand('foreColor', false, color);
    }
  };

  const changeFontSize = (increase: boolean) => {
    if (!labelEditRef.current) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (range.collapsed) return; // No text selected

    // Get the parent element of the selection
    const parentElement = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentElement
      : range.commonAncestorContainer as HTMLElement;

    // Find if we're inside a span with fontSize (walk up the DOM)
    let existingSpan: HTMLElement | null = null;
    let current: HTMLElement | null = parentElement;

    while (current && current !== labelEditRef.current) {
      if (current.tagName === 'SPAN' && current.style.fontSize) {
        existingSpan = current;
        break;
      }
      current = current.parentElement;
    }

    // Determine current font size
    let currentSize = 16; // Default
    if (existingSpan) {
      currentSize = parseInt(existingSpan.style.fontSize) || 16;
    } else {
      // Check if selection contains any element with fontSize
      const tempDiv = document.createElement('div');
      tempDiv.appendChild(range.cloneContents());
      const spanWithSize = tempDiv.querySelector('[style*="font-size"]') as HTMLElement;
      if (spanWithSize && spanWithSize.style.fontSize) {
        currentSize = parseInt(spanWithSize.style.fontSize) || 16;
      }
    }

    // Calculate new size (increase/decrease by 2px)
    const newSize = increase
      ? Math.min(72, currentSize + 2)
      : Math.max(10, currentSize - 2);

    // If we're entirely within an existing span with fontSize, just update it
    if (existingSpan &&
        range.startContainer.parentElement === existingSpan &&
        range.endContainer.parentElement === existingSpan) {
      existingSpan.style.fontSize = `${newSize}px`;
      setEditLabel(labelEditRef.current.innerHTML);
    } else {
      // Extract the selected content with all its styles
      const fragment = range.cloneContents();
      const tempDiv = document.createElement('div');
      tempDiv.appendChild(fragment);

      // Create new span with font size
      const span = document.createElement('span');
      span.style.fontSize = `${newSize}px`;
      span.innerHTML = tempDiv.innerHTML;

      // Replace the selection
      range.deleteContents();
      range.insertNode(span);

      setEditLabel(labelEditRef.current.innerHTML);

      // Keep the selection on the new content
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      selection.removeAllRanges();
      selection.addRange(newRange);
    }
  };

  const handleSave = async () => {
    await onSaveField(field.id, {
      label: editLabel,
      required: editRequired,
      field_type: editFieldType,
      allow_multiple: editAllowMultiple,
      include_other: editIncludeOther,
      allow_attachments: editAllowAttachments,
      is_yes_no_dropdown: isYesNoDropdown,
      require_yes_reason: editRequireYesReason,
      require_no_reason: editRequireNoReason,
      options: editOptions.length > 0 ? editOptions : undefined,
    });
    setEditingFieldId(null);
  };

  const handleCancel = () => {
    setEditLabel(field.label);
    setEditRequired(field.required);
    setEditFieldType(field.field_type);
    setEditAllowMultiple(field.allow_multiple || false);
    setEditIncludeOther(field.include_other || false);
    setEditAllowAttachments(field.allow_attachments || false);
    setEditRequireYesReason(field.require_yes_reason || false);
    setEditRequireNoReason(field.require_no_reason || false);
    setEditOptions(field.options || []);
    setIsYesNoDropdown(field.is_yes_no_dropdown || false);
    setEditingFieldId(null);
  };

  const addOption = () => {
    if (newOption.trim()) {
      setEditOptions([...editOptions, newOption.trim()]);
      setNewOption('');
    }
  };

  const removeOption = (index: number) => {
    setEditOptions(editOptions.filter((_, i) => i !== index));
  };

  // Render field as it appears in the form (public form style)
  if (field.field_type === 'section') {
    return (
      <div ref={setNodeRef} style={style} className="group relative border-b-2 border-gray-300 pb-2">
        <div className="absolute -left-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
            <GripVertical className="h-4 w-4" />
          </div>
        </div>
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <Label className="text-sm text-gray-600">Section Title</Label>
              <div className="flex gap-1 mb-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!labelEditRef.current) return;
                    labelEditRef.current.focus();
                    document.execCommand('bold', false);
                  }}
                  title="Bold"
                >
                  <Bold className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!labelEditRef.current) return;
                    labelEditRef.current.focus();
                    document.execCommand('italic', false);
                  }}
                  title="Italic"
                >
                  <Italic className="h-4 w-4" />
                </Button>
                <div className="relative">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      saveSelection();
                      setShowColorPicker(!showColorPicker);
                    }}
                    title="Text Color"
                  >
                    <Palette className="h-4 w-4" />
                  </Button>
                  {showColorPicker && !showCustomColorPicker && (
                    <div className="absolute top-full mt-1 left-0 z-50 bg-white border rounded-lg shadow-lg p-3 w-64">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Text Color</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowColorPicker(false)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-8 gap-2 mb-3">
                        {[
                          '#000000', '#374151', '#6B7280', '#9CA3AF',
                          '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
                          '#8B5CF6', '#EC4899', '#F97316', '#14B8A6',
                          '#84CC16', '#EAB308', '#06B6D4', '#6366F1',
                          '#FFFFFF', '#DC2626', '#EA580C', '#3e8692'
                        ].map((color) => (
                          <button
                            key={color}
                            type="button"
                            className="w-6 h-6 rounded border-2 hover:scale-110 transition-transform"
                            style={{
                              backgroundColor: color,
                              borderColor: color === '#FFFFFF' ? '#D1D5DB' : color
                            }}
                            onClick={() => {
                              applyColorToSelection(color);
                              setShowColorPicker(false);
                            }}
                          />
                        ))}
                        <button
                          type="button"
                          className="w-6 h-6 rounded border-2 hover:scale-110 transition-transform relative"
                          style={{
                            background: 'linear-gradient(135deg, #FF0000 0%, #FF7F00 14%, #FFFF00 28%, #00FF00 42%, #0000FF 56%, #4B0082 70%, #9400D3 84%, #FF0000 100%)',
                            borderColor: '#D1D5DB'
                          }}
                          onClick={() => setShowCustomColorPicker(true)}
                          title="Custom Color Picker"
                        />
                      </div>
                    </div>
                  )}
                  {showColorPicker && showCustomColorPicker && (
                    <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] bg-white rounded-lg shadow-xl p-4" style={{ width: '420px' }}>
                      <CustomColorPicker
                        isOpen={showCustomColorPicker}
                        onClose={() => {
                          setShowCustomColorPicker(false);
                          setShowColorPicker(false);
                        }}
                        onApply={(color) => {
                          applyColorToSelection(color);
                          setCurrentColor(color);
                          setShowCustomColorPicker(false);
                          setShowColorPicker(false);
                        }}
                        initialColor={currentColor}
                        presetColors={[
                          '#000000', '#374151', '#6B7280', '#9CA3AF',
                          '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
                          '#8B5CF6', '#EC4899', '#F97316', '#14B8A6',
                          '#84CC16', '#EAB308', '#06B6D4', '#6366F1',
                          '#FFFFFF', '#DC2626', '#EA580C', '#3e8692'
                        ]}
                      />
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    changeFontSize(false);
                  }}
                  title="Decrease Font Size"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    changeFontSize(true);
                  }}
                  title="Increase Font Size"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div
                ref={labelEditRef}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => setEditLabel(e.currentTarget.innerHTML)}
                className="font-semibold text-gray-900 border rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#3e8692]"
                style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} style={{ backgroundColor: '#3e8692', color: 'white' }} className="hover:opacity-90">
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900" style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: field.label }} />
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingFieldId(field.id)}
                className="hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteField(field.id, field.label)}
                className="hover:bg-red-50 hover:text-red-700 hover:border-red-300"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (field.field_type === 'description') {
    return (
      <div ref={setNodeRef} style={style} className="group relative">
        <div className="absolute -left-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
            <GripVertical className="h-4 w-4" />
          </div>
        </div>
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <Label className="text-sm text-gray-600">Description Text</Label>
              <div className="flex gap-1 mb-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!labelEditRef.current) return;
                    labelEditRef.current.focus();
                    document.execCommand('bold', false);
                  }}
                  title="Bold"
                >
                  <Bold className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!labelEditRef.current) return;
                    labelEditRef.current.focus();
                    document.execCommand('italic', false);
                  }}
                  title="Italic"
                >
                  <Italic className="h-4 w-4" />
                </Button>
                <div className="relative">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      saveSelection();
                      setShowColorPicker(!showColorPicker);
                    }}
                    title="Text Color"
                  >
                    <Palette className="h-4 w-4" />
                  </Button>
                  {showColorPicker && !showCustomColorPicker && (
                    <div className="absolute top-full mt-1 left-0 z-50 bg-white border rounded-lg shadow-lg p-3 w-64">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Text Color</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowColorPicker(false)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-8 gap-2 mb-3">
                        {[
                          '#000000', '#374151', '#6B7280', '#9CA3AF',
                          '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
                          '#8B5CF6', '#EC4899', '#F97316', '#14B8A6',
                          '#84CC16', '#EAB308', '#06B6D4', '#6366F1',
                          '#FFFFFF', '#DC2626', '#EA580C', '#3e8692'
                        ].map((color) => (
                          <button
                            key={color}
                            type="button"
                            className="w-6 h-6 rounded border-2 hover:scale-110 transition-transform"
                            style={{
                              backgroundColor: color,
                              borderColor: color === '#FFFFFF' ? '#D1D5DB' : color
                            }}
                            onClick={() => {
                              applyColorToSelection(color);
                              setShowColorPicker(false);
                            }}
                          />
                        ))}
                        <button
                          type="button"
                          className="w-6 h-6 rounded border-2 hover:scale-110 transition-transform relative"
                          style={{
                            background: 'linear-gradient(135deg, #FF0000 0%, #FF7F00 14%, #FFFF00 28%, #00FF00 42%, #0000FF 56%, #4B0082 70%, #9400D3 84%, #FF0000 100%)',
                            borderColor: '#D1D5DB'
                          }}
                          onClick={() => setShowCustomColorPicker(true)}
                          title="Custom Color Picker"
                        />
                      </div>
                    </div>
                  )}
                  {showColorPicker && showCustomColorPicker && (
                    <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] bg-white rounded-lg shadow-xl p-4" style={{ width: '420px' }}>
                      <CustomColorPicker
                        isOpen={showCustomColorPicker}
                        onClose={() => {
                          setShowCustomColorPicker(false);
                          setShowColorPicker(false);
                        }}
                        onApply={(color) => {
                          applyColorToSelection(color);
                          setCurrentColor(color);
                          setShowCustomColorPicker(false);
                          setShowColorPicker(false);
                        }}
                        initialColor={currentColor}
                        presetColors={[
                          '#000000', '#374151', '#6B7280', '#9CA3AF',
                          '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
                          '#8B5CF6', '#EC4899', '#F97316', '#14B8A6',
                          '#84CC16', '#EAB308', '#06B6D4', '#6366F1',
                          '#FFFFFF', '#DC2626', '#EA580C', '#3e8692'
                        ]}
                      />
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    changeFontSize(false);
                  }}
                  title="Decrease Font Size"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    changeFontSize(true);
                  }}
                  title="Increase Font Size"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div
                ref={labelEditRef}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => setEditLabel(e.currentTarget.innerHTML)}
                className="text-gray-600 border rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#3e8692]"
                style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} style={{ backgroundColor: '#3e8692', color: 'white' }} className="hover:opacity-90">
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="text-gray-600 flex-1" style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: field.label }} />
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingFieldId(field.id)}
                className="hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteField(field.id, field.label)}
                className="hover:bg-red-50 hover:text-red-700 hover:border-red-300"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Link field (embedded content)
  if (field.field_type === 'link') {
    const linkUrl = field.options?.[0] || '';
    return (
      <div ref={setNodeRef} style={style} className="group relative">
        <div className="absolute -left-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
            <GripVertical className="h-4 w-4" />
          </div>
        </div>
        <div className="space-y-2 p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              {field.label && (
                <div className="font-medium text-gray-900 mb-2" dangerouslySetInnerHTML={{ __html: field.label }} style={{ whiteSpace: 'pre-wrap' }} />
              )}
              <div className="text-sm text-gray-600 bg-white rounded p-3 border">
                <p className="font-medium mb-1">Embedded Content</p>
                <p className="text-xs text-gray-500 mb-2">URL: {linkUrl || 'No URL set'}</p>
                <p className="text-xs italic">View the embedded content in the Preview tab</p>
              </div>
            </div>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenFieldDialog(field)}
                className="hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteField(field.id, field.label)}
                className="hover:bg-red-50 hover:text-red-700 hover:border-red-300"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // All other field types with input fields
  return (
    <div ref={setNodeRef} style={style} className="group relative space-y-2">
      <div className="absolute -left-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
          <GripVertical className="h-4 w-4" />
        </div>
      </div>
      {isEditing ? (
        <div className="space-y-3 p-4 border-2 border-[#3e8692] rounded-lg bg-blue-50/30">
          <div>
            <Label className="text-sm text-gray-600">Field Label</Label>
            <div className="flex gap-1 mb-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!labelEditRef.current) return;
                  labelEditRef.current.focus();
                  document.execCommand('bold', false);
                }}
                title="Bold"
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!labelEditRef.current) return;
                  labelEditRef.current.focus();
                  document.execCommand('italic', false);
                }}
                title="Italic"
              >
                <Italic className="h-4 w-4" />
              </Button>
              <div className="relative">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    saveSelection();
                    setShowColorPicker(!showColorPicker);
                  }}
                  title="Text Color"
                >
                  <Palette className="h-4 w-4" />
                </Button>
                {showColorPicker && !showCustomColorPicker && (
                  <div className="absolute top-full mt-1 left-0 z-50 bg-white border rounded-lg shadow-lg p-3 w-64">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Text Color</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowColorPicker(false)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-8 gap-2 mb-3">
                      {[
                        '#000000', '#374151', '#6B7280', '#9CA3AF',
                        '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
                        '#8B5CF6', '#EC4899', '#F97316', '#14B8A6',
                        '#84CC16', '#EAB308', '#06B6D4', '#6366F1',
                        '#FFFFFF', '#DC2626', '#EA580C', '#3e8692'
                      ].map((color) => (
                        <button
                          key={color}
                          type="button"
                          className="w-6 h-6 rounded border-2 hover:scale-110 transition-transform"
                          style={{
                            backgroundColor: color,
                            borderColor: color === '#FFFFFF' ? '#D1D5DB' : color
                          }}
                          onClick={() => {
                            applyColorToSelection(color);
                            setShowColorPicker(false);
                          }}
                        />
                      ))}
                      <button
                        type="button"
                        className="w-6 h-6 rounded border-2 hover:scale-110 transition-transform relative"
                        style={{
                          background: 'linear-gradient(135deg, #FF0000 0%, #FF7F00 14%, #FFFF00 28%, #00FF00 42%, #0000FF 56%, #4B0082 70%, #9400D3 84%, #FF0000 100%)',
                          borderColor: '#D1D5DB'
                        }}
                        onClick={() => setShowCustomColorPicker(true)}
                        title="Custom Color Picker"
                      />
                    </div>
                  </div>
                )}
                {showColorPicker && showCustomColorPicker && (
                  <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] bg-white rounded-lg shadow-xl p-4" style={{ width: '420px' }}>
                    <CustomColorPicker
                      isOpen={showCustomColorPicker}
                      onClose={() => {
                        setShowCustomColorPicker(false);
                        setShowColorPicker(false);
                      }}
                      onApply={(color) => {
                        applyColorToSelection(color);
                        setCurrentColor(color);
                        setShowCustomColorPicker(false);
                        setShowColorPicker(false);
                      }}
                      initialColor={currentColor}
                      presetColors={[
                        '#000000', '#374151', '#6B7280', '#9CA3AF',
                        '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
                        '#8B5CF6', '#EC4899', '#F97316', '#14B8A6',
                        '#84CC16', '#EAB308', '#06B6D4', '#6366F1',
                        '#FFFFFF', '#DC2626', '#EA580C', '#3e8692'
                      ]}
                    />
                  </div>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  saveSelection();
                  changeFontSize(false);
                }}
                title="Decrease Font Size"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  saveSelection();
                  changeFontSize(true);
                }}
                title="Increase Font Size"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div
              ref={labelEditRef}
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => setEditLabel(e.currentTarget.innerHTML)}
              className="p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#3e8692] bg-white"
              style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
            />
          </div>
          <div>
            <Label className="text-sm text-gray-600">Field Type</Label>
            <Select value={editFieldType} onValueChange={(value) => setEditFieldType(value as FieldType)}>
              <SelectTrigger className="auth-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="section">Section Header</SelectItem>
                <SelectItem value="description">Description Text</SelectItem>
                <SelectItem value="link">Link</SelectItem>
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
          <div className="flex items-center gap-2">
            <Checkbox checked={editRequired} onCheckedChange={(checked) => setEditRequired(checked as boolean)} />
            <Label className="text-sm">Required field</Label>
          </div>
          {['text', 'textarea', 'email', 'number', 'date'].includes(editFieldType) && (
            <div className="flex items-center gap-2">
              <Checkbox checked={editAllowMultiple} onCheckedChange={(checked) => setEditAllowMultiple(checked as boolean)} />
              <Label className="text-sm">Allow multiple answers</Label>
            </div>
          )}
          {['text', 'textarea'].includes(editFieldType) && (
            <div className="flex items-center gap-2">
              <Checkbox checked={editAllowAttachments} onCheckedChange={(checked) => setEditAllowAttachments(checked as boolean)} />
              <Label className="text-sm">Allow file attachments</Label>
            </div>
          )}
          {editFieldType === 'select' && (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={isYesNoDropdown}
                onCheckedChange={(checked) => {
                  setIsYesNoDropdown(checked as boolean);
                  if (checked) {
                    setEditOptions(['Yes', 'No']);
                    setEditIncludeOther(false);
                  } else {
                    setEditOptions([]);
                    setEditRequireYesReason(false);
                    setEditRequireNoReason(false);
                  }
                }}
              />
              <Label className="text-sm">Yes/No dropdown</Label>
            </div>
          )}
          {(editFieldType === 'select' || editFieldType === 'checkbox') && !isYesNoDropdown && (
            <div className="flex items-center gap-2">
              <Checkbox checked={editIncludeOther} onCheckedChange={(checked) => setEditIncludeOther(checked as boolean)} />
              <Label className="text-sm">Include "Other" option</Label>
            </div>
          )}
          {editFieldType === 'select' && isYesNoDropdown && (
            <div className="space-y-2 border-l-2 border-gray-300 pl-4">
              <Label className="text-sm text-gray-600 mb-2">Reason Options</Label>
              <div className="flex items-center gap-2">
                <Checkbox checked={editRequireYesReason} onCheckedChange={(checked) => setEditRequireYesReason(checked as boolean)} />
                <Label className="text-sm">Require reason when "Yes" is selected</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={editRequireNoReason} onCheckedChange={(checked) => setEditRequireNoReason(checked as boolean)} />
                <Label className="text-sm">Require reason when "No" is selected</Label>
              </div>
            </div>
          )}
          {['select', 'radio', 'checkbox'].includes(editFieldType) && !(editFieldType === 'select' && isYesNoDropdown) && (
            <div>
              <Label className="text-sm text-gray-600">Options</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addOption())}
                  placeholder="Add option"
                  className="auth-input"
                  disabled={editFieldType === 'select' && isYesNoDropdown}
                />
                <Button type="button" onClick={addOption} size="sm" style={{ backgroundColor: '#3e8692', color: 'white' }} className="hover:opacity-90">Add</Button>
              </div>
              <div className="space-y-1">
                {editOptions.map((option, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-white border rounded">
                    <span className="flex-1">{option}</span>
                    <Button variant="ghost" size="sm" onClick={() => removeOption(index)} disabled={editFieldType === 'select' && isYesNoDropdown}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {editFieldType === 'select' && isYesNoDropdown && (
            <div className="p-3 bg-gray-50 border rounded-md">
              <Label className="text-sm text-gray-600 mb-2">Dropdown Options (Locked)</Label>
              <div className="space-y-1 mt-2">
                {editOptions.map((option, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-white border rounded">
                    <span className="flex-1">{option}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} style={{ backgroundColor: '#3e8692', color: 'white' }} className="hover:opacity-90">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <Label>
              <span dangerouslySetInnerHTML={{ __html: field.label }} style={{ whiteSpace: 'pre-wrap' }} />
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingFieldId(field.id)}
                className="hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteField(field.id, field.label)}
                className="hover:bg-red-50 hover:text-red-700 hover:border-red-300"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
      {field.field_type === 'text' && (
        <>
          <Input
            placeholder={`Enter ${field.label.replace(/<[^>]*>/g, '').toLowerCase()}...`}
            className="auth-input"
            disabled
          />
          {field.allow_attachments && (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center bg-gray-50">
              <div className="flex items-center justify-center gap-2">
                <Upload className="w-4 h-4 text-gray-500" />
                <p className="text-sm text-gray-500">Drag files here or click to upload</p>
              </div>
            </div>
          )}
        </>
      )}
      {field.field_type === 'textarea' && (
        <>
          <Textarea
            rows={4}
            placeholder={`Enter ${field.label.replace(/<[^>]*>/g, '').toLowerCase()}...`}
            className="auth-input"
            disabled
          />
          {field.allow_attachments && (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center bg-gray-50">
              <div className="flex items-center justify-center gap-2">
                <Upload className="w-4 h-4 text-gray-500" />
                <p className="text-sm text-gray-500">Drag files here or click to upload</p>
              </div>
            </div>
          )}
        </>
      )}
      {field.field_type === 'email' && (
        <Input
          type="email"
          placeholder="email@example.com"
          className="auth-input"
          disabled
        />
      )}
      {field.field_type === 'number' && (
        <Input
          type="number"
          placeholder="Enter number..."
          className="auth-input"
          disabled
        />
      )}
      {field.field_type === 'date' && (
        <Input type="date" className="auth-input" disabled />
      )}
      {field.field_type === 'select' && (
        <Select disabled>
          <SelectTrigger className="auth-input">
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
          {field.include_other && (
            <div className="flex items-center space-x-2">
              <Checkbox disabled />
              <Label className="text-sm font-normal">Other</Label>
            </div>
          )}
        </div>
      )}
        </>
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
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showCustomColorPicker, setShowCustomColorPicker] = useState(false);
  const [currentColor, setCurrentColor] = useState('#000000');
  const [savedSelection, setSavedSelection] = useState<Range | null>(null);
  const labelInputRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);
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
  const [inlineEditingFieldId, setInlineEditingFieldId] = useState<string | null>(null);

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
    fetchResponses(); // Fetch responses immediately to show count in tab
  }, [formId]);

  useEffect(() => {
    if (activeTab === 'responses') {
      fetchResponses(); // Refresh when tab is clicked
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
    isInitialMount.current = true; // Mark that we need to sync
  };

  // Sync content only on dialog open or field change
  useEffect(() => {
    if (isInitialMount.current && labelInputRef.current && isFieldDialogOpen) {
      labelInputRef.current.innerHTML = fieldForm.label;
      isInitialMount.current = false;
    }
  }, [isFieldDialogOpen, editingField?.id]);

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

  const handleInlineSaveField = async (fieldId: string, updates: Partial<FormField>) => {
    try {
      await FormService.updateField({
        id: fieldId,
        ...updates,
      });
      toast({
        title: 'Success',
        description: 'Field updated successfully',
      });
      await fetchForm();
    } catch (error) {
      console.error('Error updating field:', error);
      toast({
        title: 'Error',
        description: 'Failed to update field',
        variant: 'destructive',
      });
      throw error;
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

  // Helper functions for managing text selection in contentEditable
  const saveSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      setSavedSelection(selection.getRangeAt(0));
    }
  };

  const restoreSelection = () => {
    if (savedSelection) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(savedSelection);
      }
    }
  };

  const applyColorToSelection = (color: string) => {
    if (!labelInputRef.current) return;

    // Focus the input first
    labelInputRef.current.focus();

    // Restore the saved selection
    restoreSelection();

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      // Apply color to selected text
      document.execCommand('foreColor', false, color);
    } else {
      // No selection - just apply color for future typing
      document.execCommand('foreColor', false, color);
    }
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
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="responses">
              Responses ({responses.length})
            </TabsTrigger>
          </TabsList>

          {/* Build Tab */}
          <TabsContent value="build" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    {isEditingInfo ? (
                      <div className="space-y-3">
                        <div>
                          <Label className="text-sm text-gray-600">Form Name</Label>
                          <Input value={editedName} onChange={(e) => setEditedName(e.target.value)} className="auth-input text-2xl font-bold h-auto py-2" />
                        </div>
                        <div>
                          <Label className="text-sm text-gray-600">Description</Label>
                          <Textarea value={editedDescription} onChange={(e) => setEditedDescription(e.target.value)} rows={2} className="auth-input" />
                        </div>
                        <div className="flex items-center gap-4">
                          <div>
                            <Label className="text-sm text-gray-600">Status</Label>
                            <Select value={editedStatus} onValueChange={(value) => setEditedStatus(value as FormStatus)}>
                              <SelectTrigger className="auth-input w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="draft">Draft</SelectItem>
                                <SelectItem value="published">Published</SelectItem>
                                <SelectItem value="closed">Closed</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex gap-2 mt-5">
                            <Button variant="outline" size="sm" onClick={() => setIsEditingInfo(false)}>
                              Cancel
                            </Button>
                            <Button size="sm" onClick={handleSaveInfo} disabled={isSavingInfo} className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                              <Save className="h-4 w-4 mr-2" />
                              Save
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <CardTitle className="text-2xl">{form.name}</CardTitle>
                        {form.description && (
                          <p className="text-gray-600 mt-2">{form.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-3">
                          <Badge className={`${FormService.getStatusColor(form.status)} pointer-events-none`}>
                            {form.status.charAt(0).toUpperCase() + form.status.slice(1)}
                          </Badge>
                          <Button variant="ghost" size="sm" onClick={() => setIsEditingInfo(true)} className="text-gray-500 hover:text-gray-700 h-7">
                            <Edit className="h-3 w-3 mr-1" />
                            Edit Info
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  {totalPages > 1 && (
                    <div className="text-sm text-gray-500">
                      Page {currentPage} of {totalPages}
                    </div>
                  )}
                </div>

                {/* Page Navigation and Actions */}
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
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
                  <div className="flex gap-2">
                    <Button onClick={handleAddPage} variant="outline" size="sm" className="hover:opacity-90">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Page
                    </Button>
                    <Button
                      onClick={() => handleOpenFieldDialog()}
                      size="sm"
                      className="hover:opacity-90"
                      style={{ backgroundColor: '#3e8692', color: 'white' }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Field
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Thank You Page Section - Only show on last page */}
                {currentPage === totalPages && totalPages > 1 && (
                  <div className="mb-6 pb-6 border-b">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={form.enable_thank_you_page || false}
                        onCheckedChange={async (checked) => {
                          try {
                            await FormService.updateForm({
                              id: formId,
                              enable_thank_you_page: checked as boolean,
                            });
                            setForm(prev => prev ? { ...prev, enable_thank_you_page: checked as boolean } : null);
                            toast({
                              title: 'Success',
                              description: checked ? 'Thank you page enabled - submit button will appear on the previous page' : 'Thank you page disabled',
                            });
                          } catch (error) {
                            toast({
                              title: 'Error',
                              description: 'Failed to update thank you page setting',
                              variant: 'destructive',
                            });
                          }
                        }}
                      />
                      <div>
                        <Label className="text-base font-semibold">Make this a Thank You Page</Label>
                        <p className="text-sm text-gray-500">Submit form on previous page and show this page after submission</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-6">
                  {(() => {
                    const fieldsOnCurrentPage = form.fields
                      .filter(f => f.page_number === currentPage)
                      .sort((a, b) => a.display_order - b.display_order);

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
                          <div className="space-y-6">
                            {fieldsOnCurrentPage.map((field) => (
                              <SortableFieldItem
                                key={field.id}
                                field={field}
                                handleOpenFieldDialog={handleOpenFieldDialog}
                                handleDeleteField={handleDeleteField}
                                editingFieldId={inlineEditingFieldId}
                                setEditingFieldId={setInlineEditingFieldId}
                                onSaveField={handleInlineSaveField}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    );
                  })()}
                </div>

                {/* Page Navigation */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-8 pt-6 border-t">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage(prev => prev - 1)}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <div className="text-sm text-gray-600">
                      Page {currentPage} of {totalPages}
                    </div>
                    <Button
                      onClick={() => setCurrentPage(prev => prev + 1)}
                      disabled={currentPage === totalPages}
                      style={{ backgroundColor: '#3e8692', color: 'white' }}
                      className="hover:opacity-90"
                    >
                      {form.enable_thank_you_page
                        ? (currentPage === totalPages - 1 ? 'Submit' : currentPage === totalPages ? 'Done' : 'Next')
                        : (currentPage === totalPages ? 'Submit' : 'Next')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preview Tab */}
          <TabsContent value="preview" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl">{form.name}</CardTitle>
                    {form.description && (
                      <p className="text-gray-600 mt-2">{form.description}</p>
                    )}
                  </div>
                  {totalPages > 1 && (
                    <div className="text-sm text-gray-500">
                      Page {currentPage} of {totalPages}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {(() => {
                    const fieldsOnCurrentPage = form.fields
                      .filter(f => f.page_number === currentPage)
                      .sort((a, b) => a.display_order - b.display_order);

                    if (fieldsOnCurrentPage.length === 0) {
                      return (
                        <div className="text-center py-12 text-gray-500">
                          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No fields on this page</p>
                          <p className="text-sm mt-2">Add fields in the Build tab</p>
                        </div>
                      );
                    }

                    return fieldsOnCurrentPage.map((field) => {
                      // Render different field types
                      if (field.field_type === 'section') {
                        return (
                          <div key={field.id} className="border-b-2 border-gray-300 pb-2">
                            <div className="font-semibold text-gray-900" style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: field.label }} />
                          </div>
                        );
                      }

                      if (field.field_type === 'description') {
                        return (
                          <div key={field.id}>
                            <div className="text-gray-600" style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: field.label }} />
                          </div>
                        );
                      }

                      if (field.field_type === 'link') {
                        const linkUrl = field.options?.[0] || '';
                        return (
                          <div key={field.id} className="space-y-2">
                            {field.label && (
                              <div className="font-medium text-gray-900" dangerouslySetInnerHTML={{ __html: field.label }} style={{ whiteSpace: 'pre-wrap' }} />
                            )}
                            <div className="w-full border rounded-lg overflow-hidden bg-gray-50">
                              <iframe
                                src={linkUrl}
                                className="w-full"
                                style={{ height: '600px', border: 'none' }}
                                title={field.label?.replace(/<[^>]*>/g, '') || 'Embedded content'}
                                allowFullScreen
                              />
                            </div>
                          </div>
                        );
                      }

                      if (field.field_type === 'text' || field.field_type === 'email' || field.field_type === 'number') {
                        return (
                          <div key={field.id} className="space-y-2">
                            <Label>
                              <span dangerouslySetInnerHTML={{ __html: field.label }} style={{ whiteSpace: 'pre-wrap' }} />
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                            </Label>
                            {field.allow_multiple ? (
                              <div className="flex gap-2">
                                <Input
                                  type={field.field_type}
                                  placeholder={`Enter ${field.label.replace(/<[^>]*>/g, '').toLowerCase()}...`}
                                  className="auth-input flex-1"
                                  disabled
                                />
                                <Button
                                  type="button"
                                  style={{ backgroundColor: '#3e8692', color: 'white' }}
                                  className="hover:opacity-90"
                                  disabled
                                >
                                  +
                                </Button>
                              </div>
                            ) : (
                              <Input
                                type={field.field_type}
                                placeholder={`Enter ${field.label.replace(/<[^>]*>/g, '').toLowerCase()}...`}
                                className="auth-input"
                                disabled
                              />
                            )}
                            {field.allow_attachments && (
                              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center bg-gray-50">
                                <div className="flex items-center justify-center gap-2">
                                  <Upload className="w-4 h-4 text-gray-500" />
                                  <p className="text-sm text-gray-500">Drag files here or click to upload</p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }

                      if (field.field_type === 'textarea') {
                        return (
                          <div key={field.id} className="space-y-2">
                            <Label>
                              <span dangerouslySetInnerHTML={{ __html: field.label }} style={{ whiteSpace: 'pre-wrap' }} />
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                            </Label>
                            {field.allow_multiple ? (
                              <div className="flex gap-2">
                                <Textarea
                                  rows={4}
                                  placeholder={`Enter ${field.label.replace(/<[^>]*>/g, '').toLowerCase()}...`}
                                  className="auth-input flex-1"
                                  disabled
                                />
                                <Button
                                  type="button"
                                  style={{ backgroundColor: '#3e8692', color: 'white' }}
                                  className="hover:opacity-90"
                                  disabled
                                >
                                  +
                                </Button>
                              </div>
                            ) : (
                              <Textarea
                                rows={4}
                                placeholder={`Enter ${field.label.replace(/<[^>]*>/g, '').toLowerCase()}...`}
                                className="auth-input"
                                disabled
                              />
                            )}
                            {field.allow_attachments && (
                              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center bg-gray-50">
                                <div className="flex items-center justify-center gap-2">
                                  <Upload className="w-4 h-4 text-gray-500" />
                                  <p className="text-sm text-gray-500">Drag files here or click to upload</p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }

                      if (field.field_type === 'select') {
                        return (
                          <div key={field.id} className="space-y-2">
                            <Label>
                              <span dangerouslySetInnerHTML={{ __html: field.label }} style={{ whiteSpace: 'pre-wrap' }} />
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                            </Label>
                            <Select disabled>
                              <SelectTrigger className="auth-input">
                                <SelectValue placeholder="Select an option..." />
                              </SelectTrigger>
                              <SelectContent>
                                {field.options?.map((option, idx) => (
                                  <SelectItem key={idx} value={option}>{option}</SelectItem>
                                ))}
                                {field.include_other && (
                                  <SelectItem value="__OTHER__">Other</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      }

                      if (field.field_type === 'radio') {
                        return (
                          <div key={field.id} className="space-y-2">
                            <Label>
                              <span dangerouslySetInnerHTML={{ __html: field.label }} style={{ whiteSpace: 'pre-wrap' }} />
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                            </Label>
                            <div className="space-y-2">
                              {field.options?.map((option, idx) => (
                                <div key={idx} className="flex items-center space-x-2">
                                  <input type="radio" disabled className="h-4 w-4" />
                                  <Label className="text-sm font-normal">{option}</Label>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      if (field.field_type === 'checkbox') {
                        return (
                          <div key={field.id} className="space-y-2">
                            <Label>
                              <span dangerouslySetInnerHTML={{ __html: field.label }} style={{ whiteSpace: 'pre-wrap' }} />
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                            </Label>
                            <div className="space-y-2">
                              {field.options?.map((option, idx) => (
                                <div key={idx} className="flex items-center space-x-2">
                                  <Checkbox disabled />
                                  <Label className="text-sm font-normal">{option}</Label>
                                </div>
                              ))}
                              {field.include_other && (
                                <div className="flex items-center space-x-2">
                                  <Checkbox disabled />
                                  <Label className="text-sm font-normal">Other</Label>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      if (field.field_type === 'date') {
                        return (
                          <div key={field.id} className="space-y-2">
                            <Label>
                              <span dangerouslySetInnerHTML={{ __html: field.label }} style={{ whiteSpace: 'pre-wrap' }} />
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                            </Label>
                            <Input type="date" className="auth-input" disabled />
                          </div>
                        );
                      }

                      return null;
                    });
                  })()}
                </div>

                {/* Page Navigation */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-8 pt-6 border-t">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage(prev => prev - 1)}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <div className="text-sm text-gray-600">
                      Page {currentPage} of {totalPages}
                    </div>
                    <Button
                      onClick={() => setCurrentPage(prev => prev + 1)}
                      disabled={currentPage === totalPages}
                      style={{ backgroundColor: '#3e8692', color: 'white' }}
                      className="hover:opacity-90"
                    >
                      {form.enable_thank_you_page
                        ? (currentPage === totalPages - 1 ? 'Submit' : currentPage === totalPages ? 'Done' : 'Next')
                        : (currentPage === totalPages ? 'Submit' : 'Next')}
                    </Button>
                  </div>
                )}
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
                    <SelectItem value="link">Link</SelectItem>
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
                <div className="space-y-2">
                  <div className="flex gap-1 mb-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!labelInputRef.current) return;
                        labelInputRef.current.focus();
                        document.execCommand('bold', false);
                      }}
                      title="Bold"
                    >
                      <Bold className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!labelInputRef.current) return;
                        labelInputRef.current.focus();
                        document.execCommand('italic', false);
                      }}
                      title="Italic"
                    >
                      <Italic className="h-4 w-4" />
                    </Button>
                    <div className="relative">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          saveSelection();
                          setShowColorPicker(!showColorPicker);
                        }}
                        title="Text Color"
                      >
                        <Palette className="h-4 w-4" />
                      </Button>
                      {showColorPicker && !showCustomColorPicker && (
                        <div className="absolute top-full mt-1 left-0 z-50 bg-white border rounded-lg shadow-lg p-3 w-64">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium">Text Color</span>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowColorPicker(false)}
                              className="h-6 w-6 p-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-8 gap-2 mb-3">
                            {[
                              '#000000', '#374151', '#6B7280', '#9CA3AF',
                              '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
                              '#8B5CF6', '#EC4899', '#F97316', '#14B8A6',
                              '#84CC16', '#EAB308', '#06B6D4', '#6366F1',
                              '#FFFFFF', '#DC2626', '#EA580C', '#3e8692'
                            ].map((color) => (
                              <button
                                key={color}
                                type="button"
                                className="w-6 h-6 rounded border-2 hover:scale-110 transition-transform"
                                style={{
                                  backgroundColor: color,
                                  borderColor: color === '#FFFFFF' ? '#D1D5DB' : color
                                }}
                                onClick={() => {
                                  applyColorToSelection(color);
                                  setShowColorPicker(false);
                                }}
                              />
                            ))}
                            {/* Custom Color Button */}
                            <button
                              type="button"
                              className="w-6 h-6 rounded border-2 hover:scale-110 transition-transform relative"
                              style={{
                                background: 'linear-gradient(135deg, #FF0000 0%, #FF7F00 14%, #FFFF00 28%, #00FF00 42%, #0000FF 56%, #4B0082 70%, #9400D3 84%, #FF0000 100%)',
                                borderColor: '#D1D5DB'
                              }}
                              onClick={() => {
                                setShowCustomColorPicker(true);
                              }}
                              title="Custom Color Picker"
                            />
                          </div>
                        </div>
                      )}
                      {showColorPicker && showCustomColorPicker && (
                        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] bg-white rounded-lg shadow-xl p-4" style={{ width: '420px' }}>
                          <CustomColorPicker
                            isOpen={showCustomColorPicker}
                            onClose={() => {
                              setShowCustomColorPicker(false);
                              setShowColorPicker(false);
                            }}
                            onApply={(color) => {
                              applyColorToSelection(color);
                              setCurrentColor(color);
                              setShowCustomColorPicker(false);
                              setShowColorPicker(false);
                            }}
                            initialColor={currentColor}
                            presetColors={[
                              '#000000', '#374151', '#6B7280', '#9CA3AF',
                              '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
                              '#8B5CF6', '#EC4899', '#F97316', '#14B8A6',
                              '#84CC16', '#EAB308', '#06B6D4', '#6366F1',
                              '#FFFFFF', '#DC2626', '#EA580C', '#3e8692'
                            ]}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    ref={labelInputRef}
                    id="field-label-input"
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => {
                      const html = e.currentTarget.innerHTML;
                      setFieldForm(prev => ({ ...prev, label: html }));
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const text = e.clipboardData.getData('text/plain');
                      document.execCommand('insertText', false, text);
                    }}
                    className="auth-input p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#3e8692] overflow-auto"
                    style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                  />
                </div>
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
              {!['section', 'description', 'link'].includes(fieldForm.field_type) && (
                <div className="flex items-center gap-2">
                  <Checkbox checked={fieldForm.required} onCheckedChange={(checked) => setFieldForm(prev => ({ ...prev, required: checked as boolean }))} />
                  <Label>Required field</Label>
                </div>
              )}
              {fieldForm.field_type === 'link' && (
                <div>
                  <Label>URL</Label>
                  <Input
                    value={fieldForm.options[0] || ''}
                    onChange={(e) => setFieldForm(prev => ({ ...prev, options: [e.target.value] }))}
                    placeholder="https://example.com"
                    className="auth-input"
                    type="url"
                  />
                  <p className="text-xs text-gray-500 mt-1">The URL this link should point to</p>
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
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">Response Details</DialogTitle>
            </DialogHeader>
            {selectedResponse && (
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
                  {form?.fields
                    .sort((a, b) => a.display_order - b.display_order)
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
                              {field.field_type === 'file_upload' && attachments ? (
                                <div className="space-y-2">
                                  {Array.isArray(attachments) && attachments.length > 0 ? (
                                    attachments.map((url: string, idx: number) => (
                                      <a
                                        key={idx}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 text-blue-600 hover:text-blue-800 underline"
                                      >
                                        <Upload className="h-4 w-4" />
                                        Attachment {idx + 1}
                                      </a>
                                    ))
                                  ) : (
                                    <span className="text-gray-400 italic">No files uploaded</span>
                                  )}
                                </div>
                              ) : field.field_type === 'yes_no' ? (
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
                              ) : field.field_type === 'long_text' ? (
                                <p className="whitespace-pre-wrap bg-gray-50 p-3 rounded border border-gray-200">
                                  {value || <span className="text-gray-400 italic">No response</span>}
                                </p>
                              ) : (
                                <p className="font-medium">
                                  {value || <span className="text-gray-400 italic">No response</span>}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
  );
}
