'use client';

/* Çalışma alanı sekmelerinin ortak gösterim parçaları (seviye renkleri, biçimleyiciler). */

export const LEVELS = ['Çok Yüksek', 'Yüksek', 'Orta', 'Düşük', 'Çok Düşük'] as const;
export const LEVEL_SHORT: Record<string, string> = { 'Çok Yüksek': 'ÇY', 'Yüksek': 'Y', 'Orta': 'O', 'Düşük': 'D', 'Çok Düşük': 'ÇD' };
export const LEVEL_TONE: Record<string, string> = {
    'Çok Yüksek': 'text-red-700 border-red-300 bg-red-50', 'Yüksek': 'text-orange-700 border-orange-300 bg-orange-50',
    'Orta': 'text-amber-700 border-amber-300 bg-amber-50', 'Düşük': 'text-emerald-700 border-emerald-300 bg-emerald-50',
    'Çok Düşük': 'text-teal-700 border-teal-300 bg-teal-50',
    'Çok Zayıf': 'text-red-700 border-red-300 bg-red-50', 'Zayıf': 'text-orange-700 border-orange-300 bg-orange-50',
    'Güçlü': 'text-emerald-700 border-emerald-300 bg-emerald-50', 'Çok Güçlü': 'text-teal-700 border-teal-300 bg-teal-50',
};
export const BAR_TONE: Record<string, string> = { 'Çok Yüksek': 'bg-red-500', 'Yüksek': 'bg-orange-500', 'Orta': 'bg-amber-400', 'Düşük': 'bg-emerald-500', 'Çok Düşük': 'bg-teal-500' };
export const fmt = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('tr-TR') : '—');

export function LevelBadge({ label }: { label?: string | null }) {
    if (!label) return <span className="text-[11px] text-slate-400">—</span>;
    return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LEVEL_TONE[label] ?? 'text-slate-600 border-slate-300 bg-slate-50'}`}>● {label}</span>;
}


/** Kalıntı seviye dağılımı çubuğu (ÇY · Y · O · D · ÇD, bilinmeyen ayrı). */
export function DistributionBar({ dist, unknown }: { dist: Record<string, number>; unknown?: number }) {
    const total = LEVELS.reduce((s, l) => s + (dist[l] ?? 0), 0) + (unknown ?? 0);
    return (
        <div>
            <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                {LEVELS.map(l => (dist[l] ?? 0) > 0 && <div key={l} className={BAR_TONE[l]} style={{ width: `${((dist[l] ?? 0) / Math.max(1, total)) * 100}%` }} />)}
            </div>
            <div className="mt-1.5 font-mono text-[11px] text-slate-600">
                {LEVELS.map(l => `${LEVEL_SHORT[l]} ${dist[l] ?? 0}`).join(' · ')}{unknown ? ` · ? ${unknown}` : ''}
            </div>
        </div>
    );
}
