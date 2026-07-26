'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuth, PermissionGate } from '../auth';

interface NavItem {
    label: string;
    href?: string;
    icon: React.ReactNode;
    children?: { label: string; href: string; permission?: string }[];
    permission?: string;
}

// Glassmorphism style icons with gradient strokes
const navigation: NavItem[] = [
    {
        label: 'Dashboard',
        href: '/dashboard',
        permission: 'dashboard:view',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <defs>
                    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                </defs>
                <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="url(#grad1)" strokeWidth="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="url(#grad1)" strokeWidth="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="url(#grad1)" strokeWidth="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="url(#grad1)" strokeWidth="1.5" />
            </svg>
        ),
    },
    {
        label: 'Onaylarım',
        href: '/approvals',
        permission: 'control:view',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
        ),
    },
    {
        label: 'Risk Yönetimi',
        permission: 'risk:view',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <defs>
                    <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                </defs>
                <path d="M12 3L20 7.5V12C20 16.4 16.6 20.2 12 21C7.4 20.2 4 16.4 4 12V7.5L12 3Z" stroke="url(#grad2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 8V12" stroke="url(#grad2)" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="12" cy="15" r="1" fill="url(#grad2)" />
            </svg>
        ),
        children: [
            { label: 'Risk Envanteri', href: '/risks' },
            { label: 'Kontrol Alanı', href: '/risks/controls' },
            { label: 'Aksiyon Tablosu', href: '/risks/actions' },
            { label: 'RCA Haritalama', href: '/risks/rca-mapping' },
        ],
    },
    {
        label: 'Kontrol Yönetimi',
        permission: 'control:view',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <defs>
                    <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                </defs>
                <rect x="4" y="4" width="16" height="16" rx="2" stroke="url(#grad3)" strokeWidth="1.5" />
                <path d="M8 12L11 15L16 9" stroke="url(#grad3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
        children: [
            { label: 'Kontrol Envanteri', href: '/controls' },
            { label: 'Kontrol Takip Panosu', href: '/controls/agenda' },
            { label: 'Kontrol-Risk Eşleştirme', href: '/controls/mapping' },
            { label: 'Kontrol Testi', href: '/controls/testing', permission: 'control:test' },
        ],
    },
    {
        label: 'Denetim & İnceleme',
        permission: 'audit:view',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <defs>
                    <linearGradient id="grad4" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                </defs>
                <rect x="4" y="3" width="12" height="16" rx="2" stroke="url(#grad4)" strokeWidth="1.5" />
                <circle cx="16" cy="17" r="4" stroke="url(#grad4)" strokeWidth="1.5" />
                <path d="M19 20L21 22" stroke="url(#grad4)" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="7" y1="7" x2="13" y2="7" stroke="url(#grad4)" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="7" y1="10" x2="11" y2="10" stroke="url(#grad4)" strokeWidth="1.5" strokeLinecap="round" />
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
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <defs>
                    <linearGradient id="grad5" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                </defs>
                <circle cx="6" cy="12" r="2" stroke="url(#grad5)" strokeWidth="1.5" />
                <circle cx="12" cy="6" r="2" stroke="url(#grad5)" strokeWidth="1.5" />
                <circle cx="12" cy="18" r="2" stroke="url(#grad5)" strokeWidth="1.5" />
                <circle cx="18" cy="12" r="2" stroke="url(#grad5)" strokeWidth="1.5" />
                <path d="M8 12H10M14 6L16 10M14 18L16 14" stroke="url(#grad5)" strokeWidth="1.5" strokeLinecap="round" />
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
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <defs>
                    <linearGradient id="grad6" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                </defs>
                <rect x="4" y="4" width="16" height="18" rx="2" stroke="url(#grad6)" strokeWidth="1.5" />
                <path d="M4 9H20" stroke="url(#grad6)" strokeWidth="1.5" />
                <line x1="8" y1="13" x2="16" y2="13" stroke="url(#grad6)" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="8" y1="16" x2="14" y2="16" stroke="url(#grad6)" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="16" cy="16" r="1.5" stroke="url(#grad6)" strokeWidth="1" />
                <path d="M15.5 16.5L17 18" stroke="url(#grad6)" strokeWidth="1" strokeLinecap="round" />
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
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <defs>
                    <linearGradient id="grad7" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                </defs>
                <rect x="4" y="14" width="4" height="6" rx="1" stroke="url(#grad7)" strokeWidth="1.5" />
                <rect x="10" y="10" width="4" height="10" rx="1" stroke="url(#grad7)" strokeWidth="1.5" />
                <rect x="16" y="6" width="4" height="14" rx="1" stroke="url(#grad7)" strokeWidth="1.5" />
                <path d="M4 4L8 8L14 5L20 2" stroke="url(#grad7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
    {
        label: 'Sistem Yönetimi',
        permission: 'user:view',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <defs>
                    <linearGradient id="grad8" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                </defs>
                <circle cx="12" cy="12" r="3" stroke="url(#grad8)" strokeWidth="1.5" />
                <path d="M12 2V4M12 20V22M2 12H4M20 12H22M4.93 4.93L6.34 6.34M17.66 17.66L19.07 19.07M4.93 19.07L6.34 17.66M17.66 6.34L19.07 4.93" stroke="url(#grad8)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        ),
        children: [
            { label: 'Kullanıcılar', href: '/admin/users' },
            { label: 'Roller & Yetkiler', href: '/admin/roles', permission: 'role:manage' },
            { label: 'Risk Öneri Talepleri', href: '/admin/risk-proposals', permission: 'user:view' },
            { label: 'Sistem Parametreleri', href: '/admin/parameters', permission: 'parameter:view' },
            { label: 'Denetim İzleri', href: '/admin/audit-logs', permission: 'audit_log:view' },
        ],
    },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-[#0b0f19] text-white shadow-2xl flex flex-col">
            {/* Glass overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-blue-900/10 to-transparent pointer-events-none" />

            {/* Logo */}
            <div className="relative flex h-16 items-center justify-center border-b border-slate-800/80 bg-[#0b0f19]">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="absolute inset-0 rounded-[10px] blur-md opacity-60" style={{background: 'linear-gradient(135deg, #4f46e5, #7c3aed)'}} />
                        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative">
                            <defs>
                                <linearGradient id="sb-logo-bg" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                                    <stop stopColor="#4f46e5" />
                                    <stop offset="1" stopColor="#7c3aed" />
                                </linearGradient>
                                <linearGradient id="sb-logo-border" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                                    <stop stopColor="#818cf8" stopOpacity="0.7" />
                                    <stop offset="1" stopColor="#a78bfa" stopOpacity="0.4" />
                                </linearGradient>
                                <linearGradient id="sb-top-shine" x1="0" y1="0" x2="0" y2="1">
                                    <stop stopColor="white" stopOpacity="0.18" />
                                    <stop offset="1" stopColor="white" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <rect width="36" height="36" rx="10" fill="url(#sb-logo-bg)" />
                            <rect x="0.75" y="0.75" width="34.5" height="34.5" rx="9.25" stroke="url(#sb-logo-border)" strokeWidth="1" fill="none" />
                            <rect width="36" height="18" rx="10" fill="url(#sb-top-shine)" />
                            <path d="M18 5.5L28 11V19.5C28 24.5 23.6 29 18 30C12.4 29 8 24.5 8 19.5V11L18 5.5Z"
                                fill="white" fillOpacity="0.06" stroke="white" strokeWidth="1" strokeOpacity="0.15" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M18 10L24 13.5V19C24 22.2 21.3 25 18 25.5C14.7 25 12 22.2 12 19V13.5L18 10Z"
                                fill="white" fillOpacity="0.14" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M15 19L17.2 21.2L21.5 16" stroke="white" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[16px] font-bold tracking-tight text-white leading-none">RMIC</span>
                        <span className="text-[10px] font-semibold tracking-[0.15em] text-indigo-400 uppercase leading-none mt-1">GRC Platform</span>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="relative flex-1 overflow-y-auto px-3 py-4 space-y-1 scrollbar-thin scrollbar-thumb-slate-700">
                {navigation.map((item) => (
                    <PermissionGate key={item.label} permission={item.permission}>
                        <NavItemComponent item={item} pathname={pathname} />
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

function NavItemComponent({ item, pathname }: { item: NavItem; pathname: string }) {
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
            {item.label}
        </Link>
    );
}
