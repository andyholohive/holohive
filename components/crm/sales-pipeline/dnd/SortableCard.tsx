'use client';

/**
 * SortableCard — DnD sortable-item wrapper for kanban cards.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx`. No state
 * dependencies; thin wrapper around `useSortable` that applies the
 * standard transform/transition + half-opacity-while-dragging pattern.
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableCardProps {
  id: string;
  children: React.ReactNode;
}

export function SortableCard({ id, children }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}
