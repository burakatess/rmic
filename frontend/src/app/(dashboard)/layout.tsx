'use client';

import { Sidebar, Header } from '@/components/layout';
import { FocusModeProvider, useFocusMode } from '@/components/layout/FocusModeContext';

// Tek, sabit bir ağaç yapısı kullanılır (odak moduna göre iki farklı JSX dalı
// DÖNDÜRÜLMEZ) — dallanma, React'ın alt ağacı (sayfa içeriğini) farklı DOM
// pozisyonunda yeniden bağlaması ve kaydedilmemiş durumun sıfırlanması riski
// taşır. Bunun yerine sidebar/header `hidden` ile gizlenir, `main`'in offset
// sınıfları koşullu uygulanır — {children}'ın ağaçtaki konumu hiç değişmez.
function DashboardShell({ children }: { children: React.ReactNode }) {
    const { focusMode } = useFocusMode();

    return (
        <div className="min-h-screen bg-slate-50">
            <div className={focusMode ? 'hidden' : ''}><Sidebar /></div>
            <div className={focusMode ? 'hidden' : ''}><Header /></div>
            <main className={focusMode ? 'min-h-screen' : 'ml-64 pt-16 min-h-screen'}>
                {/* Yatay boşluk tek yerde (kabuklar ayrıca eklemez). Geniş/2K+ ekranda içerik ~1920px'te
                    ortalanır (rem: kök yazı büyüdükçe sınır da büyür), satırlar aşırı uzamaz. */}
                <div className={focusMode ? 'w-full max-w-full animate-fadeIn' : 'px-4 py-5 lg:px-6 lg:py-6 2xl:px-8 w-full max-w-[120rem] mx-auto animate-fadeIn'}>
                    {children}
                </div>
            </main>
        </div>
    );
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <FocusModeProvider>
            <DashboardShell>{children}</DashboardShell>
        </FocusModeProvider>
    );
}
