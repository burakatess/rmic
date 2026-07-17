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
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-800 rounded-2xl mb-6 shadow-xl border border-blue-700/50">
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-semibold text-white tracking-tight">Burak GRC</h1>
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
