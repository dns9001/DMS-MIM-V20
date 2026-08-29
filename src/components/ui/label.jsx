import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const labelVariants = cva(
  "text-xs font-bold tracking-tight text-slate-700 leading-none select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1.5"
);

const Label = React.forwardRef(({ className, required, optional, children, hint, ...props }, ref) => (
  <div className="flex items-center justify-between gap-2 mb-1.5">
    <LabelPrimitive.Root
      ref={ref}
      className={cn(labelVariants(), className)}
      {...props}
    >
      <span>{children}</span>
      {required && (
        <span className="text-rose-500 font-bold text-xs" title="Wajib diisi">
          *
        </span>
      )}
      {optional && (
        <span className="text-[10px] font-normal text-slate-400">
          (opsional)
        </span>
      )}
    </LabelPrimitive.Root>
    {hint && (
      <span className="text-[11px] font-normal text-slate-400">
        {hint}
      </span>
    )}
  </div>
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
