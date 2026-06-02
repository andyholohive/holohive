/**
 * v11 design system (2026-06-02): structural skeletons for the
 * Priority Dashboard tabs. Each helper mirrors the shape of the real
 * content (section header → card title bar → rows/cells) so the
 * loading state reads as "this is loading" rather than "this is broken."
 *
 * Pieces here are deliberately small + composable so each tab can
 * assemble its own skeleton layout. Tabs import the parts they need
 * and arrange them with the same outer `space-y-8` / inner `space-y-4`
 * rhythm as the real content.
 */

import { Skeleton } from '@/components/ui/skeleton';

/** Mimics the chapter-style section header (top border + label + counter). */
export function SectionHeaderSkeleton({ first = false }: { first?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${first ? '' : 'border-t border-cream-200 pt-[18px]'} mb-5`}>
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-cream-200/70" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-2.5 w-32" />
    </div>
  );
}

/** Mirrors the KpiCard layout: label + icon row, big number, sub line. */
export function KpiCardSkeleton() {
  return (
    <div className="bg-white rounded-[14px] border border-cream-200 p-5 shadow-card overflow-hidden">
      <div className="flex items-start justify-between gap-2 mb-3">
        <Skeleton className="h-2.5 w-16" />
        <div className="h-8 w-8 rounded-md bg-cream-100" />
      </div>
      <Skeleton className="h-7 w-20 mb-2" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

/** Mirrors the editorial card header (title + subtitle). */
export function CardHeaderSkeleton() {
  return (
    <div className="px-5 py-4 border-b border-cream-100">
      <Skeleton className="h-5 w-40 mb-2" />
      <Skeleton className="h-3 w-56" />
    </div>
  );
}

/** A skeleton table row at the mockup's py-3.5 px-5 rhythm. */
export function TableRowSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <div className="border-b border-cream-100 last:border-b-0 flex items-center py-3.5 px-5 gap-4">
      <div className="flex items-center gap-2.5 flex-1">
        <div className="w-7 h-7 rounded-md bg-cream-200/70 shrink-0 animate-pulse" />
        <div className="space-y-1.5 min-w-0">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2 w-16" />
        </div>
      </div>
      {Array.from({ length: cols - 1 }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-12 shrink-0" />
      ))}
    </div>
  );
}

/** A full table skeleton — header row + N body rows + editorial card header. */
export function TableCardSkeleton({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-[14px] border border-cream-200 shadow-card overflow-hidden">
      <CardHeaderSkeleton />
      <div className="bg-cream-50/80 border-b border-cream-200 py-2.5 px-5 flex items-center gap-4">
        <Skeleton className="h-2.5 w-16 flex-1" />
        {Array.from({ length: cols - 1 }).map((_, i) => (
          <Skeleton key={i} className="h-2.5 w-12 shrink-0" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} cols={cols} />
      ))}
    </div>
  );
}

/** A list-card skeleton — editorial header + N short rows (for sidebar cards). */
export function ListCardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-[14px] border border-cream-200 shadow-card overflow-hidden">
      <CardHeaderSkeleton />
      <div className="divide-y divide-cream-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-5 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-4 h-4 rounded-full bg-cream-200/70 animate-pulse shrink-0" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-5 w-16 rounded-md shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
