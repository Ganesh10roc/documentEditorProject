import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-10 w-full rounded-lg border bg-[var(--surface)] px-3 text-sm",
      "text-[var(--text)] placeholder:text-[var(--text-muted)]",
      "focus-visible:outline-2 focus-visible:outline-offset-1",
      "disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "text-sm font-medium text-[var(--text)] mb-1.5 block",
      className
    )}
    {...props}
  />
));
Label.displayName = "Label";
