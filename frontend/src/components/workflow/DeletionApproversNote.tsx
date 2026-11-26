'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

/**
 * Silme talebi penceresinde "kimin onayına gidecek" bilgisi: talebe karar verebilecek yöneticiler
 * (talep eden hariç). Liste sunucudan gelir; yüklenemezse genel ifade gösterilir.
 */
export function DeletionApproversNote() {
    const [names, setNames] = useState<string[] | null>(null);
    useEffect(() => {
        let alive = true;
        api.getDeletionApprovers()
            .then(r => { if (alive) setNames(r.map(u => u.name)); })
            .catch(() => { if (alive) setNames([]); });
        return () => { alive = false; };
    }, []);
    return (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3" data-testid="deletion-approvers">
            <span className="font-semibold">Kimin onayına gidecek:</span>{' '}
            {names === null ? 'yükleniyor…'
                : names.length ? <>{names.join(', ')} <span className="text-slate-400">(yönetici rolündeki kişilerden biri karar verir)</span></>
                : 'yönetici rolündeki kişiler (talep eden hariç)'}
        </p>
    );
}
