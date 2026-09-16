'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Bağımlılıksız, sürüklenebilir iki panelli yatay bölme. Oran localStorage'da
 * kalıcı tutulur. Yalnızca ≥1024px (lg) genişlikte kullanılmalı — dar ekranda
 * çağıran taraf sekmeli görünüme geçmeli. */
export function ResizableSplit({
    left, right, storageKey, minLeftPct = 28, maxLeftPct = 72, defaultLeftPct = 42,
}: {
    left: React.ReactNode;
    right: React.ReactNode;
    storageKey: string;
    minLeftPct?: number;
    maxLeftPct?: number;
    defaultLeftPct?: number;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);
    const [leftPct, setLeftPct] = useState(defaultLeftPct);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(`resizable-split-${storageKey}`);
            if (saved) {
                const n = parseFloat(saved);
                if (!isNaN(n) && n >= minLeftPct && n <= maxLeftPct) setLeftPct(n);
            }
        } catch { /* noop */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey]);

    const onMouseMove = useCallback((e: MouseEvent) => {
        if (!draggingRef.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        let pct = ((e.clientX - rect.left) / rect.width) * 100;
        pct = Math.min(maxLeftPct, Math.max(minLeftPct, pct));
        setLeftPct(pct);
    }, [minLeftPct, maxLeftPct]);

    const stopDrag = useCallback(() => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        try { localStorage.setItem(`resizable-split-${storageKey}`, String(leftPct)); } catch { /* noop */ }
    }, [leftPct, storageKey]);

    useEffect(() => {
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', stopDrag);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', stopDrag);
        };
    }, [onMouseMove, stopDrag]);

    const startDrag = () => {
        draggingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    return (
        <div ref={containerRef} className="flex w-full min-h-0 flex-1">
            <div style={{ width: `${leftPct}%` }} className="min-w-0 overflow-y-auto">{left}</div>
            <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Panel genişliğini ayarla"
                tabIndex={0}
                onMouseDown={startDrag}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') setLeftPct(p => Math.max(minLeftPct, p - 2));
                    if (e.key === 'ArrowRight') setLeftPct(p => Math.min(maxLeftPct, p + 2));
                }}
                className="w-2 shrink-0 cursor-col-resize group flex items-center justify-center focus:outline-none"
            >
                <div className="w-px h-full bg-slate-200 group-hover:bg-blue-400 group-focus:bg-blue-500 transition-colors" />
            </div>
            <div style={{ width: `${100 - leftPct}%` }} className="min-w-0 overflow-y-auto">{right}</div>
        </div>
    );
}
