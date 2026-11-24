'use client';

import { useState } from 'react';

/**
 * Aksiyon açıklaması bloğu — takip kartlarında ve takip detayında ortak. Etiketli, okunur boyutta;
 * uzun metin `lines` satırla sınırlanır ve "Devamını göster" ile açılır (kart boyu şişmez).
 */
export function ActionDescription({ text, lines = 3, label = 'Aksiyon açıklaması', className = '' }: {
    text: string | null | undefined; lines?: 2 | 3 | 4 | 6; label?: string; className?: string;
}) {
    const [open, setOpen] = useState(false);
    const value = (text ?? '').trim();
    const long = value.length > 220 || value.split('\n').length > lines;
    const clamp = { 2: 'line-clamp-2', 3: 'line-clamp-3', 4: 'line-clamp-4', 6: 'line-clamp-6' }[lines];
    return (
        <div className={`min-w-0 ${className}`} data-testid="action-description">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
            {value ? (
                <>
                    <p className={`text-sm xl:text-[15px] text-slate-800 leading-relaxed whitespace-pre-wrap break-words ${open ? '' : clamp}`} title={open ? undefined : value}>{value}</p>
                    {long && (
                        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="mt-1 text-xs font-semibold text-blue-600 hover:underline">
                            {open ? 'Daha az göster' : 'Devamını göster'}
                        </button>
                    )}
                </>
            ) : <p className="text-sm text-slate-400">Açıklama girilmemiş.</p>}
        </div>
    );
}
