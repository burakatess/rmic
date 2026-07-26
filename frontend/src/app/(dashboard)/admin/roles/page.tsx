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
    AUDITEE: 'Denetlenen',
};

const roleDescriptions: Record<string, string> = {
    SYSTEM_ADMIN: 'Kullanıcı ve sistem yönetimi yetkilerine sahip',
    RISK_CONTROL_MANAGER: 'Risk ve kontrol yönetimi işlemlerini gerçekleştirir',
    AUDITOR: 'Denetim ve bulgu oluşturma yetkilerine sahip',
    AUDITEE: 'Sadece kendisine atanan bulgu ve aksiyonları görür',
};

// Permission categories and items
const permissionCategories = [
    {
        name: 'Dashboard',
        key: 'dashboard',
        permissions: [
            { key: 'dashboard:read', label: 'Görüntüleme', description: 'Dashboard görüntüleme' },
            { key: 'dashboard:read:own', label: 'Kendi Verileri', description: 'Sadece kendi verilerini görür' },
        ]
    },
    {
        name: 'Risk Yönetimi',
        key: 'risk',
        permissions: [
            { key: 'risk:read', label: 'Görüntüleme', description: 'Riskleri görüntüleme' },
            { key: 'risk:create', label: 'Oluşturma', description: 'Yeni risk oluşturma' },
            { key: 'risk:update', label: 'Düzenleme', description: 'Risk düzenleme' },
            { key: 'risk:delete', label: 'Silme', description: 'Risk silme' },
            { key: 'risk:*', label: 'Tam Yetki', description: 'Tüm risk yetkileri' },
        ]
    },
    {
        name: 'Kontrol Yönetimi',
        key: 'control',
        permissions: [
            { key: 'control:read', label: 'Görüntüleme', description: 'Kontrolleri görüntüleme' },
            { key: 'control:create', label: 'Oluşturma', description: 'Yeni kontrol oluşturma' },
            { key: 'control:update', label: 'Düzenleme', description: 'Kontrol düzenleme' },
            { key: 'control:delete', label: 'Silme', description: 'Kontrol silme' },
            { key: 'control:*', label: 'Tam Yetki', description: 'Tüm kontrol yetkileri' },
        ]
    },
    {
        name: 'Denetim',
        key: 'audit',
        permissions: [
            { key: 'audit:read', label: 'Görüntüleme', description: 'Denetimleri görüntüleme' },
            { key: 'audit:create', label: 'Oluşturma', description: 'Denetim planı oluşturma' },
            { key: 'audit:update', label: 'Düzenleme', description: 'Denetim düzenleme' },
            { key: 'audit:*', label: 'Tam Yetki', description: 'Tüm denetim yetkileri' },
        ]
    },
    {
        name: 'Bulgular',
        key: 'finding',
        permissions: [
            { key: 'finding:read', label: 'Görüntüleme', description: 'Bulguları görüntüleme' },
            { key: 'finding:read:own', label: 'Kendi Bulguları', description: 'Sadece atanmış bulguları görür' },
            { key: 'finding:create', label: 'Oluşturma', description: 'Yeni bulgu oluşturma' },
            { key: 'finding:update', label: 'Düzenleme', description: 'Bulgu düzenleme' },
            { key: 'finding:delete', label: 'Silme', description: 'Bulgu silme' },
            { key: 'finding:*', label: 'Tam Yetki', description: 'Tüm bulgu yetkileri' },
        ]
    },
    {
        name: 'Aksiyonlar',
        key: 'action',
        permissions: [
            { key: 'action:read', label: 'Görüntüleme', description: 'Aksiyonları görüntüleme' },
            { key: 'action:read:own', label: 'Kendi Aksiyonları', description: 'Sadece atanmış aksiyonları görür' },
            { key: 'action:create', label: 'Oluşturma', description: 'Yeni aksiyon oluşturma' },
            { key: 'action:update:own', label: 'Kendi Aksiy. Düzenle', description: 'Kendi aksiyonlarını düzenleme' },
            { key: 'action:upload:own', label: 'Kanıt Yükleme', description: 'Kendi aksiyonlarına kanıt yükleme' },
            { key: 'action:*', label: 'Tam Yetki', description: 'Tüm aksiyon yetkileri' },
        ]
    },
    {
        name: 'Uyum',
        key: 'compliance',
        permissions: [
            { key: 'compliance:read', label: 'Görüntüleme', description: 'Uyum verilerini görüntüleme' },
            { key: 'compliance:*', label: 'Tam Yetki', description: 'Tüm uyum yetkileri' },
        ]
    },
    {
        name: 'Raporlama',
        key: 'report',
        permissions: [
            { key: 'report:read', label: 'Görüntüleme', description: 'Raporları görüntüleme' },
            { key: 'report:*', label: 'Tam Yetki', description: 'Tüm raporlama yetkileri' },
        ]
    },
    {
        name: 'Yönetim',
        key: 'admin',
        permissions: [
            { key: 'admin:*', label: 'Admin Paneli', description: 'Admin paneline erişim' },
            { key: 'user:*', label: 'Kullanıcı Yönetimi', description: 'Kullanıcı oluşturma/düzenleme' },
            { key: 'role:*', label: 'Rol Yönetimi', description: 'Rol oluşturma/düzenleme' },
            { key: 'system:*', label: 'Sistem Ayarları', description: 'Sistem parametreleri yönetimi' },
        ]
    },
];

export default function RolesPage() {
    const { success, error: showError } = useToast();
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [saving, setSaving] = useState(false);
    const [editedPermissions, setEditedPermissions] = useState<string[]>([]);

    useEffect(() => {
        loadRoles();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadRoles = async () => {
        try {
            const rolesRes = await api.request<Role[]>('/admin/roles');
            // Filter only 4 active roles
            const activeRoles = rolesRes.filter(r =>
                ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR', 'AUDITEE'].includes(r.name)
            );
            setRoles(activeRoles);
            if (activeRoles.length > 0 && !selectedRole) {
                setSelectedRole(activeRoles[0]);
                setEditedPermissions(activeRoles[0].permissions || []);
            }
        } catch (error) {
            console.error('Failed to load roles:', error);
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
            showError('Hata', 'Yetkiler kaydedilirken bir hata oluştu');
        } finally {
            setSaving(false);
        }
    };

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
                                {permissionCategories.map((category) => (
                                    <div key={category.key} className="border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                                            <h4 className="text-sm font-semibold text-slate-700">{category.name}</h4>
                                        </div>
                                        <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                                            {category.permissions.map((perm) => {
                                                const isActive = hasPermission(perm.key);
                                                const isWildcard = perm.key.endsWith(':*');
                                                return (
                                                    <button
                                                        key={perm.key}
                                                        onClick={() => togglePermission(perm.key)}
                                                        className={`p-3 rounded-lg border-2 text-left transition-all cursor-pointer ${isActive
                                                                ? isWildcard
                                                                    ? 'border-amber-400 bg-amber-50'
                                                                    : 'border-emerald-400 bg-emerald-50'
                                                                : 'border-slate-200 hover:border-slate-300'
                                                            }`}
                                                        title={perm.description}
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
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
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
