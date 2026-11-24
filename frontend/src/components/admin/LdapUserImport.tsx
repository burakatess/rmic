'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api, { type LdapConnection, type LdapDirectoryUser } from '@/lib/api';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

const field = 'w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

/**
 * Dizinden (LDAP) kullanıcı ekleme: bağlantı seç → ara → kişiyi seç → rol ata. Ad, soyad, e-posta ve
 * birim dizinden okunur (formda yazılmaz); yerel şifre yoktur, giriş şifresi LDAP'ta doğrulanır.
 */
export function LdapUserImport({ roles, roleLabel, onCreated, onCancel }: {
    roles: Array<{ id: string; name: string }>;
    roleLabel: (name: string) => string;
    onCreated: () => void;
    onCancel: () => void;
}) {
    const { success, error: showError } = useToast();
    const [conns, setConns] = useState<LdapConnection[] | null>(null);
    const [connId, setConnId] = useState('');
    const [q, setQ] = useState('');
    const [results, setResults] = useState<LdapDirectoryUser[] | null>(null);
    const [searching, setSearching] = useState(false);
    const [picked, setPicked] = useState<LdapDirectoryUser | null>(null);
    const [roleId, setRoleId] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.getLdapConnections().then(r => {
            const active = r.filter(c => c.isActive);
            setConns(active);
            if (active.length === 1) setConnId(active[0].id);
        }).catch(() => setConns([]));
    }, []);

    const search = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!connId || q.trim().length < 2) return;
        setSearching(true); setPicked(null);
        try { setResults(await api.searchLdapDirectory(connId, q.trim())); }
        catch (err) { setResults([]); showError('Arama yapılamadı', (err as Error).message); }
        finally { setSearching(false); }
    };
    const create = async () => {
        if (!picked || !roleId) return;
        setSaving(true);
        try {
            await api.createLdapUser({ connectionId: connId, username: picked.username, roleId });
            success('Kullanıcı eklendi', `${picked.firstName} ${picked.lastName} LDAP kullanıcısı olarak eklendi; kurum şifresiyle giriş yapar.`);
            onCreated();
        } catch (err) { showError('Eklenemedi', (err as Error).message); }
        finally { setSaving(false); }
    };

    if (conns === null) return <div className="h-24 rounded-lg bg-slate-100 animate-pulse" />;
    if (conns.length === 0) {
        return (
            <div className="space-y-3">
                <p className="text-sm text-slate-600">Aktif LDAP bağlantısı yok. Önce <Link href="/admin/integrations" className="text-blue-600 hover:underline">Entegrasyonlar</Link> sayfasından bir LDAP/LDAPS bağlantısı ekleyin.</p>
                <div className="flex justify-end"><Button variant="outline" onClick={onCancel}>Kapat</Button></div>
            </div>
        );
    }
    return (
        <div className="space-y-4" data-testid="ldap-user-import">
            <form onSubmit={search} className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-2 items-end">
                <div>
                    <label htmlFor="li-conn" className="block text-sm font-medium text-slate-700 mb-1">LDAP bağlantısı</label>
                    <select id="li-conn" className={field} value={connId} onChange={e => { setConnId(e.target.value); setResults(null); setPicked(null); }}>
                        <option value="">Seçin</option>
                        {conns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.protocol}:{c.port})</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="li-q" className="block text-sm font-medium text-slate-700 mb-1">Dizinde ara</label>
                    <input id="li-q" className={field} value={q} onChange={e => setQ(e.target.value)} placeholder="Ad, soyad, kullanıcı adı veya e-posta (en az 2 karakter)" />
                </div>
                <Button type="submit" variant="outline" loading={searching} disabled={!connId || q.trim().length < 2}>Ara</Button>
            </form>

            {results && (
                <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg" data-testid="ldap-results">
                    {results.length === 0 && <li className="px-3 py-3 text-sm text-slate-400">Eşleşen dizin kullanıcısı yok.</li>}
                    {results.map(u => {
                        const disabled = u.alreadyExists || !u.email;
                        return (
                            <li key={u.dn}>
                                <label className={`flex items-start gap-3 px-3 py-2.5 ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'} ${picked?.dn === u.dn ? 'bg-blue-50' : ''}`}>
                                    <input type="radio" name="li-pick" className="mt-1" disabled={disabled} checked={picked?.dn === u.dn} onChange={() => setPicked(u)} aria-label={`${u.username} seç`} />
                                    <span className="min-w-0 flex-1">
                                        <span className="text-sm font-semibold text-slate-900">{u.firstName} {u.lastName}</span>
                                        <span className="ml-2 font-mono text-xs text-slate-500">{u.username}</span>
                                        <span className="block text-xs text-slate-500 truncate">{u.email ?? 'e-posta yok'}{u.department ? ` · ${u.department}` : ''}</span>
                                    </span>
                                    {u.alreadyExists && <span className="text-xs font-semibold text-emerald-700">Zaten ekli</span>}
                                    {!u.alreadyExists && !u.email && <span className="text-xs font-semibold text-amber-700">E-posta yok</span>}
                                </label>
                            </li>
                        );
                    })}
                </ul>
            )}

            <div>
                <label htmlFor="li-role" className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                <select id="li-role" className={field} value={roleId} onChange={e => setRoleId(e.target.value)}>
                    <option value="">Rol seçin</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{roleLabel(r.name)}</option>)}
                </select>
            </div>
            <p className="text-xs text-slate-500">Ad, soyad, e-posta ve birim dizinden alınır. Kullanıcı uygulamaya kurum (LDAP) şifresiyle girer; şifresi uygulamada tutulmaz.</p>
            <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={onCancel}>İptal</Button>
                <Button type="button" variant="primary" loading={saving} disabled={!picked || !roleId} onClick={create}>LDAP kullanıcısını ekle</Button>
            </div>
        </div>
    );
}
