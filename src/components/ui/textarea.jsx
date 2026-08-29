import * as React from "react";
import { cn } from "../../lib/utils";

const Textarea = React.forwardRef(
  ({ className, error, helperText, required, ...props }, ref) => {
    const baseTextarea = (
      <textarea
        required={required}
        className={cn(
          "flex min-h-[84px] w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 shadow-2xs placeholder:text-slate-400 placeholder:font-normal transition-all duration-150 ease-in-out resize-y",
          "hover:border-slate-300 hover:bg-slate-50/40",
          "focus:border-navy focus:bg-white focus:outline-hidden focus:ring-3 focus:ring-navy/10 focus:shadow-xs",
          "disabled:cursor-not-allowed disabled:bg-slate-100/80 disabled:text-slate-400 disabled:border-slate-200",
          "read-only:bg-slate-50/70 read-only:border-slate-200",
          error &&
            "border-rose-400 bg-rose-50/30 text-rose-900 placeholder:text-rose-300 focus:border-rose-500 focus:ring-rose-500/15",
          className
        )}
        ref={ref}
        {...props}
      />
    );

    if (!helperText && (typeof error !== "string" || !error)) {
      return baseTextarea;
    }

    return (
      <div className="w-full space-y-1">
        {baseTextarea}
        {typeof error === "string" && error && (
          <p className="text-[11px] font-medium text-rose-600 flex items-center gap-1 pl-1">
            <span>•</span> {error}
          </p>
        )}
        {helperText && !error && (
          <p className="text-[11px] text-slate-500 pl-1">{helperText}</p>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
