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
import { FieldOptionsService, FieldOption, CreateFieldOptionData } from '@/lib/fieldOptionsService';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, GripVertical } from 'lucide-react';
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
        {new Date(option.created_at).toLocaleDateString()}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onToggleActive(option)}
            className="hover:opacity-90"
          >
            {option.is_active ? 'Deactivate' : 'Activate'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(option.id)}
            className="hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
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
          title: 'Error',
          description: 'Failed to reorder options',
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
          title: 'Error',
          description: 'Option value is required',
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
      
      toast({
        title: 'Success',
        description: 'Field option added successfully',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to add field option',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateOption = async (id: string, updateData: { option_value: string; display_order: number }) => {
    try {
      await FieldOptionsService.updateFieldOption(id, updateData);
      await fetchFieldOptions();
      
      toast({
        title: 'Success',
        description: 'Field option updated successfully',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to update field option',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteOption = async (id: string) => {
    try {
      await FieldOptionsService.deleteFieldOption(id);
      await fetchFieldOptions();
      
      toast({
        title: 'Success',
        description: 'Field option deleted successfully',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to delete field option',
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
        title: 'Success',
        description: `Field option ${option.is_active ? 'deactivated' : 'activated'} successfully`,
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to update field option status',
        variant: 'destructive',
      });
    }
  };

  const inHouseOptions = fieldOptions
    .filter(option => option.field_name === 'in_house')
    .sort((a, b) => a.display_order - b.display_order);

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Field Options Management</h2>
          <p className="text-gray-600 mt-2">Manage dynamic dropdown options for KOL fields</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: '#3e8692', color: 'white' }} className="hover:opacity-90">
              <Plus className="h-4 w-4 mr-2" />
              Add Option
            </Button>
          </DialogTrigger>
          <DialogContent>
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
                  className="auth-input"
                />
              </div>
              <div>
                <Label htmlFor="option_value">Option Value</Label>
                <Input
                  id="option_value"
                  value={newOption.option_value}
                  onChange={(e) => setNewOption(prev => ({ ...prev, option_value: e.target.value }))}
                  placeholder="e.g., Yes, No, Contractor"
                  className="auth-input"
                />
              </div>
              <div>
                <Label htmlFor="display_order">Display Order</Label>
                <Input
                  id="display_order"
                  type="number"
                  value={newOption.display_order}
                  onChange={(e) => setNewOption(prev => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
                  className="auth-input"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddOption} style={{ backgroundColor: '#3e8692', color: 'white' }} className="hover:opacity-90">
                Add Option
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
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
                  <TableHead className="text-right">Actions</TableHead>
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
            <div className="text-center py-8 text-gray-500">
              No field options found. Add your first option to get started.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
