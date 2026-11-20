'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

import { useAuth, PermissionGate } from '../auth';

interface NavItem {
    label: string;
    href?: string;
    icon: React.ReactNode;
    children?: { label: string; href: string; permission?: string }[];
    permission?: string;
    /** Bunlardan herhangi biri yeterli (permission yoksa). */
    permissions?: string[];
}

// Outline icons, inherit color via currentColor (hover/active handled by parent classes)
const navigation: NavItem[] = [
    {
        label: 'Dashboard',
        href: '/dashboard',
        permission: 'dashboard:view',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="8" height="10" rx="2.5" fill="currentColor" fillOpacity="0.2" />
                <rect x="14" y="3" width="7" height="6" rx="2" fill="none" />
                <rect x="14" y="12" width="7" height="9" rx="2.5" fill="currentColor" fillOpacity="0.2" />
                <rect x="3" y="16" width="8" height="5" rx="2" fill="none" />
            </svg>
        ),
    },
    {
        label: 'Onaylarım',
        href: '/approvals',
        // İkinci kontrolcüler (ör. Risk Kontrol Yöneticisi) kontrol modülünü görmese de aksiyon/takip onayı verir.
        permissions: ['control:view', 'finding:view', 'action:view'],
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.2" />
                <path d="M8.5 12.5l2.5 2.5 4.5-5" fill="none" />
            </svg>
        ),
    },
    {
        label: 'Akış Sağlığı',
        href: '/workflow-health',
        permission: 'control:view',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.2" />
                <path d="M5.5 12h3l2-4.5 3 9 2-4.5h3" fill="none" />
            </svg>
        ),
    },
    {
        label: 'Risk Yönetimi',
        permission: 'risk:view',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" fill="currentColor" fillOpacity="0.2" />
                <path d="M12 8.5v4" fill="none" />
                <path d="M12 15.9v.01" fill="none" />
            </svg>
        ),
        children: [
            { label: 'Risk Envanteri', href: '/risks' },
            { label: 'Kontrol Alanı', href: '/risks/controls' },
            { label: 'Aksiyon Tablosu', href: '/risks/actions' },
            { label: 'RCA Haritalama', href: '/risks/rca-mapping' },
            { label: 'Risk Simülasyonu', href: '/risks/simulation' }, // Risk Yönetimi (risk:view) gören herkes
        ],
    },
    {
        label: 'Kontrol Yönetimi',
        permission: 'control:view',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="4" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.2" />
                <path d="M8.5 12.2l2.4 2.4 4.6-5" fill="none" />
            </svg>
        ),
        children: [
            { label: 'Kontrol Envanteri', href: '/controls' },
            { label: 'Yıllık Plan', href: '/controls/annual-plan', permission: 'control:*' },
            { label: 'Dönem Kontrolleri', href: '/controls/agenda' },
            { label: 'Kontrol-Risk Eşleştirme', href: '/controls/mapping' },
            { label: 'Kontrol Testi', href: '/controls/testing', permission: 'control:test' },
        ],
    },
    {
        label: 'Denetim & İnceleme',
        permission: 'audit:view',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="3" width="12" height="16" rx="2.5" fill="currentColor" fillOpacity="0.2" />
                <path d="M7.5 8h5M7.5 11.5h3" fill="none" />
                <circle cx="16" cy="16.5" r="3.5" fill="none" />
                <path d="M18.6 19.1L21 21.5" fill="none" />
            </svg>
        ),
        children: [
            { label: 'Denetim Planı', href: '/audits/plans' },
            { label: 'Denetim Uygulama', href: '/audits/executions', permission: 'audit:execute' },
        ],
    },
    {
        label: 'Bulgu & Aksiyon Yönetimi',
        permission: 'finding:view',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="6" cy="12" r="2.2" fill="currentColor" fillOpacity="0.2" />
                <circle cx="12.5" cy="5.5" r="2.2" fill="currentColor" fillOpacity="0.2" />
                <circle cx="12.5" cy="18.5" r="2.2" fill="currentColor" fillOpacity="0.2" />
                <circle cx="18.5" cy="12" r="2.2" fill="currentColor" fillOpacity="0.2" />
                <path d="M8.1 11.3l2.5-4M8.1 12.7l2.5 4M14.3 7l2.6 3M14.3 17l2.6-3" fill="none" />
            </svg>
        ),
        children: [
            { label: 'Bulgular', href: '/findings' },
            { label: 'Bulgu-Risk Eşleştirme', href: '/findings/mapping', permission: 'finding:view' },
            { label: 'Aksiyonlar', href: '/actions', permission: 'action:view' },
            { label: 'Bulgu Takip Çalışmaları', href: '/follow-ups', permission: 'finding:view' },
        ],
    },
    {
        label: 'Uyum & Regülasyon',
        permission: 'compliance:view',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="3" width="16" height="18" rx="2.5" fill="currentColor" fillOpacity="0.2" />
                <path d="M4 8.5h16" fill="none" />
                <path d="M8 12.5h8M8 16h5" fill="none" />
            </svg>
        ),
        children: [
            { label: 'Regülasyon Kütüphanesi', href: '/compliance/regulations' },
            { label: 'Eşleştirme', href: '/compliance/mapping', permission: 'compliance:map' },
        ],
    },
    {
        label: 'Raporlama & Analitik',
        href: '/reports',
        permission: 'report:view',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="13" width="4" height="7" rx="1.2" fill="currentColor" fillOpacity="0.2" />
                <rect x="10" y="9" width="4" height="11" rx="1.2" fill="currentColor" fillOpacity="0.2" />
                <rect x="16" y="5" width="4" height="15" rx="1.2" fill="currentColor" fillOpacity="0.2" />
                <path d="M4 8.5l5-3.5 4 2 5-3.5" fill="none" />
            </svg>
        ),
    },
    {
        label: 'Yapay Zeka (AI)',
        permission: 'ai:view',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.5 3.5l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4L4.5 9.5l4.4-1.6z" fill="currentColor" fillOpacity="0.2" />
                <path d="M17.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor" fillOpacity="0.2" />
            </svg>
        ),
        children: [
            { label: 'Kontrol & Kanıt Değerlendirme', href: '/ai/kontrol-kanit', permission: 'ai:run' },
            { label: 'Doğal Dil Sorgu', href: '/ai/sorgu' },
            { label: 'Kaynak Kütüphanesi', href: '/ai/kaynaklar', permission: 'ai:admin' },
            { label: 'Kaynak Kataloğu', href: '/ai/kaynak-katalogu', permission: 'ai:view' },
            { label: 'Ayarlar & Kullanım', href: '/ai/ayarlar', permission: 'ai:admin' },
        ],
    },
    {
        label: 'Sistem Yönetimi',
        permission: 'user:view',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" fill="none" />
                <circle cx="15" cy="7" r="2" fill="currentColor" fillOpacity="0.2" />
                <circle cx="9" cy="12" r="2" fill="currentColor" fillOpacity="0.2" />
                <circle cx="17" cy="17" r="2" fill="currentColor" fillOpacity="0.2" />
            </svg>
        ),
        children: [
            { label: 'Kullanıcılar', href: '/admin/users' },
            { label: 'Roller & Yetkiler', href: '/admin/roles', permission: 'role:manage' },
            { label: 'Risk Öneri Talepleri', href: '/admin/risk-proposals', permission: 'user:view' },
            { label: 'GMY Tanımları', href: '/admin/gmys' },
            { label: 'Sistem Parametreleri', href: '/admin/parameters', permission: 'parameter:view' },
            { label: 'Denetim İzleri', href: '/admin/audit-logs', permission: 'audit_log:view' },
        ],
    },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { user } = useAuth();
    // "Onaylarım" rozeti: ikinci kontrolcü olarak bekleyen aksiyon/takip işleri (sayfa değişiminde tazelenir).
    const [pendingCount, setPendingCount] = useState(0);
    useEffect(() => {
        if (!user) return;
        let alive = true;
        api.getWorkflowApprovalCount().then(r => { if (alive) setPendingCount(r?.count || 0); }).catch(() => undefined);
        return () => { alive = false; };
    }, [user, pathname]);

    return (
        <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-[#0b0f19] text-white shadow-2xl flex flex-col">
            {/* Glass overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-blue-900/10 to-transparent pointer-events-none" />

            {/* Logo */}
            <div className="relative flex h-16 items-center justify-center border-b border-slate-800/80 bg-[#0b0f19]">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="absolute inset-0 rounded-full blur-md opacity-50" style={{background: '#2563eb'}} />
                        <svg width="36" height="36" viewBox="0 0 64 64" role="img" aria-label="RMIC logosu" className="relative">
                            <defs>
                                <linearGradient id="sb-logo-bg" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
                                    <stop stopColor="#60a5fa" />
                                    <stop offset="0.55" stopColor="#2563eb" />
                                    <stop offset="1" stopColor="#1e3a8a" />
                                </linearGradient>
                            </defs>
                            <path d="M32 4L56 13V32C56 46 46 56 32 60C18 56 8 46 8 32V13Z" fill="url(#sb-logo-bg)" />
                            <path d="M32 4L56 13V32C56 46 46 56 32 60Z" fill="white" fillOpacity="0.08" />
                            <path d="M32 4L56 13V32C56 46 46 56 32 60C18 56 8 46 8 32V13Z" fill="none" stroke="#93c5fd" strokeOpacity="0.55" strokeWidth="1" />
                            <path d="M25 46V19H33.5a7.5 7.5 0 0 1 0 15H25M34 34L42 46" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="45" cy="19" r="2.6" fill="#22d3ee" />
                        </svg>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[16px] font-bold tracking-tight text-white leading-none">RMIC</span>
                        <span className="text-[10px] font-semibold tracking-[0.15em] text-blue-400 uppercase leading-none mt-1">GRC Platform</span>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="relative flex-1 overflow-y-auto px-3 py-4 space-y-1 scrollbar-thin scrollbar-thumb-slate-700">
                {navigation.map((item) => (
                    <PermissionGate key={item.label} permission={item.permission} permissions={item.permissions}>
                        <NavItemComponent item={item} pathname={pathname} badge={item.href === '/approvals' ? pendingCount : 0} />
                    </PermissionGate>
                ))}
            </nav>
            
            {/* Footer info */}
            <div className="relative p-4 border-t border-slate-800/80 text-xs text-slate-500 text-center bg-[#0b0f19]">
                v2.0 Enterprise
            </div>
        </aside>
    );
}

