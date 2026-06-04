'use client';

/**
 * SortableTableRow — DnD sortable-item wrapper for table rows.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx`. Renders a
 * `<TableRow>` with a leading grip-handle `<TableCell>` (h-10 wide)
 * that captures the drag listeners. Body cells come in as children.
 *
 * Differences from `SortableCard`:
 *  - Uses `CSS.Translate` (not `Transform`) so column widths don't
 *    collapse mid-drag.
 *  - Bumps `zIndex` while dragging so the row floats above siblings.
 *  - Adds a `bg-blue-50` + `shadow-lg` while dragging for visual
 *    feedback. (Kept the blue tint deliberately — flagged as a
 *    follow-up; the v11 pass over this folder will swap to brand-soft
 *    once the table view itself is migrated.)
 *
 * `onClick` is bubbled to the row, but the grip handle calls
 * `e.stopPropagation()` so grabbing the handle never triggers a row
 * navigation.
 */

import { TableRow, TableCell } from '@/components/ui/table';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface SortableTableRowProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function SortableTableRow({ id, children, className, onClick }: SortableTableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 1 : 0,
  };
  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={`${className || ''} ${isDragging ? 'bg-blue-50 shadow-lg' : ''}`}
      onClick={onClick}
    >
      <TableCell className="w-10">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-cream-100 rounded"
          onClick={e => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-ink-warm-400" />
        </div>
      </TableCell>
      {children}
    </TableRow>
  );
}
