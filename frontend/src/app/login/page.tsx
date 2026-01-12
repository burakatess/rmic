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
        <div style={{
            minHeight: '100vh',
            backgroundColor: '#0f172a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            <div style={{ width: '100%', maxWidth: '400px' }}>
                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <img
                        src="/ignis-icon.png"
                        alt="Burak GRC"
                        style={{
                            height: '64px',
                            width: '64px',
                            objectFit: 'contain',
                            marginBottom: '20px'
                        }}
                    />
                    <h1 style={{ fontSize: '26px', fontWeight: 600, color: 'white', margin: 0 }}>Burak GRC</h1>
                    <p style={{ fontSize: '15px', color: '#64748b', marginTop: '8px' }}>
                        Risk Yönetimi ve İç Kontrol Platformu
                    </p>
                </div>

                <div style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '16px',
                    padding: '32px'
                }}>
                    <form onSubmit={handleSubmit}>
                        {error && (
                            <div style={{
                                backgroundColor: '#450a0a',
                                border: '1px solid #7f1d1d',
                                borderRadius: '12px',
                                padding: '12px 16px',
                                marginBottom: '20px',
                                color: '#fca5a5',
                                fontSize: '14px'
                            }}>
                                {error}
                            </div>
                        )}

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#94a3b8', marginBottom: '8px' }}>
                                E-posta Adresi
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="ornek@sirket.com"
                                required
                                style={{
                                    width: '100%',
                                    height: '48px',
                                    padding: '0 16px',
                                    backgroundColor: '#0f172a',
                                    border: '1px solid #334155',
                                    borderRadius: '12px',
                                    color: 'white',
                                    fontSize: '15px',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#94a3b8', marginBottom: '8px' }}>
                                Şifre
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                style={{
                                    width: '100%',
                                    height: '48px',
                                    padding: '0 16px',
                                    backgroundColor: '#0f172a',
                                    border: '1px solid #334155',
                                    borderRadius: '12px',
                                    color: 'white',
                                    fontSize: '15px',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            style={{
                                width: '100%',
                                height: '48px',
                                backgroundColor: '#2563eb',
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                fontSize: '15px',
                                fontWeight: 600,
                                cursor: isLoading ? 'not-allowed' : 'pointer',
                                opacity: isLoading ? 0.7 : 1
                            }}
                        >
                            {isLoading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
                        </button>
                    </form>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '28px 0' }}>
                        <div style={{ flex: 1, height: '1px', backgroundColor: '#334155' }} />
                        <span style={{ fontSize: '12px', color: '#475569' }}>DEMO</span>
                        <div style={{ flex: 1, height: '1px', backgroundColor: '#334155' }} />
                    </div>

                    <div style={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div>
                            <p style={{ fontSize: '14px', fontWeight: 500, color: 'white', margin: 0 }}>admin@grc.com</p>
                            <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>Şifre: password123</p>
                        </div>
                        <button
                            type="button"
                            onClick={handleDemoLogin}
                            disabled={isLoading}
                            style={{
                                height: '36px',
                                padding: '0 20px',
                                backgroundColor: '#2563eb',
                                border: 'none',
                                borderRadius: '8px',
                                color: 'white',
                                fontSize: '13px',
                                fontWeight: 500,
                                cursor: isLoading ? 'not-allowed' : 'pointer',
                                opacity: isLoading ? 0.7 : 1
                            }}
                        >
                            Hızlı Giriş
                        </button>
                    </div>
                </div>

                <p style={{ textAlign: 'center', fontSize: '12px', color: '#475569', marginTop: '32px' }}>
                    © 2026 Burak GRC. Tüm hakları saklıdır.
                </p>
            </div>
        </div>
    );
}
