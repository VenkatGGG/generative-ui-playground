import * as React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    const fallbackId = React.useId();
    const resolvedId = id ?? fallbackId;

    return (
      <label
        htmlFor={resolvedId}
        className={cn("inline-flex cursor-pointer items-center gap-2 text-sm", className)}
      >
        <input
          id={resolvedId}
          ref={ref}
          type="checkbox"
          className="h-4 w-4 rounded border border-input bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          {...props}
        />
        {label ? <span>{label}</span> : null}
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
