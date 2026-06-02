import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Default card surface — v11 design system (2026-06-01).
 *
 * Was: rounded-lg + cool gray border (HSL) + bg-card + shadow-sm.
 * Now: rounded-[14px] + cream-200 warm hairline + bg-white +
 *      warm-tinted shadow + 1px inset top highlight that catches light
 *      (makes the surface feel like cardstock instead of CSS).
 *
 * Pages that explicitly override shadow / border / radius still win —
 * only the DEFAULT changes. The 100+ existing Card usages across the
 * app inherit the warmth automatically.
 *
 * Set `data-feature="true"` on the Card to render the brand-tinted
 * feature variant instead — used for hero metrics, "action needed"
 * surfaces, featured engagement cards.
 */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { 'data-feature'?: boolean }
>(({ className, ...props }, ref) => {
  const isFeature = (props as any)['data-feature'] === true;
  return (
    <div
      ref={ref}
      className={cn(
        // overflow-hidden is part of the default so child elements with
        // their own bg (like TableRow header rows with bg-cream-50/80,
        // or borders inside CardHeaderEditorial) clip cleanly to the
        // rounded corners. Pages no longer need to remember to add it.
        isFeature
          ? 'crd-feature overflow-hidden'
          : 'rounded-[14px] border border-cream-200 bg-white text-card-foreground shadow-card overflow-hidden',
        className
      )}
      {...props}
    />
  );
});
Card.displayName = 'Card';

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-2xl font-semibold leading-none tracking-tight',
      className
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
