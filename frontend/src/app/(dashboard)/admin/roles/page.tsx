'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { PageShell, PageHeader, Button, LoadingState, StatusBadge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

interface Role {
    id: string;
    name: string;
    description?: string;
    permissions: string[];
    _count?: { users: number };
}

const roleLabels: Record<string, string> = {
    SYSTEM_ADMIN: 'Sistem Yöneticisi',
    RISK_CONTROL_MANAGER: 'Risk ve İK Yöneticisi',
    AUDITOR: 'Denetçi',
    AUDITEE: 'Birim Kullanıcısı (Denetlenen)',
    RISK_ANALYST: 'Risk Analisti',
    VIEWER: 'Görüntüleyici',
    IKS_MANAGER: 'İKS Yöneticisi (eski)',
    IKS_EMPLOYEE: 'İKS Çalışanı (eski)',
};

const roleDescriptions: Record<string, string> = {
    SYSTEM_ADMIN: 'Kullanıcı ve sistem yönetimi yetkilerine sahip',
    RISK_CONTROL_MANAGER: 'Risk ve kontrol yönetimi işlemlerini gerçekleştirir',
    AUDITOR: 'Merkezi iç kontrol çalışanı — kurum geneli kayıt kapsamı',
    AUDITEE: 'Yetkili birimlerinin ve kendisine atanmış işlerin kayıtları',
    RISK_ANALYST: 'Riskte kurum geneli; diğer kayıtlarda birim + atama',
    VIEWER: 'Yetkili birimlerinde salt okunur',
};

// İzin kataloğu backend'den gelir (GET /admin/permissions) — burada elle tutulan liste YOK.
interface PermissionDef {
    key: string;
    group: string;
    label: string;
    description: string;
    enforcedIn: ('api' | 'ui')[];
}
interface PermissionCatalog {
    groups: { key: string; label: string }[];
    permissions: PermissionDef[];
    legacy: Record<string, { target: string | null; equivalent: boolean; note: string }>;
}

function enforcementLabel(p: PermissionDef): { text: string; tone: string } | null {
    if (p.enforcedIn.length === 0) return { text: 'Henüz denetlenmiyor', tone: 'text-slate-400' };
    if (!p.enforcedIn.includes('api')) return { text: 'Yalnız menü/görünürlük', tone: 'text-amber-600' };
    return null;
}

