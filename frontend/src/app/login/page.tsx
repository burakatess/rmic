'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth';
import { useToast } from '@/components/ui/Toast';
import { Button, Input } from '@/components/ui';

export default function LoginPage() {
    const { login } = useAuth();
    const { error: toastError, success: toastSuccess } = useToast();
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            await login(email, password);
            toastSuccess('Giriş başarılı', 'Dashboard\'a yönlendiriliyorsunuz...');
            // Redirect is handled by AuthProvider
        } catch (err) {
            toastError('Giriş başarısız', err instanceof Error ? err.message : 'Lütfen bilgilerinizi kontrol edin.');
            setIsLoading(false);
        }
    };

    const handleDemoLogin = async (demoEmail: string) => {
        setIsLoading(true);
        try {
            await login(demoEmail, 'Test1234!');
            toastSuccess('Giriş başarılı', 'Dashboard\'a yönlendiriliyorsunuz...');
        } catch (err) {
            toastError('Demo giriş başarısız', err instanceof Error ? err.message : 'Bağlantı hatası.');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
            <div className="w-full max-w-md animate-fadeInDown">
                {/* Logo & Title */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center mb-6 relative">
                        <div className="absolute inset-0 rounded-[20px] blur-2xl opacity-70" style={{background: 'linear-gradient(135deg, #4f46e5, #7c3aed)'}} />
                        <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative">
                            <defs>
                                <linearGradient id="login-logo-bg" x1="0" y1="0" x2="72" y2="72" gradientUnits="userSpaceOnUse">
                                    <stop stopColor="#4f46e5" />
                                    <stop offset="1" stopColor="#7c3aed" />
                                </linearGradient>
                                <linearGradient id="login-logo-border" x1="0" y1="0" x2="72" y2="72" gradientUnits="userSpaceOnUse">
                                    <stop stopColor="#818cf8" stopOpacity="0.8" />
                                    <stop offset="1" stopColor="#a78bfa" stopOpacity="0.3" />
                                </linearGradient>
                                <linearGradient id="login-top-shine" x1="0" y1="0" x2="0" y2="1">
                                    <stop stopColor="white" stopOpacity="0.16" />
                                    <stop offset="1" stopColor="white" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <rect width="72" height="72" rx="20" fill="url(#login-logo-bg)" />
                            <rect x="1" y="1" width="70" height="70" rx="19" stroke="url(#login-logo-border)" strokeWidth="1.5" fill="none" />
                            <rect width="72" height="36" rx="20" fill="url(#login-top-shine)" />
                            <path d="M36 11L56 21V39C56 49 46.8 58.2 36 60C25.2 58.2 16 49 16 39V21L36 11Z"
                                fill="white" fillOpacity="0.06" stroke="white" strokeWidth="1.25" strokeOpacity="0.15" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M36 20L48 27V37C48 43.5 42.5 49.5 36 51C29.5 49.5 24 43.5 24 37V27L36 20Z"
                                fill="white" fillOpacity="0.13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M30 37L34.5 41.5L43 31" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">RMIC <span className="text-indigo-400 font-medium">GRC</span></h1>
                    <p className="text-base text-slate-400 mt-2">
                        Kurumsal Risk ve Uyum Platformu
                    </p>
                </div>

                {/* Login Card */}
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <Input
                            label="E-posta Adresi"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="ornek@sirket.com"
                            required
                            className="bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500"
                        />

                        <Input
                            label="Şifre"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            className="bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500"
                        />

                        <Button
                            type="submit"
                            loading={isLoading}
                            fullWidth
                            className="h-12 text-[15px] mt-2"
                        >
                            Giriş Yap
                        </Button>
                    </form>

                    {/* Demo giriş kısayolları — yalnızca development ortamında gösterilir.
                        Gerçek e-posta/şifre bilgisi production build'inde asla render edilmez. */}
                    {process.env.NODE_ENV !== 'production' && (
                        <>
                            <div className="flex items-center gap-4 my-8">
                                <div className="flex-1 h-px bg-slate-700" />
                                <span className="text-xs font-medium text-slate-500 tracking-wider">HIZLI DEMO ERİŞİMİ (DEV)</span>
                                <div className="flex-1 h-px bg-slate-700" />
                            </div>

                            <div className="space-y-3">
                                {[
                                    { email: 'burak@rmic.com',  label: 'Sistem Yöneticisi', desc: 'Tüm yetkiler' },
                                    { email: 'mgr1@rmic.com',   label: 'İKS Yöneticisi',    desc: 'Bulgu & aksiyon yönetimi' },
                                    { email: 'aud1@rmic.com',   label: 'İKS Çalışanı',      desc: 'Denetim ve bulgular' },
                                ].map(({ email: dEmail, label, desc }) => (
                                    <button
                                        key={dEmail}
                                        type="button"
                                        onClick={() => handleDemoLogin(dEmail)}
                                        disabled={isLoading}
                                        className="w-full flex items-center justify-between p-3 bg-slate-900/50 hover:bg-slate-900 border border-slate-700/50 rounded-xl transition-colors text-left group disabled:opacity-50"
                                    >
                                        <div>
                                            <p className="text-sm font-medium text-slate-200 group-hover:text-white">{label}</p>
                                            <p className="text-xs text-slate-500">{desc} — {dEmail}</p>
                                        </div>
                                        <svg className="w-5 h-5 text-slate-600 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                ))}
                            </div>

                            <p className="text-center text-xs text-slate-600 mt-4">
                                Tüm demo hesapların şifresi: <span className="font-mono text-slate-400">Test1234!</span>
                            </p>
                        </>
                    )}
                </div>

                <div className="text-center mt-8">
                    <p className="text-xs text-slate-500">
                        Güvenli GRC Portalı • IP: 192.168.1.101 • v2.0
                    </p>
                </div>
            </div>
        </div>
    );
}
