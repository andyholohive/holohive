'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { FieldOptionsService, FieldOption, CreateFieldOptionData } from '@/lib/fieldOptionsService';
import { formatDate } from '@/lib/dateFormat';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, GripVertical, Sliders, MoreHorizontal, Power, PowerOff } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable row component
interface SortableRowProps {
  option: FieldOption;
  onToggleActive: (option: FieldOption) => void;
  onDelete: (id: string) => void;
}

function SortableRow({ option, onToggleActive, onDelete }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: option.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-12">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
          <GripVertical className="h-5 w-5" />
        </div>
      </TableCell>
      <TableCell className="font-medium">{option.option_value}</TableCell>
      <TableCell>{option.display_order}</TableCell>
      <TableCell>
        <Badge variant={option.is_active ? 'default' : 'secondary'} style={option.is_active ? { backgroundColor: '#3e8692' } : {}}>
          {option.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </TableCell>
      <TableCell>
        {formatDate(option.created_at)}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={(e) => e.stopPropagation()}
              aria-label="Field option actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => onToggleActive(option)}>
              {option.is_active ? (
                <><PowerOff className="h-3.5 w-3.5 mr-2" /> Deactivate</>
              ) : (
                <><Power className="h-3.5 w-3.5 mr-2" /> Activate</>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(option.id)}
              className="text-rose-600 focus:text-rose-600"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export default function FieldOptionsPage() {
  const [fieldOptions, setFieldOptions] = useState<FieldOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<FieldOption | null>(null);
  const [newOption, setNewOption] = useState<CreateFieldOptionData>({
    field_name: 'in_house',
    option_value: '',
    display_order: 0
  });
  const { toast } = useToast();

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchFieldOptions();
  }, []);

  const fetchFieldOptions = async () => {
    try {
      setLoading(true);
      const options = await FieldOptionsService.getAllFieldOptions();
      setFieldOptions(options);
    } catch (err) {
      setError('Failed to fetch field options');
      console.error('Error fetching field options:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    if (active.id !== over.id) {
      const oldIndex = inHouseOptions.findIndex(o => o.id === active.id);
      const newIndex = inHouseOptions.findIndex(o => o.id === over.id);

      const reorderedOptions = arrayMove(inHouseOptions, oldIndex, newIndex);

      // Optimistically update local state
      const updatedOptions = reorderedOptions.map((opt, index) => ({
        ...opt,
        display_order: index + 1
      }));

      // Create a map for faster lookup
      const updatedMap = new Map(updatedOptions.map(opt => [opt.id, opt]));

      setFieldOptions(prev =>
        prev.map(opt => {
          // If this option was reordered, use the updated version
          if (updatedMap.has(opt.id)) {
            return updatedMap.get(opt.id)!;
          }
          // Otherwise keep the original
          return opt;
        })
      );

      // Save to database in background
      try {
        await FieldOptionsService.reorderFieldOptions(
          'in_house',
          reorderedOptions.map(o => o.id)
        );
      } catch (error) {
        console.error('Error reordering options:', error);
        toast({
          title: 'Reorder failed',
          description: error instanceof Error ? error.message : 'Failed to reorder options',
          variant: 'destructive',
        });
        // Revert by fetching from server
        await fetchFieldOptions();
      }
    }
  };

  const handleAddOption = async () => {
    try {
      if (!newOption.option_value.trim()) {
        toast({
          title: 'Option value required',
          variant: 'destructive',
        });
        return;
      }

      await FieldOptionsService.createFieldOption(newOption);
      await fetchFieldOptions();
      setIsAddDialogOpen(false);
      setNewOption({
        field_name: 'in_house',
        option_value: '',
        display_order: 0
      });
      
      toast({ title: 'Field option added' });
    } catch (err) {
      toast({
        title: 'Add failed',
        description: err instanceof Error ? err.message : 'Failed to add field option',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateOption = async (id: string, updateData: { option_value: string; display_order: number }) => {
    try {
      await FieldOptionsService.updateFieldOption(id, updateData);
      await fetchFieldOptions();

      toast({ title: 'Field option updated' });
    } catch (err) {
      toast({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Failed to update field option',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteOption = async (id: string) => {
    try {
      await FieldOptionsService.deleteFieldOption(id);
      await fetchFieldOptions();

      toast({ title: 'Field option deleted' });
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Failed to delete field option',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (option: FieldOption) => {
    try {
      await FieldOptionsService.updateFieldOption(option.id, {
        is_active: !option.is_active
      });
      await fetchFieldOptions();

      toast({
        title: option.is_active ? 'Field option deactivated' : 'Field option activated',
      });
    } catch (err) {
      toast({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Failed to update field option status',
        variant: 'destructive',
      });
    }
  };

  const inHouseOptions = fieldOptions
    .filter(option => option.field_name === 'in_house')
    .sort((a, b) => a.display_order - b.display_order);

  if (loading) {
    // Canonical page-shell wrapper (audit 2026-05-06): just space-y-6.
    // The Sidebar layout already provides bg-gray-50 + min-h.
    return (
      <div className="space-y-6">
        <PageHeader
          icon={Sliders}
          title="Field Options"
          subtitle="Manage dynamic dropdown options for KOL fields"
        />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
          <PageHeader
            icon={Sliders}
            title="Field Options"
            subtitle="Manage dynamic dropdown options for KOL fields"
            actions={(
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="brand">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Option
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add New Field Option</DialogTitle>
                  <DialogDescription>
                    Add a new option for the in-house field dropdown.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="field_name">Field Name</Label>
                    <Input
                      id="field_name"
                      value={newOption.field_name}
                      onChange={(e) => setNewOption(prev => ({ ...prev, field_name: e.target.value }))}
                      disabled
                      className="focus-brand"
                    />
                  </div>
                  <div>
                    <Label htmlFor="option_value">Option Value</Label>
                    <Input
                      id="option_value"
                      value={newOption.option_value}
                      onChange={(e) => setNewOption(prev => ({ ...prev, option_value: e.target.value }))}
                      placeholder="e.g., Yes, No, Contractor"
                      className="focus-brand"
                    />
                  </div>
                  <div>
                    <Label htmlFor="display_order">Display Order</Label>
                    <Input
                      id="display_order"
                      type="number"
                      value={newOption.display_order}
                      onChange={(e) => setNewOption(prev => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
                      className="focus-brand"
                    />
                  </div>
                </div>
                <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="brand" onClick={handleAddOption}>
                    Add Option
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            )}
          />

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>In-House Field Options</CardTitle>
              <CardDescription>
                Manage the dropdown options for the in-house field. These options will appear in the KOLs table and forms.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Option Value</TableHead>
                      <TableHead>Display Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right w-16">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <SortableContext
                    items={inHouseOptions.map(o => o.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <TableBody>
                      {inHouseOptions.map((option) => (
                        <SortableRow
                          key={option.id}
                          option={option}
                          onToggleActive={handleToggleActive}
                          onDelete={handleDeleteOption}
                        />
                      ))}
                    </TableBody>
                  </SortableContext>
                </Table>
              </DndContext>

              {inHouseOptions.length === 0 && (
                <EmptyState
                  icon={Sliders}
                  title="No field options yet."
                  description="Add your first option to get started."
                  className="py-8"
                />
              )}
            </CardContent>
          </Card>
    </div>
  );
}
