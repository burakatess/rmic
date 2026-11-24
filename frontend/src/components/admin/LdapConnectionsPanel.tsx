'use client';

import { useCallback, useEffect, useState } from 'react';
import api, { type LdapConnection, type LdapConnectionInput, type LdapTestResult } from '@/lib/api';
import { Button, DetailSection, Modal, StatusBadge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

const DEFAULT_PORT = { LDAP: 389, LDAPS: 636 } as const;
const EMPTY: LdapConnectionInput = {
    name: '', host: '', protocol: 'LDAPS', port: 636, startTls: false, tlsRejectUnauthorized: true, caCertificate: '',
    baseDn: '', bindDn: '', bindPassword: '', userFilter: '(&(objectClass=person)(|(uid={{username}})(sAMAccountName={{username}})(mail={{username}})))',
    usernameAttribute: 'uid', emailAttribute: 'mail', firstNameAttribute: 'givenName', lastNameAttribute: 'sn', departmentAttribute: 'department',
    timeoutMs: 8000, isActive: true,
};
/** Active Directory için hazır ayar (sAMAccountName). */
const AD_PRESET: Partial<LdapConnectionInput> = {
    userFilter: '(&(objectClass=user)(objectCategory=person)(|(sAMAccountName={{username}})(userPrincipalName={{username}})(mail={{username}})))',
    usernameAttribute: 'sAMAccountName', departmentAttribute: 'department',
};

const field = 'w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const lbl = 'block text-xs font-semibold text-slate-600 mb-1';

/**
 * LDAP bağlantıları: birden fazla sunucu; protokol LDAP (389, isteğe bağlı StartTLS) veya LDAPS (636),
 * port seçilebilir. Servis hesabı şifresi sunucuda şifreli saklanır ve geri gösterilmez.
 */
export function LdapConnectionsPanel() {
    const { success, error: showError } = useToast();
    const [rows, setRows] = useState<LdapConnection[] | null>(null);
    const [editing, setEditing] = useState<LdapConnection | 'new' | null>(null);
    const [form, setForm] = useState<LdapConnectionInput>(EMPTY);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<LdapTestResult | null>(null);
    const [advanced, setAdvanced] = useState(false);

    const load = useCallback(() => { api.getLdapConnections().then(setRows).catch(() => setRows([])); }, []);
    useEffect(() => { load(); }, [load]);

    const open = (c: LdapConnection | 'new') => {
        setEditing(c); setTestResult(null); setAdvanced(false);
        setForm(c === 'new' ? EMPTY : {
            name: c.name, host: c.host, protocol: c.protocol, port: c.port, startTls: c.startTls, tlsRejectUnauthorized: c.tlsRejectUnauthorized,
            caCertificate: c.caCertificate ?? '', baseDn: c.baseDn, bindDn: c.bindDn ?? '', bindPassword: '', userFilter: c.userFilter,
            usernameAttribute: c.usernameAttribute, emailAttribute: c.emailAttribute, firstNameAttribute: c.firstNameAttribute, lastNameAttribute: c.lastNameAttribute,
            departmentAttribute: c.departmentAttribute ?? '', timeoutMs: c.timeoutMs, isActive: c.isActive,
        });
    };
    const set = <K extends keyof LdapConnectionInput>(k: K, v: LdapConnectionInput[K]) => setForm(f => ({ ...f, [k]: v }));
    /** Protokol değişince port varsayılana döner (kullanıcı özel port girmişse yine değiştirilebilir). */
    const setProtocol = (p: 'LDAP' | 'LDAPS') => setForm(f => ({
        ...f, protocol: p, startTls: p === 'LDAPS' ? false : f.startTls,
        port: f.port === DEFAULT_PORT.LDAP || f.port === DEFAULT_PORT.LDAPS || !f.port ? DEFAULT_PORT[p] : f.port,
    }));
    const payload = (): LdapConnectionInput => ({ ...form, port: Number(form.port), timeoutMs: Number(form.timeoutMs), bindPassword: form.bindPassword || undefined });

    const save = async () => {
        setSaving(true);
        try {
            if (editing === 'new') await api.createLdapConnection(payload());
            else if (editing) await api.updateLdapConnection(editing.id, payload());
            success('Kaydedildi', 'LDAP bağlantısı kaydedildi.');
            setEditing(null); load();
        } catch (e) { showError('Kaydedilemedi', (e as Error).message); }
        finally { setSaving(false); }
    };
    const testDraft = async () => {
        setTesting('draft'); setTestResult(null);
        try { setTestResult(await api.testLdapDraft({ ...payload(), ...(editing && editing !== 'new' ? { connectionId: editing.id } : {}) })); }
        catch (e) { setTestResult({ ok: false, message: (e as Error).message, ms: 0 }); }
        finally { setTesting(null); }
    };
    const testSaved = async (c: LdapConnection) => {
        setTesting(c.id);
        try {
            const r = await api.testLdapConnection(c.id);
            if (r.ok) success('Bağlantı başarılı', `${c.name}: ${r.message} (${r.ms} ms)`); else showError('Bağlantı başarısız', `${c.name}: ${r.message}`);
            load();
        } catch (e) { showError('Test yapılamadı', (e as Error).message); }
        finally { setTesting(null); }
    };
    const remove = async (c: LdapConnection) => {
        if (!window.confirm(`${c.name} bağlantısı silinsin mi?`)) return;
        try { await api.deleteLdapConnection(c.id); success('Silindi', `${c.name} silindi.`); load(); }
        catch (e) { showError('Silinemedi', (e as Error).message); }
    };

    return (
        <DetailSection title="LDAP / Active Directory bağlantıları" count={rows?.length}
            description="Kullanıcılar yerel veya LDAP olarak eklenebilir. LDAP kullanıcısının şifresi bu bağlantı üzerinden dizinde doğrulanır."
            actions={<Button size="sm" variant="primary" onClick={() => open('new')}>+ Bağlantı ekle</Button>} testId="ldap-connections">
            {!rows ? <div className="h-16 rounded-lg bg-slate-100 animate-pulse" /> : rows.length === 0 ? (
                <p className="text-sm text-slate-500">Henüz LDAP bağlantısı yok. Bağlantı ekleyince Kullanıcı Yönetimi&apos;nde &quot;LDAP&apos;tan ekle&quot; kullanılabilir.</p>
            ) : (
                <ul className="divide-y divide-slate-100 -my-2">
                    {rows.map(c => (
                        <li key={c.id} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="ldap-connection-row">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <b className="text-sm text-slate-900">{c.name}</b>
                                    <StatusBadge variant={c.protocol === 'LDAPS' || c.startTls ? 'success' : 'warning'}>{c.protocol}{c.protocol === 'LDAP' && c.startTls ? ' + StartTLS' : ''}</StatusBadge>
                                    {!c.isActive && <StatusBadge variant="neutral">Pasif</StatusBadge>}
                                    {c.lastTestOk === true && <StatusBadge variant="success" dot>Son test başarılı</StatusBadge>}
                                    {c.lastTestOk === false && <StatusBadge variant="critical" dot>Son test başarısız</StatusBadge>}
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5 font-mono break-all">{c.protocol.toLowerCase()}://{c.host}:{c.port} · {c.baseDn}</p>
                                {c.lastTestOk === false && c.lastTestMessage && <p className="text-xs text-red-600 mt-0.5">{c.lastTestMessage}</p>}
                            </div>
                            <span className="text-xs text-slate-500">{c.userCount ?? 0} kullanıcı</span>
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" loading={testing === c.id} onClick={() => testSaved(c)}>Test et</Button>
                                <Button size="sm" variant="secondary" onClick={() => open(c)}>Düzenle</Button>
                                {(c.userCount ?? 0) === 0 && <Button size="sm" variant="ghost" onClick={() => remove(c)}>Sil</Button>}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <Modal open={!!editing} onClose={() => !saving && setEditing(null)} size="lg" title={editing === 'new' ? 'LDAP bağlantısı ekle' : 'LDAP bağlantısını düzenle'}
                footer={<div className="flex flex-wrap items-center justify-between gap-2 w-full">
                    <Button variant="outline" size="sm" loading={testing === 'draft'} onClick={testDraft}>Bağlantıyı test et</Button>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditing(null)} disabled={saving}>Vazgeç</Button>
                        <Button variant="primary" size="sm" loading={saving} onClick={save} disabled={!form.name || !form.host || !form.baseDn || !form.port}>Kaydet</Button>
                    </div>
                </div>}>
                <div className="space-y-4" data-testid="ldap-form">
                    {testResult && (
                        <p className={`text-sm rounded-lg px-3 py-2 ${testResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`} data-testid="ldap-test-result">
                            {testResult.ok ? '✓ ' : '✗ '}{testResult.message}{testResult.ms ? ` (${testResult.ms} ms)` : ''}
                        </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label htmlFor="ld-name" className={lbl}>Bağlantı adı *</label><input id="ld-name" className={field} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ör. Kurum AD" /></div>
                        <div><label htmlFor="ld-host" className={lbl}>Sunucu (ana bilgisayar adı / IP) *</label><input id="ld-host" className={field} value={form.host} onChange={e => set('host', e.target.value.trim())} placeholder="dc01.kurum.local" /></div>
                    </div>
                    <fieldset>
                        <legend className={lbl}>Protokol ve port *</legend>
                        <div className="flex flex-wrap items-center gap-3">
                            {(['LDAPS', 'LDAP'] as const).map(p => (
                                <label key={p} className={`flex items-center gap-2 h-10 px-3 rounded-lg border text-sm cursor-pointer ${form.protocol === p ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-300'}`}>
                                    <input type="radio" name="ld-protocol" checked={form.protocol === p} onChange={() => setProtocol(p)} />
                                    {p === 'LDAPS' ? 'LDAPS (TLS, 636)' : 'LDAP (389)'}
                                </label>
                            ))}
                            <label htmlFor="ld-port" className="text-sm text-slate-600">Port</label>
                            <input id="ld-port" type="number" min={1} max={65535} className={`${field} w-28`} value={form.port} onChange={e => set('port', Number(e.target.value))} />
                            {form.port !== DEFAULT_PORT[form.protocol] && <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => set('port', DEFAULT_PORT[form.protocol])}>Varsayılana dön ({DEFAULT_PORT[form.protocol]})</button>}
                        </div>
                        {form.protocol === 'LDAP' && (
                            <label className="flex items-center gap-2 text-sm text-slate-700 mt-2">
                                <input type="checkbox" checked={form.startTls} onChange={e => set('startTls', e.target.checked)} /> StartTLS ile şifrele
                                {!form.startTls && <span className="text-xs text-amber-700">(şifresiz LDAP: şifreler ağda açık gider; yalnız güvenli ağda kullanın)</span>}
                            </label>
                        )}
                    </fieldset>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label htmlFor="ld-base" className={lbl}>Temel DN (Base DN) *</label><input id="ld-base" className={field} value={form.baseDn} onChange={e => set('baseDn', e.target.value)} placeholder="dc=kurum,dc=local" /></div>
                        <div><label htmlFor="ld-binddn" className={lbl}>Servis hesabı DN</label><input id="ld-binddn" className={field} value={form.bindDn ?? ''} onChange={e => set('bindDn', e.target.value)} placeholder="cn=svc-grc,ou=service,dc=kurum,dc=local" /></div>
                        <div>
                            <label htmlFor="ld-bindpw" className={lbl}>Servis hesabı şifresi</label>
                            <input id="ld-bindpw" type="password" autoComplete="new-password" className={field} value={form.bindPassword ?? ''} onChange={e => set('bindPassword', e.target.value)}
                                placeholder={editing && editing !== 'new' && editing.hasBindPassword ? '•••••• (kayıtlı — değiştirmek için yazın)' : ''} />
                            <p className="text-[11px] text-slate-500 mt-1">Şifreli saklanır, geri gösterilmez.</p>
                        </div>
                        {(form.protocol === 'LDAPS' || form.startTls) && (
                            <label className="flex items-start gap-2 text-sm text-slate-700 md:mt-6">
                                <input type="checkbox" className="mt-0.5" checked={form.tlsRejectUnauthorized} onChange={e => set('tlsRejectUnauthorized', e.target.checked)} />
                                <span>Sunucu sertifikasını doğrula{!form.tlsRejectUnauthorized && <span className="block text-xs text-red-600">Kapalı: araya girme saldırısına açık; yalnız test için.</span>}</span>
                            </label>
                        )}
                    </div>
                    <button type="button" className="text-sm font-semibold text-blue-600 hover:underline" onClick={() => setAdvanced(a => !a)} aria-expanded={advanced}>{advanced ? '▾' : '▸'} Gelişmiş: filtre, öznitelikler, CA sertifikası</button>
                    {advanced && (
                        <div className="space-y-4 border-t border-slate-100 pt-4">
                            <div className="flex gap-2"><Button size="xs" variant="outline" onClick={() => setForm(f => ({ ...f, ...AD_PRESET }))}>Active Directory ayarlarını uygula</Button></div>
                            <div><label htmlFor="ld-filter" className={lbl}>Kullanıcı filtresi ({'{{username}}'} zorunlu)</label><input id="ld-filter" className={`${field} font-mono text-xs`} value={form.userFilter} onChange={e => set('userFilter', e.target.value)} /></div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                {([['usernameAttribute', 'Kullanıcı adı'], ['emailAttribute', 'E-posta'], ['firstNameAttribute', 'Ad'], ['lastNameAttribute', 'Soyad'], ['departmentAttribute', 'Birim']] as const).map(([k, l]) => (
                                    <div key={k}><label htmlFor={`ld-${k}`} className={lbl}>{l}</label><input id={`ld-${k}`} className={`${field} font-mono text-xs`} value={(form[k] as string) ?? ''} onChange={e => set(k, e.target.value)} /></div>
                                ))}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2"><label htmlFor="ld-ca" className={lbl}>Kurum CA sertifikası (PEM, isteğe bağlı)</label><textarea id="ld-ca" rows={4} className={`${field} h-auto py-2 font-mono text-[11px]`} value={form.caCertificate ?? ''} onChange={e => set('caCertificate', e.target.value)} placeholder="-----BEGIN CERTIFICATE-----" /></div>
                                <div className="space-y-3">
                                    <div><label htmlFor="ld-timeout" className={lbl}>Zaman aşımı (ms)</label><input id="ld-timeout" type="number" min={1000} max={60000} step={500} className={field} value={form.timeoutMs} onChange={e => set('timeoutMs', Number(e.target.value))} /></div>
                                    <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} /> Bağlantı aktif</label>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </DetailSection>
    );
}
