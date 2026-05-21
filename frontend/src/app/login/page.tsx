'use client';

import { useState } from 'react';
import api from '@/lib/api';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await api.login(email, password);
            window.location.href = '/dashboard';
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Giriş başarısız');
            setIsLoading(false);
        }
    };

    const handleDemoLogin = async () => {
        setIsLoading(true);
        try {
            await api.login('admin@grc.com', 'password123');
            window.location.href = '/dashboard';
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Demo giriş başarısız');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
            <div className="w-full max-w-[400px]">
                {/* Logo & Title */}
                <div className="text-center mb-10">
                    <img
                        src="/ignis-icon.png"
                        alt="Burak GRC"
                        className="h-16 w-16 object-contain mx-auto mb-5"
                    />
                    <h1 className="text-[26px] font-semibold text-white">Burak GRC</h1>
                    <p className="text-[15px] text-slate-500 mt-2">
                        Risk Yönetimi ve İç Kontrol Platformu
                    </p>
                </div>

                {/* Login Card */}
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8">
                    <form onSubmit={handleSubmit}>
                        {error && (
                            <div className="bg-red-950 border border-red-900 rounded-xl px-4 py-3 mb-5 text-red-300 text-sm">
                                {error}
                            </div>
                        )}

                        <div className="mb-5">
                            <label className="block text-[13px] font-medium text-slate-400 mb-2">
                                E-posta Adresi
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="ornek@sirket.com"
                                required
                                className="w-full h-12 px-4 bg-slate-900 border border-slate-700 rounded-xl text-white text-[15px] placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>

                        <div className="mb-5">
                            <label className="block text-[13px] font-medium text-slate-400 mb-2">
                                Şifre
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="w-full h-12 px-4 bg-slate-900 border border-slate-700 rounded-xl text-white text-[15px] placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full h-12 bg-blue-600 text-white border-none rounded-xl text-[15px] font-semibold cursor-pointer hover:bg-blue-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isLoading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="flex items-center gap-4 my-7">
                        <div className="flex-1 h-px bg-slate-700" />
                        <span className="text-xs text-slate-600">DEMO</span>
                        <div className="flex-1 h-px bg-slate-700" />
                    </div>

                    {/* Demo Login */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-white">admin@grc.com</p>
                            <p className="text-[13px] text-slate-500 mt-1">Şifre: password123</p>
                        </div>
                        <button
                            type="button"
                            onClick={handleDemoLogin}
                            disabled={isLoading}
                            className="h-9 px-5 bg-blue-600 border-none rounded-lg text-white text-[13px] font-medium cursor-pointer hover:bg-blue-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            Hızlı Giriş
                        </button>
                    </div>
                </div>

                <p className="text-center text-xs text-slate-600 mt-8">
                    © 2026 Burak GRC. Tüm hakları saklıdır.
                </p>
            </div>
        </div>
    );
}
