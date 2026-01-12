'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';

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

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        department: '',
        roleId: '',
    });

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
            loadData();
        } catch (error) {
            console.error('Failed to create user:', error);
            alert('Kullanıcı oluşturulurken bir hata oluştu');
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
            loadData();
        } catch (error) {
            console.error('Failed to update user:', error);
            alert('Kullanıcı güncellenirken bir hata oluştu');
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
        }
    };

    const handleDeleteUser = async (userId: string, userName: string) => {
        if (!confirm(`"${userName}" kullanıcısını silmek istediğinize emin misiniz?`)) return;
        try {
            await api.request(`/admin/users/${userId}`, { method: 'DELETE' });
            loadData();
        } catch (error) {
            console.error('Failed to delete user:', error);
            alert('Kullanıcı silinemedi. İlişkili kayıtlar olabilir.');
        }
    };

    const filteredUsers = users.filter(
        (u) =>
            u.email.toLowerCase().includes(search.toLowerCase()) ||
            u.firstName.toLowerCase().includes(search.toLowerCase()) ||
            u.lastName.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Kullanıcı Yönetimi</h1>
                    <p className="text-gray-500 mt-1">Sistem kullanıcılarını yönetin</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-slate-700 to-slate-800 text-white font-medium rounded-xl hover:from-slate-800 hover:to-slate-900 transition-all shadow-sm"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Yeni Kullanıcı
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500">Toplam Kullanıcı</p>
                    <p className="text-2xl font-bold text-gray-900">{users.length}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 shadow-sm border border-green-100">
                    <p className="text-sm text-green-600">Aktif</p>
                    <p className="text-2xl font-bold text-green-600">{users.filter(u => u.isActive).length}</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4 shadow-sm border border-red-100">
                    <p className="text-sm text-red-600">Pasif</p>
                    <p className="text-2xl font-bold text-red-600">{users.filter(u => !u.isActive).length}</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 shadow-sm border border-blue-100">
                    <p className="text-sm text-blue-600">Rol Sayısı</p>
                    <p className="text-2xl font-bold text-blue-600">{roles.length}</p>
                </div>
            </div>

            {/* Search */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="relative">
                    <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Kullanıcı ara..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-600"></div>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Kullanıcı</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">E-posta</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Departman</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Rol</th>
                                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase">Durum</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredUsers.map((user) => (
                                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white font-semibold text-sm">
                                                    {user.firstName[0]}{user.lastName[0]}
                                                </div>
                                                <span className="font-medium text-gray-900">{user.firstName} {user.lastName}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                                        <td className="px-6 py-4 text-sm text-gray-600">{user.department || '-'}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-100 text-blue-700">
                                                {roleLabels[user.role.name] || user.role.name}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {user.isActive ? 'Aktif' : 'Pasif'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-end gap-1">
                                                {/* Edit Button */}
                                                <button
                                                    onClick={() => handleEditClick(user)}
                                                    className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Düzenle"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                                {/* Toggle Status Button */}
                                                <button
                                                    onClick={() => toggleUserStatus(user.id, user.isActive)}
                                                    className={`p-2 rounded-lg transition-colors ${user.isActive ? 'text-amber-500 hover:bg-amber-50' : 'text-green-500 hover:bg-green-50'}`}
                                                    title={user.isActive ? 'Pasifleştir' : 'Aktifleştir'}
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        {user.isActive ? (
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                                        ) : (
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        )}
                                                    </svg>
                                                </button>
                                                {/* Delete Button */}
                                                <button
                                                    onClick={() => handleDeleteUser(user.id, `${user.firstName} ${user.lastName}`)}
                                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Sil"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create User Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Yeni Kullanıcı</h2>
                        <form onSubmit={handleCreateUser} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ad</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.firstName}
                                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Soyad</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.lastName}
                                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
                                <input
                                    type="email"
                                    required
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
                                <input
                                    type="password"
                                    required
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Departman</label>
                                <input
                                    type="text"
                                    value={formData.department}
                                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                                <select
                                    required
                                    value={formData.roleId}
                                    onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white"
                                >
                                    <option value="">Rol seçin</option>
                                    {roles.map((role) => (
                                        <option key={role.id} value={role.id}>{roleLabels[role.name] || role.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800"
                                >
                                    Oluştur
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {editingUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Kullanıcı Düzenle</h2>
                        <p className="text-sm text-gray-500 mb-4">{editingUser.email}</p>
                        <form onSubmit={handleUpdateUser} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ad</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.firstName}
                                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Soyad</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.lastName}
                                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Departman</label>
                                <input
                                    type="text"
                                    value={formData.department}
                                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                                <select
                                    required
                                    value={formData.roleId}
                                    onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white"
                                >
                                    <option value="">Rol seçin</option>
                                    {roles.map((role) => (
                                        <option key={role.id} value={role.id}>{roleLabels[role.name] || role.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingUser(null);
                                        setFormData({ email: '', password: '', firstName: '', lastName: '', department: '', roleId: '' });
                                    }}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                                >
                                    Güncelle
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
