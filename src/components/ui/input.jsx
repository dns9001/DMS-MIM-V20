import * as React from "react";
import { cn } from "../../lib/utils";

const Input = React.forwardRef(
  (
    {
      className,
      type,
      leftIcon,
      rightIcon,
      icon,
      error,
      helperText,
      required,
      sizeVariant = "default",
      ...props
    },
    ref
  ) => {
    const activeLeftIcon = leftIcon || icon;

    const sizeClasses = {
      sm: "h-8 px-2.5 py-1 text-xs rounded-lg",
      default: "h-10 px-3.5 py-2 text-sm rounded-xl",
      lg: "h-12 px-4 py-2.5 text-base rounded-2xl",
    };

    const baseInput = (
      <input
        type={type}
        required={required}
        className={cn(
          "w-full bg-white text-slate-900 font-medium placeholder:text-slate-400 placeholder:font-normal border border-slate-200/90 shadow-2xs transition-all duration-150 ease-in-out",
          "hover:border-slate-300 hover:bg-slate-50/40",
          "focus:border-navy focus:bg-white focus:outline-hidden focus:ring-3 focus:ring-navy/10 focus:shadow-xs",
          "disabled:cursor-not-allowed disabled:bg-slate-100/80 disabled:text-slate-400 disabled:border-slate-200 disabled:shadow-none",
          "read-only:bg-slate-50/70 read-only:border-slate-200 read-only:cursor-default",
          error &&
            "border-rose-400 bg-rose-50/30 text-rose-900 placeholder:text-rose-300 focus:border-rose-500 focus:ring-rose-500/15",
          sizeClasses[sizeVariant] || sizeClasses.default,
          activeLeftIcon && (sizeVariant === "sm" ? "pl-8" : sizeVariant === "lg" ? "pl-11" : "pl-10"),
          rightIcon && (sizeVariant === "sm" ? "pr-8" : sizeVariant === "lg" ? "pr-11" : "pr-10"),
          className
        )}
        ref={ref}
        {...props}
      />
    );

    if (!activeLeftIcon && !rightIcon && !helperText && (typeof error !== "string" || !error)) {
      return baseInput;
    }

    return (
      <div className="w-full space-y-1">
        <div className="relative flex items-center w-full">
          {activeLeftIcon && (
            <div
              className={cn(
                "absolute left-3 flex items-center justify-center pointer-events-none text-slate-400 transition-colors",
                error && "text-rose-500"
              )}
            >
              {activeLeftIcon}
            </div>
          )}
          {baseInput}
          {rightIcon && (
            <div
              className={cn(
                "absolute right-3 flex items-center justify-center text-slate-400",
                error && "text-rose-500"
              )}
            >
              {rightIcon}
            </div>
          )}
        </div>
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
Input.displayName = "Input";

export { Input };