export default function RolesPage() {
    const { success, error: showError } = useToast();
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [saving, setSaving] = useState(false);
    const [editedPermissions, setEditedPermissions] = useState<string[]>([]);
    const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);

    useEffect(() => {
        loadRoles();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadRoles = async () => {
        try {
            const [rolesRes, catalogRes] = await Promise.all([
                api.request<Role[]>('/admin/roles'),
                api.request<PermissionCatalog>('/admin/permissions'),
            ]);
            setCatalog(catalogRes);
            // Tüm roller yönetilebilir (önceden yalnız 4 rol listeleniyordu).
            const activeRoles = rolesRes;
            setRoles(activeRoles);
            if (activeRoles.length > 0 && !selectedRole) {
                setSelectedRole(activeRoles[0]);
                setEditedPermissions(activeRoles[0].permissions || []);
            }
        } catch (error) {
            console.error('Failed to load roles:', error);
            showError('Hata', error instanceof Error ? error.message : 'Roller veya izin kataloğu yüklenemedi');
        } finally {
            setLoading(false);
        }
    };

    const handleRoleSelect = (role: Role) => {
        setSelectedRole(role);
        setEditedPermissions(role.permissions || []);
    };

    const hasPermission = (permission: string) => {
        // Check for exact match or wildcard
        if (editedPermissions.includes(permission)) return true;
        const [module] = permission.split(':');
        if (editedPermissions.includes(`${module}:*`)) return true;
        return false;
    };

    const togglePermission = (permission: string) => {
        const newPermissions = [...editedPermissions];
        const index = newPermissions.indexOf(permission);

        if (index > -1) {
            newPermissions.splice(index, 1);
        } else {
            // If adding a wildcard, remove individual permissions
            if (permission.endsWith(':*')) {
                const [module] = permission.split(':');
                const filtered = newPermissions.filter(p => !p.startsWith(`${module}:`));
                filtered.push(permission);
                setEditedPermissions(filtered);
                return;
            }
            // If adding specific permission while wildcard exists, do nothing
            const [module] = permission.split(':');
            if (newPermissions.includes(`${module}:*`)) {
                return;
            }
            newPermissions.push(permission);
        }
        setEditedPermissions(newPermissions);
    };

    const handleSave = async () => {
        if (!selectedRole) return;
        setSaving(true);
        try {
            await api.request(`/admin/roles/${selectedRole.id}`, {
                method: 'PUT',
                body: { permissions: editedPermissions }
            });
            // Update local state
            setRoles(roles.map(r =>
                r.id === selectedRole.id ? { ...r, permissions: editedPermissions } : r
            ));
            setSelectedRole({ ...selectedRole, permissions: editedPermissions });
            success('Kaydedildi', 'Yetkiler başarıyla kaydedildi.');
        } catch (error) {
            console.error('Failed to save permissions:', error);
            showError('Hata', error instanceof Error ? error.message : 'Yetkiler kaydedilirken bir hata oluştu');
        } finally {
            setSaving(false);
        }
    };

    // Rolde bulunan ama katalogda olmayan (eski ekrandan kalma) anahtarlar.
    const knownKeys = new Set((catalog?.permissions ?? []).map(p => p.key));
    const knownResources = new Set([...knownKeys].map(k => k.split(':')[0]));
    const legacyKeys = editedPermissions.filter(p =>
        p !== '*' && !knownKeys.has(p) && !(p.endsWith(':*') && knownResources.has(p.split(':')[0])));

    const hasChanges = () => {
        if (!selectedRole) return false;
        const original = selectedRole.permissions || [];
        if (original.length !== editedPermissions.length) return true;
        return !original.every(p => editedPermissions.includes(p));
    };

    if (loading) {
        return (
            <PageShell>
                <LoadingState message="Roller yükleniyor..." />
            </PageShell>
        );
    }

    return (
        <PageShell>
            <PageHeader
                title="Rol Yetkileri"
                description="Rol bazlı erişim yetkilerini yönetin"
                breadcrumbs={[{ label: 'Yönetim' }, { label: 'Roller' }]}
                actions={
                    hasChanges() ? (
                        <Button
                            variant="primary"
                            onClick={handleSave}
                            loading={saving}
                            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                        >
                            Değişiklikleri Kaydet
                        </Button>
                    ) : undefined
                }
            />

            <div className="grid grid-cols-12 gap-6">
                {/* Role List */}
                <div className="col-span-12 md:col-span-3">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-slate-100">
                            <h3 className="text-sm font-semibold text-slate-700">Roller</h3>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {roles.map((role) => (
                                <button
                                    key={role.id}
                                    onClick={() => handleRoleSelect(role)}
                                    className={`w-full p-4 text-left transition-colors cursor-pointer ${selectedRole?.id === role.id
                                            ? 'bg-blue-50 border-l-4 border-blue-500'
                                            : 'hover:bg-slate-50 border-l-4 border-transparent'
                                        }`}
                                >
                                    <p className="text-sm font-medium text-slate-800">
                                        {roleLabels[role.name] || role.name}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {role._count?.users || 0} kullanıcı
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Permission Matrix */}
                <div className="col-span-12 md:col-span-9">
                    {selectedRole ? (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-3.5 border-b border-slate-100">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-700">
                                            {roleLabels[selectedRole.name] || selectedRole.name}
                                        </h3>
                                        <p className="text-xs text-slate-500 mt-1">
                                            {roleDescriptions[selectedRole.name] || selectedRole.description}
                                        </p>
                                    </div>
                                    <StatusBadge variant="info" size="md">{editedPermissions.length} yetki</StatusBadge>
                                </div>
                            </div>

                            <div className="p-4 space-y-6">
                                {legacyKeys.length > 0 && (
                                    <div className="border border-amber-300 bg-amber-50 rounded-xl p-4">
                                        <h4 className="text-sm font-semibold text-amber-800 mb-1">Katalogda olmayan eski anahtarlar</h4>
                                        <p className="text-xs text-amber-700 mb-3">
                                            Bu anahtarlar hiçbir yerde denetlenmiyor. Otomatik dönüştürülmez; önerilen karşılığı kontrol edip elle verin, ardından eskisini kaldırın.
                                        </p>
                                        <ul className="space-y-2">
                                            {legacyKeys.map(k => {
                                                const m = catalog?.legacy[k];
                                                return (
                                                    <li key={k} className="flex items-center justify-between gap-3 text-xs">
                                                        <span>
                                                            <code className="font-mono text-amber-900">{k}</code>
                                                            {m?.target
                                                                ? <> → öneri <code className="font-mono">{m.target}</code>{m.equivalent ? ' (eşdeğer)' : ' (eşdeğer değil)'}</>
                                                                : ' → karşılığı yok'}
                                                            {m?.note ? <span className="text-amber-700"> — {m.note}</span> : null}
                                                        </span>
                                                        <button type="button" className="text-amber-800 underline" onClick={() => setEditedPermissions(editedPermissions.filter(p => p !== k))}>
                                                            Kaldır
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}
                                {(catalog?.groups ?? []).map((group) => {
                                    const perms = (catalog?.permissions ?? []).filter(p => p.group === group.key);
                                    if (perms.length === 0) return null;
                                    // Joker yalnız tek kaynaklı gruplarda sunulur (matchesPermission: kaynak:*).
                                    const resources = [...new Set(perms.map(p => p.key.split(':')[0]))];
                                    const wildcard = resources.length === 1 ? `${resources[0]}:*` : null;
                                    const items = wildcard
                                        ? [...perms, { key: wildcard, group: group.key, label: 'Tam yetki', description: `${resources[0]} kaynağının tüm izinleri`, enforcedIn: ['api', 'ui'] } as PermissionDef]
                                        : perms;
                                    return (
                                    <div key={group.key} className="border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                                            <h4 className="text-sm font-semibold text-slate-700">{group.label}</h4>
                                        </div>
                                        <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                                            {items.map((perm) => {
                                                const isActive = hasPermission(perm.key);
                                                const isWildcard = perm.key.endsWith(':*');
                                                const enforcement = enforcementLabel(perm);
                                                return (
                                                    <button
                                                        key={perm.key}
                                                        onClick={() => togglePermission(perm.key)}
                                                        aria-pressed={isActive}
                                                        data-permission={perm.key}
                                                        className={`p-3 rounded-lg border-2 text-left transition-all cursor-pointer ${isActive
                                                                ? isWildcard
                                                                    ? 'border-amber-400 bg-amber-50'
                                                                    : 'border-emerald-400 bg-emerald-50'
                                                                : 'border-slate-200 hover:border-slate-300'
                                                            }`}
                                                        title={`${perm.key} — ${perm.description}`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${isActive
                                                                    ? isWildcard
                                                                        ? 'bg-amber-500 text-white'
                                                                        : 'bg-emerald-500 text-white'
                                                                    : 'bg-slate-200'
                                                                }`}>
                                                                {isActive && (
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                            <span className={`text-sm font-medium ${isActive ? 'text-slate-800' : 'text-slate-600'}`}>
                                                                {perm.label}
                                                            </span>
                                                        </div>
                                                        <p className="mt-1 text-[11px] font-mono text-slate-400">{perm.key}</p>
                                                        {enforcement && <p className={`mt-0.5 text-[11px] ${enforcement.tone}`}>{enforcement.text}</p>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
                            <p className="text-sm text-slate-500">Düzenlemek için bir rol seçin</p>
                        </div>
                    )}
                </div>
            </div>
        </PageShell>
    );
}
