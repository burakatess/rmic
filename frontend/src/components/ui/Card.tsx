'use client';

import React from 'react';

/* ============================================
   CARD — Quaresma + Aboubakar
   Container card component
   ============================================ */

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export function Card({ children, className = '', hover = false, padding = 'none' }: CardProps) {
  return (
    <div
      className={`
        bg-white rounded-xl border border-slate-200 shadow-sm
        ${hover ? 'card-hover' : ''}
        ${paddingClasses[padding]}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', actions }: CardHeaderProps) {
  return (
    <div className={`flex items-center justify-between px-5 py-4 border-b border-slate-100 ${className}`}>
      <div className="flex-1 min-w-0">{children}</div>
      {actions && <div className="flex items-center gap-2 ml-4 flex-shrink-0">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, className = '' }: CardBodyProps) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

export default Card;
