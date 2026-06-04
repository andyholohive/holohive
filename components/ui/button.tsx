import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // [2026-06-03] `hover:text-accent-foreground` removed from
        // both `outline` and `ghost` variants. Per Andy: "the action
        // buttons all change font color when hovering. Can you fix
        // this for all existing pages so that this never happens?".
        // The `hover:bg-accent` tint is the hover affordance; the
        // text should stay stable so the user's eye doesn't track a
        // flicker between text colors. Pages that previously layered
        // an inline `hover:text-X` to *override* this baked-in shift
        // had it stripped in the same audit — those overrides are now
        // unnecessary, and any future page that wants a hover text
        // color should add it explicitly rather than getting it
        // surprise-by-default.
        outline:
          'border border-input bg-background hover:bg-accent',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent',
        link: 'text-primary underline-offset-4 hover:underline',
        // [Design system, May 2026] HoloHive brand teal CTA. Replaces
        // the 264 inline `style={{ backgroundColor: '#3e8692' }}` hex
        // hacks scattered across the codebase. Use `<Button variant="brand">`
        // for primary "Start Client", "Add Project", "Save Campaign"
        // style actions — anywhere the brand color was previously
        // applied via inline style.
        //
        // [v11 refinement, 2026-06-01] Now uses the `.btn-brand` utility:
        // 4-layer shadow (inner top highlight + inner bottom + outer drop +
        // hairline edge) over a subtle vertical gradient so the button feels
        // like a real pressable material instead of a flat fill. Keeps
        // `bg-brand text-white` so any code reading the rendered color
        // still sees the brand teal as a fallback under the gradient.
        brand: 'btn-brand bg-brand text-white',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
