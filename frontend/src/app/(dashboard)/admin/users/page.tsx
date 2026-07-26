'use client';

import { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import {
    PageShell, PageHeader, Button, KpiCard, KpiGrid,
    AdvancedFilterPanel, DataTable, StatusBadge, Modal, ConfirmDialog,
} from '@/components/ui';
import type { ColumnDef, AdvancedFilterField } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    department?: string;
    isActive: boolean;
    createdAt: string;
    role: {
        id: string;
        name: string;
    };
}

interface Role {
    id: string;
    name: string;
    description?: string;
    _count?: { users: number };
}

const roleLabels: Record<string, string> = {
    SYSTEM_ADMIN: 'Sistem Yöneticisi',
    RISK_CONTROL_MANAGER: 'Risk ve İK Yöneticisi',
    AUDITOR: 'Denetçi',
    AUDITEE: 'Denetlenen',
};

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all';

export default function UsersPage() {
    const { success, error: showError } = useToast();
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = 20;
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [deletingUser, setDeletingUser] = useState<User | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        department: '',
        roleId: '',
    });
    const [resettingPasswordUser, setResettingPasswordUser] = useState<User | null>(null);
    const [newPassword, setNewPassword] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [usersRes, rolesRes] = await Promise.all([
                api.request<User[]>('/admin/users'),
                api.request<Role[]>('/admin/roles'),
            ]);
            setUsers(usersRes);
            // Filter only active roles (4 new roles)
            const activeRoles = rolesRes.filter(r =>
                ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR', 'AUDITEE'].includes(r.name)
            );
            setRoles(activeRoles);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.request('/admin/users', { method: 'POST', body: formData });
            setShowModal(false);
            setFormData({ email: '', password: '', firstName: '', lastName: '', department: '', roleId: '' });
            success('Oluşturuldu', 'Kullanıcı başarıyla oluşturuldu.');
            loadData();
        } catch (error) {
            console.error('Failed to create user:', error);
            showError('Hata', 'Kullanıcı oluşturulurken bir hata oluştu');
        }
    };

    const handleUpdateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;
        try {
            await api.request(`/admin/users/${editingUser.id}`, {
                method: 'PUT',
                body: {
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    department: formData.department,
                    roleId: formData.roleId,
                }
            });
            setEditingUser(null);
            setFormData({ email: '', password: '', firstName: '', lastName: '', department: '', roleId: '' });
            success('Güncellendi', 'Kullanıcı başarıyla güncellendi.');
            loadData();
        } catch (error) {
            console.error('Failed to update user:', error);
            showError('Hata', 'Kullanıcı güncellenirken bir hata oluştu');
        }
    };

    const handleEditClick = (user: User) => {
        setEditingUser(user);
        setFormData({
            email: user.email,
            password: '',
            firstName: user.firstName,
            lastName: user.lastName,
            department: user.department || '',
            roleId: user.role.id,
        });
    };

    const toggleUserStatus = async (userId: string, isActive: boolean) => {
        try {
            await api.request(`/admin/users/${userId}`, { method: 'PUT', body: { isActive: !isActive } });
            loadData();
        } catch (error) {
            console.error('Failed to update user:', error);
            showError('Hata', 'Kullanıcı durumu güncellenemedi.');
        }
    };

    const handleDeleteUser = async () => {
        if (!deletingUser) return;
        setDeleting(true);
        try {
            await api.request(`/admin/users/${deletingUser.id}`, { method: 'DELETE' });
            setDeletingUser(null);
            success('Silindi', 'Kullanıcı silindi.');
            loadData();
        } catch (error) {
            console.error('Failed to delete user:', error);
            showError('Hata', 'Kullanıcı silinemedi. İlişkili kayıtlar olabilir.');
        } finally {
            setDeleting(false);
        }
    };

    const handlePasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resettingPasswordUser || !newPassword) return;

        try {
            await api.request(`/admin/users/${resettingPasswordUser.id}/reset-password`, {
                method: 'POST',
                body: { newPassword }
            });
            setResettingPasswordUser(null);
            setNewPassword('');
            success('Başarılı', 'Şifre başarıyla güncellendi');
        } catch (error) {
            console.error('Failed to reset password:', error);
            showError('Hata', 'Şifre sıfırlanırken bir hata oluştu');
        }
    };

    const filteredUsers = useMemo(() => users.filter((u) => {
        if (search) {
            const q = search.toLowerCase();
            if (!u.email.toLowerCase().includes(q) &&
                !u.firstName.toLowerCase().includes(q) &&
                !u.lastName.toLowerCase().includes(q)) return false;
        }
        if (roleFilter && u.role.id !== roleFilter) return false;
        if (statusFilter === 'active' && !u.isActive) return false;
        if (statusFilter === 'passive' && u.isActive) return false;
        return true;
    }), [users, search, roleFilter, statusFilter]);

    const paginated = useMemo(
        () => filteredUsers.slice((page - 1) * pageSize, page * pageSize),
        [filteredUsers, page]
    );

    const advancedFields: AdvancedFilterField[] = [
        {
            type: 'select', key: 'role', label: 'Rol',
            value: roleFilter,
            onChange: (v) => { setRoleFilter(v); setPage(1); },
            options: roles.map(r => ({ value: r.id, label: roleLabels[r.name] || r.name })),
        },
        {
            type: 'select', key: 'status', label: 'Durum',
            value: statusFilter,
            onChange: (v) => { setStatusFilter(v); setPage(1); },
            options: [
                { value: 'active', label: 'Aktif' },
                { value: 'passive', label: 'Pasif' },
            ],
        },
    ];

    const clearAll = () => { setSearch(''); setRoleFilter(''); setStatusFilter(''); setPage(1); };

    const columns: ColumnDef<User>[] = [
        {
            key: 'user', header: 'Kullanıcı', defaultWidth: 220,
            render: (u) => (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 flex-shrink-0 rounded-full bg-slate-700 flex items-center justify-center text-white font-semibold text-xs">
                        {u.firstName[0]}{u.lastName[0]}
                    </div>
                    <span className="text-sm font-medium text-slate-800 truncate">{u.firstName} {u.lastName}</span>
                </div>
            ),
        },
        {
            key: 'email', header: 'E-posta', defaultWidth: 220,
            render: (u) => <span className="text-sm text-slate-600">{u.email}</span>,
        },
        {
            key: 'department', header: 'Departman', defaultWidth: 150,
            render: (u) => <span className="text-sm text-slate-600">{u.department || '—'}</span>,
        },
        {
            key: 'role', header: 'Rol', defaultWidth: 170,
            render: (u) => <StatusBadge variant="info">{roleLabels[u.role.name] || u.role.name}</StatusBadge>,
        },
        {
            key: 'status', header: 'Durum', defaultWidth: 100,
            render: (u) => (
                <StatusBadge variant={u.isActive ? 'success' : 'critical'} dot>
                    {u.isActive ? 'Aktif' : 'Pasif'}
                </StatusBadge>
            ),
        },
        {
            key: 'ops', header: 'İşlemler', defaultWidth: 150,
            render: (u) => (
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => { setResettingPasswordUser(u); setNewPassword(''); }}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        title="Şifre Sıfırla" aria-label="Şifre Sıfırla"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                    </button>
                    <button
                        onClick={() => handleEditClick(u)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="Düzenle" aria-label="Düzenle"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                    <button
                        onClick={() => toggleUserStatus(u.id, u.isActive)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${u.isActive ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                        title={u.isActive ? 'Pasifleştir' : 'Aktifleştir'}
                        aria-label={u.isActive ? 'Pasifleştir' : 'Aktifleştir'}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {u.isActive ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            )}
                        </svg>
                    </button>
                    <button
                        onClick={() => setDeletingUser(u)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Sil" aria-label="Sil"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            ),
        },
    ];

    return (
        <PageShell>
            <PageHeader
                title="Kullanıcı Yönetimi"
                description="Sistem kullanıcılarını yönetin"
                breadcrumbs={[{ label: 'Yönetim' }, { label: 'Kullanıcılar' }]}
                actions={
                    <Button
                        variant="primary"
                        onClick={() => setShowModal(true)}
                        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                    >
                        Yeni Kullanıcı
                    </Button>
                }
            />

            {/* KPI'lar */}
            <KpiGrid columns={4}>
                <KpiCard title="Toplam Kullanıcı" value={users.length} variant="default" />
                <KpiCard title="Aktif" value={users.filter(u => u.isActive).length} variant="success"
                    active={statusFilter === 'active'}
                    onClick={() => { setStatusFilter(statusFilter === 'active' ? '' : 'active'); setPage(1); }} />
                <KpiCard title="Pasif" value={users.filter(u => !u.isActive).length} variant="critical"
                    active={statusFilter === 'passive'}
                    onClick={() => { setStatusFilter(statusFilter === 'passive' ? '' : 'passive'); setPage(1); }} />
                <KpiCard title="Rol Sayısı" value={roles.length} variant="primary" />
            </KpiGrid>

            {/* Filtre paneli */}
            <AdvancedFilterPanel
                searchValue={search}
                onSearchChange={(v) => { setSearch(v); setPage(1); }}
                searchPlaceholder="Kullanıcı ara..."
                fields={advancedFields}
                activeCount={[roleFilter, statusFilter].filter(Boolean).length}
                onClearAll={clearAll}
            />

            <DataTable
                columns={columns}
                data={paginated}
                rowKey={(u) => u.id}
                loading={loading}
                totalCount={filteredUsers.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                storageKey="admin-users-table"
                emptyTitle="Kullanıcı bulunamadı"
                emptyDescription="Arama veya filtre kriterlerinizi değiştirin."
                onRefresh={loadData}
            />

            {/* Create User Modal */}
            <Modal open={showModal} onClose={() => setShowModal(false)} title="Yeni Kullanıcı">
                <form onSubmit={handleCreateUser} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Ad</label>
                            <input
                                type="text"
                                required
                                value={formData.firstName}
                                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Soyad</label>
                            <input
                                type="text"
                                required
                                value={formData.lastName}
                                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                className={inputCls}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">E-posta</label>
                        <input
                            type="email"
                            required
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Şifre</label>
                        <input
                            type="password"
                            required
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Departman</label>
                        <input
                            type="text"
                            value={formData.department}
                            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                        <select
                            required
                            value={formData.roleId}
                            onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                            className={`${inputCls} bg-white`}
                        >
                            <option value="">Rol seçin</option>
                            {roles.map((role) => (
                                <option key={role.id} value={role.id}>{roleLabels[role.name] || role.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="outline" onClick={() => setShowModal(false)}>İptal</Button>
                        <Button type="submit" variant="primary">Oluştur</Button>
                    </div>
                </form>
            </Modal>

            {/* Edit User Modal */}
            <Modal
                open={!!editingUser}
                onClose={() => {
                    setEditingUser(null);
                    setFormData({ email: '', password: '', firstName: '', lastName: '', department: '', roleId: '' });
                }}
                title="Kullanıcı Düzenle"
                description={editingUser?.email}
            >
                <form onSubmit={handleUpdateUser} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Ad</label>
                            <input
                                type="text"
                                required
                                value={formData.firstName}
                                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Soyad</label>
                            <input
                                type="text"
                                required
                                value={formData.lastName}
                                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                className={inputCls}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Departman</label>
                        <input
                            type="text"
                            value={formData.department}
                            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                        <select
                            required
                            value={formData.roleId}
                            onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                            className={`${inputCls} bg-white`}
                        >
                            <option value="">Rol seçin</option>
                            {roles.map((role) => (
                                <option key={role.id} value={role.id}>{roleLabels[role.name] || role.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setEditingUser(null);
                                setFormData({ email: '', password: '', firstName: '', lastName: '', department: '', roleId: '' });
                            }}
                        >
                            İptal
                        </Button>
                        <Button type="submit" variant="primary">Güncelle</Button>
                    </div>
                </form>
            </Modal>

            {/* Reset Password Modal */}
            <Modal
                open={!!resettingPasswordUser}
                onClose={() => { setResettingPasswordUser(null); setNewPassword(''); }}
                title="Şifre Sıfırla"
            >
                <p className="text-sm text-slate-500 mb-4">
                    <span className="font-medium text-slate-800">{resettingPasswordUser?.firstName} {resettingPasswordUser?.lastName}</span> ({resettingPasswordUser?.email}) için yeni şifre belirleyin.
                </p>
                <form onSubmit={handlePasswordReset} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Yeni Şifre</label>
                        <input
                            type="password"
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Yeni şifreyi girin"
                            className={inputCls}
                            autoFocus
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => { setResettingPasswordUser(null); setNewPassword(''); }}
                        >
                            İptal
                        </Button>
                        <Button type="submit" variant="primary">Şifreyi Güncelle</Button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirm */}
            <ConfirmDialog
                open={!!deletingUser}
                onClose={() => setDeletingUser(null)}
                onConfirm={handleDeleteUser}
                title="Kullanıcıyı Sil"
                message={`"${deletingUser ? `${deletingUser.firstName} ${deletingUser.lastName}` : ''}" kullanıcısını silmek istediğinize emin misiniz?`}
                confirmLabel="Sil"
                variant="danger"
                loading={deleting}
            />
        </PageShell>
    );
}
