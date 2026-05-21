'use client';

import React from 'react';

/* ============================================
   INPUT — Quaresma + Aboubakar
   Form input component
   ============================================ */

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
}

export function Input({
  label,
  error,
  hint,
  leftIcon,
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1">
          {label}
          {props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          className={`
            w-full h-9 px-3 bg-white border rounded-lg text-sm text-slate-800
            placeholder-slate-400 transition-all duration-150
            focus:outline-none focus:ring-2 focus:ring-blue-100
            disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed
            ${leftIcon ? 'pl-9' : ''}
            ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400'}
            ${className}
          `}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/* ============================================
   TEXTAREA — Quaresma + Aboubakar
   ============================================ */

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Textarea({
  label,
  error,
  hint,
  className = '',
  id,
  ...props
}: TextareaProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1">
          {label}
          {props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <textarea
        id={inputId}
        className={`
          w-full px-3 py-2 bg-white border rounded-lg text-sm text-slate-800
          placeholder-slate-400 transition-all duration-150 resize-y min-h-[80px]
          focus:outline-none focus:ring-2 focus:ring-blue-100
          disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed
          ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400'}
          ${className}
        `}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/* ============================================
   SELECT — Quaresma + Aboubakar
   ============================================ */

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

export function Select({
  label,
  error,
  hint,
  options,
  placeholder = 'Seçiniz...',
  className = '',
  id,
  ...props
}: SelectProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1">
          {label}
          {props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <select
        id={inputId}
        className={`
          w-full h-9 px-3 bg-white border rounded-lg text-sm text-slate-800
          transition-all duration-150 cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-blue-100
          disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed
          ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400'}
          ${className}
        `}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export default Input;
