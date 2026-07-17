'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth';


interface SearchResult {
    id: string;
    type: 'risk' | 'control' | 'finding' | 'action';
    title: string;
    subtitle: string;
    url: string;
}

// Not: Genel arama için henüz bir backend endpoint'i yok. Sahte/demo sonuç
// göstermek yerine arama kutusu her zaman "Sonuç bulunamadı" boş state'ine düşer
// (bkz. aşağıdaki arama efekti) — gerçek bir /search API'si eklenince buraya bağlanacak.

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    risk: { label: 'Risk', color: 'text-red-700', bg: 'bg-red-100' },
    control: { label: 'Kontrol', color: 'text-blue-700', bg: 'bg-blue-100' },
    finding: { label: 'Bulgu', color: 'text-purple-700', bg: 'bg-purple-100' },
    action: { label: 'Aksiyon', color: 'text-green-700', bg: 'bg-green-100' },
};

export default function Header() {
    const router = useRouter();
    const { user } = useAuth();
    const [showDropdown, setShowDropdown] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchCategory, setSearchCategory] = useState<'all' | 'risk' | 'control' | 'finding' | 'action'>('all');
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const searchRef = useRef<HTMLDivElement>(null);

    // Close search results when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowSearchResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Genel arama backend'i henüz yok — sonuç listesi her zaman boş kalır (bkz. yukarıdaki not).
    useEffect(() => {
        setSearchResults([]);
    }, [searchQuery, searchCategory]);

    const handleLogout = () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
    };

    const getRoleLabel = (role: string) => {
        const labels: Record<string, string> = {
            ADMIN: 'Sistem Yöneticisi',
            RISK_MANAGER: 'Risk Yöneticisi',
            AUDITOR: 'Denetçi',
            CONTROL_OWNER: 'Kontrol Sahibi',
            VIEWER: 'Görüntüleyici',
        };
        return labels[role] || role;
    };

    return (
        <header className="fixed top-0 left-64 right-0 z-30 h-16 bg-white border-b border-gray-200 shadow-sm">
            <div className="flex h-full items-center justify-between px-6">
                {/* Organization */}
                <div className="flex items-center gap-4">
                    {/* Navigation Buttons */}
                    <div className="flex items-center gap-0.5 border-r border-gray-200 pr-3 mr-1">
                        <button
                            onClick={() => router.push('/')}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Ana Sayfa"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                        </button>
                        <button
                            onClick={() => router.back()}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Geri"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <button
                            onClick={() => router.forward()}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            title="İleri"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>

                    <h1 className="text-lg font-semibold text-gray-800">
                        Burak GRC
                    </h1>
                </div>

                {/* Right side */}
                <div className="flex items-center gap-3">
                    {/* Global Search */}
                    <div className="relative" ref={searchRef}>
                        <div className="flex items-center bg-gray-100 rounded-lg">
                            {/* Category Dropdown */}
                            <select
                                value={searchCategory}
                                onChange={(e) => setSearchCategory(e.target.value as typeof searchCategory)}
                                className="h-9 pl-3 pr-1 bg-transparent border-none text-sm text-gray-600 focus:outline-none cursor-pointer"
                            >
                                <option value="all">Tümü</option>
                                <option value="risk">Risk</option>
                                <option value="control">Kontrol</option>
                                <option value="finding">Bulgu</option>
                                <option value="action">Aksiyon</option>
                            </select>
                            <div className="w-px h-5 bg-gray-300" />
                            {/* Search Input */}
                            <div className="relative">
                                <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        setShowSearchResults(true);
                                    }}
                                    onFocus={() => setShowSearchResults(true)}
                                    placeholder="ID veya isim ara..."
                                    className="w-48 h-9 pl-8 pr-3 bg-transparent border-none text-sm focus:outline-none placeholder-gray-400"
                                />
                            </div>
                        </div>

                        {/* Search Results Dropdown */}
                        {showSearchResults && searchResults.length > 0 && (
                            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50">
                                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                                    <p className="text-xs text-gray-500">{searchResults.length} sonuç bulundu</p>
                                </div>
                                <div className="max-h-72 overflow-y-auto">
                                    {searchResults.map(result => (
                                        <Link
                                            key={result.id}
                                            href={result.url}
                                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                                            onClick={() => {
                                                setShowSearchResults(false);
                                                setSearchQuery('');
                                            }}
                                        >
                                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${TYPE_CONFIG[result.type].bg} ${TYPE_CONFIG[result.type].color}`}>
                                                {TYPE_CONFIG[result.type].label}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate">{result.title}</p>
                                                <p className="text-xs text-gray-500 truncate">{result.subtitle}</p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}

                        {showSearchResults && searchQuery.length >= 2 && searchResults.length === 0 && (
                            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 p-4 z-50">
                                <p className="text-sm text-gray-500 text-center">Sonuç bulunamadı</p>
                            </div>
                        )}
                    </div>

                    {/* Notifications */}
                    <div className="relative">
                        <button
                            onClick={() => setShowNotifications(!showNotifications)}
                            className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                        </button>

                        {showNotifications && (
                            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 py-2">
                                <div className="px-4 py-2 border-b border-gray-100">
                                    <h3 className="font-semibold text-gray-800">Bildirimler</h3>
                                </div>
                                <div className="max-h-64 overflow-y-auto">
                                    <div className="px-4 py-3 hover:bg-gray-50 border-l-4 border-red-500">
                                        <p className="text-sm font-medium text-gray-800">3 adet gecikmiş aksiyon</p>
                                        <p className="text-xs text-gray-500 mt-1">5 dakika önce</p>
                                    </div>
                                    <div className="px-4 py-3 hover:bg-gray-50 border-l-4 border-yellow-500">
                                        <p className="text-sm font-medium text-gray-800">Yeni bulgu oluşturuldu</p>
                                        <p className="text-xs text-gray-500 mt-1">1 saat önce</p>
                                    </div>
                                    <div className="px-4 py-3 hover:bg-gray-50 border-l-4 border-blue-500">
                                        <p className="text-sm font-medium text-gray-800">Risk değerlendirmesi tamamlandı</p>
                                        <p className="text-xs text-gray-500 mt-1">2 saat önce</p>
                                    </div>
                                </div>
                                <div className="px-4 py-2 border-t border-gray-100">
                                    <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                                        Tümünü görüntüle
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* User menu */}
                    <div className="relative">
                        <button
                            onClick={() => setShowDropdown(!showDropdown)}
                            className="flex items-center gap-3 hover:bg-gray-100 rounded-lg p-2 pr-4 transition-colors"
                        >
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-amber-600 flex items-center justify-center text-white font-semibold text-sm">
                                {user?.firstName?.[0]}{user?.lastName?.[0]}
                            </div>
                            <div className="text-left">
                                <p className="text-sm font-medium text-gray-800">
                                    {user?.firstName} {user?.lastName}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {user?.role?.name && getRoleLabel(user.role.name)}
                                </p>
                            </div>
                            <svg className={`w-4 h-4 text-gray-500 transition-transform ${showDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {showDropdown && (
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-2">
                                <a href="/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    Profil
                                </a>
                                <a href="/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    Ayarlar
                                </a>
                                <hr className="my-2 border-gray-100" />
                                <button
                                    onClick={handleLogout}
                                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                    Çıkış Yap
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}
