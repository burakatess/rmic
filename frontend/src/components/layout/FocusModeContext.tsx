'use client';

import { createContext, useContext, useState, useCallback, useMemo } from 'react';

interface FocusModeContextValue {
    focusMode: boolean;
    setFocusMode: (v: boolean) => void;
    toggleFocusMode: () => void;
}

const FocusModeContext = createContext<FocusModeContextValue | undefined>(undefined);

/** Dashboard layout'u sarar; sidebar/header'ı gizleyip çalışma alanını genişleten
 * "Odak Modu" için paylaşılan durumu tutar. Fullscreen API kullanmaz — yalnızca
 * layout genişliğini değiştirir, metin/seçim/kaydırma konumu korunur. */
export function FocusModeProvider({ children }: { children: React.ReactNode }) {
    const [focusMode, setFocusModeState] = useState(false);
    const setFocusMode = useCallback((v: boolean) => setFocusModeState(v), []);
    const toggleFocusMode = useCallback(() => setFocusModeState(p => !p), []);
    const value = useMemo(() => ({ focusMode, setFocusMode, toggleFocusMode }), [focusMode, setFocusMode, toggleFocusMode]);
    return <FocusModeContext.Provider value={value}>{children}</FocusModeContext.Provider>;
}

export function useFocusMode() {
    const ctx = useContext(FocusModeContext);
    if (!ctx) throw new Error('useFocusMode, FocusModeProvider içinde kullanılmalı');
    return ctx;
}
