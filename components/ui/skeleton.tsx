import { cn } from '@/lib/utils';

/**
 * v11 design system (2026-06-02): warm-tinted skeleton.
 * Was `bg-muted` (cool gray HSL). Now uses cream-200 for a warm
 * shimmer that matches the rest of the chrome — loading states no
 * longer clash visually with the surrounding cream surfaces.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-cream-200/70', className)}
      {...props}
    />
  );
}

export { Skeleton };
