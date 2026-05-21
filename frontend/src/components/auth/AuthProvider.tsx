'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import api from '@/lib/api';

/* ============================================
   PEPE + ABOUBAKAR — Auth Context & Provider
   Frontend route protection & permission control
   ============================================ */

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  department?: string;
  role: {
    id: string;
    name: string;
    permissions: string[];
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  // Permission checks
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Public routes that don't require auth
const PUBLIC_ROUTES = ['/login'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Load user profile on mount
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setLoading(false);
      if (!PUBLIC_ROUTES.includes(pathname)) {
        router.push('/login');
      }
      return;
    }

    api.getProfile()
      .then((data: any) => {
        setUser({
          id: data.id,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          department: data.department,
          role: {
            id: data.role?.id || '',
            name: data.role?.name || 'VIEWER',
            permissions: Array.isArray(data.role?.permissions) ? data.role.permissions : [],
          },
        });
      })
      .catch(() => {
        // If API fails, use demo user for development
        setUser({
          id: 'demo',
          email: 'admin@grc.com',
          firstName: 'Burak',
          lastName: 'Yönetici',
          department: 'IT',
          role: {
            id: 'demo-role',
            name: 'ADMIN',
            permissions: [
              'dashboard:view',
              'risk:view', 'risk:create', 'risk:update', 'risk:delete', 'risk:assess', 'risk:treat', 'risk:export',
              'control:view', 'control:create', 'control:update', 'control:delete', 'control:test', 'control:approve', 'control:export',
              'audit:view', 'audit:create', 'audit:update', 'audit:delete', 'audit:execute',
              'finding:view', 'finding:create', 'finding:update', 'finding:delete', 'finding:export',
              'action:view', 'action:create', 'action:update', 'action:delete', 'action:effectiveness',
              'compliance:view', 'compliance:create', 'compliance:update', 'compliance:delete', 'compliance:map',
              'report:view', 'report:create', 'report:export',
              'user:view', 'user:create', 'user:update', 'user:delete', 'role:manage',
              'parameter:view', 'parameter:manage', 'audit_log:view', 'integration:manage',
            ],
          },
        });
      })
      .finally(() => setLoading(false));
  }, []);

  // Redirect unauthenticated users
  useEffect(() => {
    if (!loading && !user && !PUBLIC_ROUTES.includes(pathname)) {
      router.push('/login');
    }
  }, [loading, user, pathname, router]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.login(email, password);
    localStorage.setItem('accessToken', data.accessToken);
    if (data.refreshToken) {
      localStorage.setItem('refreshToken', data.refreshToken);
    }
    // Reload profile
    const profile = await api.getProfile();
    setUser({
      id: profile.id,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      department: profile.department,
      role: {
        id: profile.role?.id || '',
        name: profile.role?.name || 'VIEWER',
        permissions: Array.isArray(profile.role?.permissions) ? profile.role.permissions : [],
      },
    });
    router.push('/dashboard');
  }, [router]);

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
    router.push('/login');
  }, [router]);

  const hasPermission = useCallback((permission: string) => {
    if (!user) return false;
    return user.role.permissions.includes(permission);
  }, [user]);

  const hasAnyPermission = useCallback((permissions: string[]) => {
    if (!user) return false;
    return permissions.some(p => user.role.permissions.includes(p));
  }, [user]);

  const hasAllPermissions = useCallback((permissions: string[]) => {
    if (!user) return false;
    return permissions.every(p => user.role.permissions.includes(p));
  }, [user]);

  const value: AuthContextType = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  // On public routes, render without auth check
  if (PUBLIC_ROUTES.includes(pathname)) {
    return (
      <AuthContext.Provider value={value}>
        {children}
      </AuthContext.Provider>
    );
  }

  // On protected routes without user, show nothing (redirect will happen)
  if (!user) {
    return null;
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/* Hook to access auth context */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/* Permission-gated component wrapper */
export function PermissionGate({
  permission,
  permissions,
  requireAll = false,
  fallback = null,
  children,
}: {
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = useAuth();

  if (permission) {
    return hasPermission(permission) ? <>{children}</> : <>{fallback}</>;
  }

  if (permissions) {
    const hasAccess = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
    return hasAccess ? <>{children}</> : <>{fallback}</>;
  }

  return <>{children}</>;
}

export default AuthProvider;
