'use client';

/**
 * DroppableColumn — DnD drop target wrapper.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was at the top of
 * the file as the first of three DnD helpers). No state dependencies;
 * pure presentational wrapper around `useDroppable` from @dnd-kit/core.
 *
 * Drop-target highlight: brand teal (was `ring-blue-400` before
 * 2026-05-06). Brand color is the right semantic here — drag-drop is
 * an active app interaction, not a category indicator.
 */

import { useDroppable } from '@dnd-kit/core';

interface DroppableColumnProps {
  id: string;
  children: React.ReactNode;
  className?: string;
}

export function DroppableColumn({ id, children, className }: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? 'ring-2 ring-brand ring-offset-2' : ''}`}>
      {children}
    </div>
  );
}
