'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { PageHeader } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth/AuthProvider';

const ROLE_LABELS: Record<string, string> = {
    SYSTEM_ADMIN: 'Sistem Yöneticisi',
    RISK_CONTROL_MANAGER: 'Risk & Kontrol Yöneticisi',
    AUDITOR: 'Denetçi',
    RISK_ANALYST: 'Risk Analisti',
    VIEWER: 'İzleyici',
    IKS_EMPLOYEE: 'İKS Çalışanı',
    IKS_MANAGER: 'İKS Yöneticisi',
};

const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-slate-50 disabled:text-slate-500';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

export default function ProfilePage() {
    const { user, refreshUser } = useAuth();
    const { success: toastSuccess, error: toastError } = useToast();

    const [profile, setProfile] = useState({ firstName: '', lastName: '', department: '' });
    const [savingProfile, setSavingProfile] = useState(false);

    const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [savingPwd, setSavingPwd] = useState(false);

    useEffect(() => {
        if (user) {
            setProfile({
                firstName: user.firstName ?? '',
                lastName: user.lastName ?? '',
                department: user.department ?? '',
            });
        }
    }, [user]);

    const handleProfileSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile.firstName.trim() || !profile.lastName.trim()) {
            toastError('Hata', 'Ad ve soyad boş olamaz.');
            return;
        }
        setSavingProfile(true);
        try {
            await api.updateProfile({
                firstName: profile.firstName.trim(),
                lastName: profile.lastName.trim(),
                department: profile.department.trim() || undefined,
            });
            await refreshUser();
            toastSuccess('Başarılı', 'Profil bilgileriniz güncellendi.');
        } catch (err: any) {
            toastError('Hata', err.message || 'Profil güncellenemedi.');
        } finally {
            setSavingProfile(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pwd.newPassword.length < 8) {
            toastError('Hata', 'Yeni şifre en az 8 karakter olmalıdır.');
            return;
        }
        if (pwd.newPassword !== pwd.confirmPassword) {
            toastError('Hata', 'Yeni şifre ve tekrarı eşleşmiyor.');
            return;
        }
        setSavingPwd(true);
        try {
            await api.changePassword({ currentPassword: pwd.currentPassword, newPassword: pwd.newPassword });
            setPwd({ currentPassword: '', newPassword: '', confirmPassword: '' });
            toastSuccess('Başarılı', 'Şifreniz değiştirildi.');
        } catch (err: any) {
            toastError('Hata', err.message || 'Şifre değiştirilemedi.');
        } finally {
            setSavingPwd(false);
        }
    };

    if (!user) return null;

    return (
        <div className="space-y-6 max-w-3xl">
            <PageHeader title="Profilim" description="Hesap bilgilerinizi görüntüleyin ve güncelleyin" />

            {/* Profil Bilgileri */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                    <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-lg">
                        {user.firstName?.[0]}{user.lastName?.[0]}
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900">{user.firstName} {user.lastName}</h3>
                        <p className="text-xs text-slate-500">{ROLE_LABELS[user.role?.name] ?? user.role?.name}</p>
                    </div>
                </div>
                <form onSubmit={handleProfileSave} className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>E-posta</label>
                            <input type="email" value={user.email} disabled className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Rol</label>
                            <input type="text" value={ROLE_LABELS[user.role?.name] ?? user.role?.name} disabled className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Ad *</label>
                            <input type="text" required value={profile.firstName}
                                onChange={e => setProfile(p => ({ ...p, firstName: e.target.value }))} className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Soyad *</label>
                            <input type="text" required value={profile.lastName}
                                onChange={e => setProfile(p => ({ ...p, lastName: e.target.value }))} className={inputCls} />
                        </div>
                        <div className="md:col-span-2">
                            <label className={labelCls}>Departman</label>
                            <input type="text" value={profile.department}
                                onChange={e => setProfile(p => ({ ...p, department: e.target.value }))} className={inputCls} />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button type="submit" disabled={savingProfile}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
                            {savingProfile ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Şifre Değiştir */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900">Şifre Değiştir</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Yeni şifre en az 8 karakter olmalıdır</p>
                </div>
                <form onSubmit={handlePasswordChange} className="p-6 space-y-4">
                    <div>
                        <label className={labelCls}>Mevcut Şifre *</label>
                        <input type="password" required autoComplete="current-password" value={pwd.currentPassword}
                            onChange={e => setPwd(p => ({ ...p, currentPassword: e.target.value }))} className={inputCls} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>Yeni Şifre *</label>
                            <input type="password" required autoComplete="new-password" minLength={8} value={pwd.newPassword}
                                onChange={e => setPwd(p => ({ ...p, newPassword: e.target.value }))} className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Yeni Şifre (Tekrar) *</label>
                            <input type="password" required autoComplete="new-password" minLength={8} value={pwd.confirmPassword}
                                onChange={e => setPwd(p => ({ ...p, confirmPassword: e.target.value }))} className={inputCls} />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button type="submit" disabled={savingPwd}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
                            {savingPwd ? 'Değiştiriliyor...' : 'Şifreyi Değiştir'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
