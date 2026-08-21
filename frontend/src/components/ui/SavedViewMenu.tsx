'use client';

import React, { useState, useRef, useEffect } from 'react';

/* ============================================
   SAVED VIEW MENU — Design System v2
   Tablo görünümü kaydetme (filtre + kolon + sıralama).
   İlk aşama: localStorage (backend yok).
   Şema versiyonlu: { v: 1, name, payload }
   ============================================ */

export interface SavedView {
  v: 1;
  name: string;
  /** Sayfanın kendi filtre/sıralama/kolon state snapshot'ı */
  payload: Record<string, unknown>;
}

const storageKeyFor = (key: string) => `table-views-${key}`;

export function loadSavedViews(storageKey: string): SavedView[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKeyFor(storageKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => v && v.v === 1 && v.name) : [];
  } catch {
    return [];
  }
}

function persistViews(storageKey: string, views: SavedView[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKeyFor(storageKey), JSON.stringify(views));
}

interface SavedViewMenuProps {
  storageKey: string;
  /** Kaydetme anında mevcut görünüm snapshot'ını döndürür */
  getPayload: () => Record<string, unknown>;
  /** Seçilen görünümün snapshot'ını uygular */
  onApply: (payload: Record<string, unknown>) => void;
  className?: string;
}

export function SavedViewMenu({ storageKey, getPayload, onApply, className = '' }: SavedViewMenuProps) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [activeView, setActiveView] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setViews(loadSavedViews(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSaving(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const saveView = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next: SavedView[] = [
      ...views.filter((v) => v.name !== trimmed),
      { v: 1, name: trimmed, payload: getPayload() },
    ];
    setViews(next);
    persistViews(storageKey, next);
    setActiveView(trimmed);
    setName('');
    setSaving(false);
  };

  const deleteView = (viewName: string) => {
    const next = views.filter((v) => v.name !== viewName);
    setViews(next);
    persistViews(storageKey, next);
    if (activeView === viewName) setActiveView(null);
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer
          ${activeView ? 'text-blue-700 bg-blue-50 hover:bg-blue-100' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        {activeView ? `Görünüm: ${activeView}` : 'Görünümler'}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-64 bg-white border border-slate-200 rounded-xl shadow-lg py-2">
          <p className="px-3 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-100 mb-1">
            Kaydedilmiş Görünümler
          </p>

          {views.length === 0 && !saving && (
            <p className="px-3 py-2 text-xs text-slate-400">Henüz kayıtlı görünüm yok</p>
          )}

          {views.map((view) => (
            <div key={view.name} className="flex items-center group">
              <button
                type="button"
                onClick={() => {
                  onApply(view.payload);
                  setActiveView(view.name);
                  setOpen(false);
                }}
                className={`flex-1 text-left px-3 py-1.5 text-xs transition-colors cursor-pointer truncate
                  ${activeView === view.name ? 'text-blue-700 font-semibold bg-blue-50' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                {view.name}
              </button>
              <button
                type="button"
                onClick={() => deleteView(view.name)}
                aria-label={`${view.name} görünümünü sil`}
                className="px-2 py-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}

          <div className="border-t border-slate-100 mt-1 pt-1.5 px-3">
            {saving ? (
              <div className="flex items-center gap-1.5 py-1">
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveView()}
                  placeholder="Görünüm adı..."
                  className="flex-1 min-w-0 h-7 px-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={saveView}
                  className="h-7 px-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors cursor-pointer"
                >
                  Kaydet
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSaving(true)}
                className="flex items-center gap-1.5 w-full py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Mevcut görünümü kaydet
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SavedViewMenu;
