"use client";
import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-muted transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:border-transparent disabled:opacity-50 aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(base, "h-10", className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(base, "min-h-20 py-2", className)} {...p} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(base, "h-10 pr-8", className)} {...p} />
));
Select.displayName = "Select";

type FieldControlProps = { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean };

/** Label + control + hint/error with correct aria wiring. */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: (props: FieldControlProps) => React.ReactNode }) {
  const id = useId();
  const descId = hint || error ? `${id}-desc` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children({ id, "aria-describedby": descId, "aria-invalid": error ? true : undefined })}
      {(hint || error) && (
        <p id={descId} className={cn("text-xs", error ? "text-danger" : "text-muted")} role={error ? "alert" : undefined}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