function NavItemComponent({ item, pathname, badge = 0 }: { item: NavItem; pathname: string; badge?: number }) {
    const isActive = item.href
        ? pathname === item.href
        : item.children?.some((child) => pathname === child.href || (child.href !== '/risks' && pathname.startsWith(child.href)));

    if (item.children) {
        return (
            <div>
                <details className="group" open={isActive}>
                    <summary className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-all duration-200 hover:bg-slate-800 ${isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}>
                        <span className="flex-shrink-0 text-slate-400 group-hover:text-blue-400 transition-colors">{item.icon}</span>
                        <span className="flex-1">{item.label}</span>
                        <svg className="w-4 h-4 transition-transform group-open:rotate-180 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </summary>
                    <ul className="mt-1 space-y-1 pl-11 pr-2 pb-2">
                        {item.children.map((child) => (
                            <PermissionGate key={child.href} permission={child.permission}>
                                <li>
                                    <Link
                                        href={child.href}
                                        className={`block rounded-md px-3 py-2 text-[13px] transition-all duration-200 hover:bg-slate-800 hover:text-white ${pathname === child.href || (child.href !== '/risks' && pathname.startsWith(child.href)) ? 'text-blue-400 font-medium bg-slate-800/50' : 'text-slate-400'}`}
                                    >
                                        {child.label}
                                    </Link>
                                </li>
                            </PermissionGate>
                        ))}
                    </ul>
                </details>
            </div>
        );
    }

    return (
        <Link
            href={item.href!}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-all duration-200 hover:bg-slate-800 group ${isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' : 'text-slate-400 hover:text-white'}`}
        >
            <span className={`flex-shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'}`}>{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {badge > 0 && (
                <span className="min-w-[20px] rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-slate-900" aria-label={`${badge} onay bekliyor`}>
                    {badge > 99 ? '99+' : badge}
                </span>
            )}
        </Link>
    );
}
