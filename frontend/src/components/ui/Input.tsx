"use client";

import { forwardRef, useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/15 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50";

interface FieldWrapperProps {
  label?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  id?: string;
  required?: boolean;
}

function FieldWrapper({ label, error, hint, children, id, required }: FieldWrapperProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={fieldId} className="text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  /** Ícone decorativo à esquerda do campo (ex.: Mail, Lock). */
  leadingIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, id, required, leadingIcon, ...rest },
  ref,
) {
  return (
    <FieldWrapper label={label} error={error} hint={hint} id={id} required={required}>
      <div className="relative">
        {leadingIcon && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          >
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          required={required}
          className={cn(
            fieldBase,
            "h-11",
            Boolean(leadingIcon) && "pl-10",
            error && "border-red-400 focus:border-red-500 focus:ring-red-500/15",
            className,
          )}
          {...rest}
        />
      </div>
    </FieldWrapper>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, className, id, required, rows = 3, ...rest },
  ref,
) {
  return (
    <FieldWrapper label={label} error={error} hint={hint} id={id} required={required}>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        required={required}
        className={cn(fieldBase, "py-2.5", error && "border-red-400 focus:border-red-500", className)}
        {...rest}
      />
    </FieldWrapper>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, className, id, required, children, ...rest },
  ref,
) {
  return (
    <FieldWrapper label={label} error={error} hint={hint} id={id} required={required}>
      <select
        ref={ref}
        id={id}
        required={required}
        className={cn(fieldBase, "h-11 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2364748b%22%20stroke-width%3D%222.5%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[right_0.9rem_center] bg-no-repeat pr-10", error && "border-red-400", className)}
        {...rest}
      >
        {children}
      </select>
    </FieldWrapper>
  );
});
