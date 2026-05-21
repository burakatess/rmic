'use client';

import React, { useState } from 'react';

/* ============================================
   TABS — Quaresma + Aboubakar
   Horizontal tab navigation
   ============================================ */

interface Tab {
  key: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className = '' }: TabsProps) {
  return (
    <div className={`border-b border-slate-200 ${className}`}>
      <nav className="flex gap-0 -mb-px">
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={`
                flex items-center gap-2 px-4 py-2.5 text-sm font-medium
                border-b-2 transition-all duration-150
                ${isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }
              `}
            >
              {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`
                  px-1.5 py-0.5 text-xs font-medium rounded-full
                  ${isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}
                `}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default Tabs;
