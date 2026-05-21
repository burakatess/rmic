'use client';

import React from 'react';

/* ============================================
   PAGE HEADER — Quaresma + Aboubakar
   Standard page header with breadcrumb & actions
   ============================================ */

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  badge,
  className = '',
}: PageHeaderProps) {
  return (
    <div className={`mb-6 ${className}`}>
      {/* Breadcrumb */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
              {crumb.href ? (
                <a href={crumb.href} className="hover:text-blue-600 transition-colors">
                  {crumb.label}
                </a>
              ) : (
                <span className="text-slate-600 font-medium">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h1>
            {badge}
          </div>
          {description && (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          )}
        </div>

        {/* Actions */}
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export default PageHeader;
