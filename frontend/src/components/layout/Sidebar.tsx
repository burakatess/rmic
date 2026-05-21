'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
    label: string;
    href?: string;
    icon: React.ReactNode;
    children?: { label: string; href: string }[];
}

// Glassmorphism style icons with gradient strokes
const navigation: NavItem[] = [
    {
        label: 'Dashboard',
        href: '/dashboard',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <defs>
                    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="100%" stopColor="#a78bfa" />
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
        label: 'Risk Yönetimi',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <defs>
                    <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="100%" stopColor="#a78bfa" />
                    </linearGradient>
                </defs>
                <path d="M12 3L20 7.5V12C20 16.4 16.6 20.2 12 21C7.4 20.2 4 16.4 4 12V7.5L12 3Z" stroke="url(#grad2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 8V12" stroke="url(#grad2)" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="12" cy="15" r="1" fill="url(#grad2)" />
            </svg>
        ),
        children: [
            { label: 'Risk Girişi ve Hesaplama', href: '/risks/entry' },
            { label: 'RYK Kontrolleri', href: '/risks/controls' },
            { label: 'Risk Envanteri', href: '/risks' },
            { label: 'Risk Değerlendirme', href: '/risks/assessment' },
            { label: 'Risk Tedavi', href: '/risks/treatment' },
        ],
    },
    {
        label: 'Kontrol Yönetimi',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <defs>
                    <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="100%" stopColor="#a78bfa" />
                    </linearGradient>
                </defs>
                <rect x="4" y="4" width="16" height="16" rx="2" stroke="url(#grad3)" strokeWidth="1.5" />
                <path d="M8 12L11 15L16 9" stroke="url(#grad3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
        children: [
            { label: 'Kontrol Envanteri', href: '/controls' },
            { label: 'Kontrol Takip Ajandası', href: '/controls/agenda' },
            { label: 'Kontrol-Risk Eşleştirme', href: '/controls/mapping' },
            { label: 'Kontrol Testi', href: '/controls/testing' },
        ],
    },
    {
        label: 'Denetim & İnceleme',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <defs>
                    <linearGradient id="grad4" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="100%" stopColor="#a78bfa" />
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
            { label: 'Denetim Uygulama', href: '/audits/executions' },
        ],
    },
    {
        label: 'Bulgu & Aksiyon Yönetimi',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <defs>
                    <linearGradient id="grad5" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="100%" stopColor="#a78bfa" />
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
            { label: 'Aksiyon Listesi', href: '/actions' },
            { label: 'Etkinlik Değerlendirmesi', href: '/actions/effectiveness' },
        ],
    },
    {
        label: 'Uyum & Regülasyon',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <defs>
                    <linearGradient id="grad6" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="100%" stopColor="#a78bfa" />
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
            { label: 'Eşleştirme', href: '/compliance/mapping' },
        ],
    },
    {
        label: 'Raporlama & Analitik',
        href: '/reports',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <defs>
                    <linearGradient id="grad7" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="100%" stopColor="#a78bfa" />
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
        label: 'Yönetim',
        icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <defs>
                    <linearGradient id="grad8" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="100%" stopColor="#a78bfa" />
                    </linearGradient>
                </defs>
                <circle cx="12" cy="12" r="3" stroke="url(#grad8)" strokeWidth="1.5" />
                <path d="M12 2V4M12 20V22M2 12H4M20 12H22M4.93 4.93L6.34 6.34M17.66 17.66L19.07 19.07M4.93 19.07L6.34 17.66M17.66 6.34L19.07 4.93" stroke="url(#grad8)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        ),
        children: [
            { label: 'Kullanıcılar & Roller', href: '/admin/users' },
            { label: 'Rol Yetkileri', href: '/admin/roles' },
            { label: 'Parametreler', href: '/admin/parameters' },
            { label: 'Entegrasyonlar', href: '/admin/integrations' },
        ],
    },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-[#0b0f19] text-white shadow-2xl">
            {/* Glass overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-slate-800/20 to-transparent pointer-events-none" />

            {/* Logo */}
            <div className="relative flex h-20 items-center justify-center border-b border-slate-700/50">
                <div className="flex items-center gap-3">
                    <img
                        src="/ignis-icon.png"
                        alt="Burak GRC"
                        className="h-10 w-10 object-contain"
                    />
                    <span className="text-xl font-bold bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 bg-clip-text text-transparent">
                        Burak GRC
                    </span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="relative mt-4 px-3 h-[calc(100vh-5rem)] overflow-y-auto pb-4">
                <ul className="space-y-1">
                    {navigation.map((item) => (
                        <NavItemComponent key={item.label} item={item} pathname={pathname} />
                    ))}
                </ul>
            </nav>
        </aside>
    );
}

function NavItemComponent({ item, pathname }: { item: NavItem; pathname: string }) {
    const isActive = item.href
        ? pathname === item.href
        : item.children?.some((child) => pathname.startsWith(child.href));

    if (item.children) {
        return (
            <li>
                <details className="group" open={isActive}>
                    <summary className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-gradient-to-r hover:from-amber-600/20 hover:to-yellow-600/20 ${isActive ? 'bg-gradient-to-r from-amber-600/30 to-yellow-600/30 text-white shadow-lg shadow-amber-500/10' : 'text-slate-400 hover:text-white'}`}>
                        <span className="flex-shrink-0">{item.icon}</span>
                        <span className="flex-1">{item.label}</span>
                        <svg className="w-4 h-4 transition-transform group-open:rotate-180 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </summary>
                    <ul className="mt-1 space-y-1 pl-10">
                        {item.children.map((child) => (
                            <li key={child.href}>
                                <Link
                                    href={child.href}
                                    className={`block rounded-lg px-3 py-2 text-sm transition-all duration-200 hover:bg-slate-700/50 ${pathname === child.href ? 'bg-gradient-to-r from-amber-600/20 to-yellow-600/20 text-amber-400 font-medium border-l-2 border-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    {child.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </details>
            </li>
        );
    }

    return (
        <li>
            <Link
                href={item.href!}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-gradient-to-r hover:from-amber-600/20 hover:to-yellow-600/20 ${isActive ? 'bg-gradient-to-r from-amber-600/30 to-yellow-600/30 text-white shadow-lg shadow-amber-500/10' : 'text-slate-400 hover:text-white'}`}
            >
                <span className="flex-shrink-0">{item.icon}</span>
                {item.label}
            </Link>
        </li>
    );
}
