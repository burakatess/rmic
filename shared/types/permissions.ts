/* ============================================
   PEPE — RBAC Permission Configuration
   GRC Platform Role-Permission Matrix
   
   KURAL: Her kullanıcı yalnızca BİR ana role atanır.
   Doğrudan kullanıcı bazlı yetki verilmez.
   ============================================ */

// Modül bazlı izinler
export const PERMISSIONS = {
  // Dashboard
  DASHBOARD_VIEW: 'dashboard:view',

  // Risk Yönetimi
  RISK_VIEW: 'risk:view',
  RISK_CREATE: 'risk:create',
  RISK_UPDATE: 'risk:update',
  RISK_DELETE: 'risk:delete',
  RISK_ASSESS: 'risk:assess',
  RISK_TREAT: 'risk:treat',
  RISK_EXPORT: 'risk:export',

  // Kontrol Yönetimi
  CONTROL_VIEW: 'control:view',
  CONTROL_CREATE: 'control:create',
  CONTROL_UPDATE: 'control:update',
  CONTROL_DELETE: 'control:delete',
  CONTROL_TEST: 'control:test',
  CONTROL_APPROVE: 'control:approve',
  CONTROL_EXPORT: 'control:export',

  // Denetim & İnceleme
  AUDIT_VIEW: 'audit:view',
  AUDIT_CREATE: 'audit:create',
  AUDIT_UPDATE: 'audit:update',
  AUDIT_DELETE: 'audit:delete',
  AUDIT_EXECUTE: 'audit:execute',

  // Bulgular
  FINDING_VIEW: 'finding:view',
  FINDING_CREATE: 'finding:create',
  FINDING_UPDATE: 'finding:update',
  FINDING_DELETE: 'finding:delete',
  FINDING_EXPORT: 'finding:export',

  // Aksiyonlar
  ACTION_VIEW: 'action:view',
  ACTION_CREATE: 'action:create',
  ACTION_UPDATE: 'action:update',
  ACTION_DELETE: 'action:delete',
  ACTION_EFFECTIVENESS: 'action:effectiveness',

  // Uyum & Regülasyon
  COMPLIANCE_VIEW: 'compliance:view',
  COMPLIANCE_CREATE: 'compliance:create',
  COMPLIANCE_UPDATE: 'compliance:update',
  COMPLIANCE_DELETE: 'compliance:delete',
  COMPLIANCE_MAP: 'compliance:map',

  // Raporlama
  REPORT_VIEW: 'report:view',
  REPORT_CREATE: 'report:create',
  REPORT_EXPORT: 'report:export',

  // Kullanıcı & Rol Yönetimi
  USER_VIEW: 'user:view',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  ROLE_MANAGE: 'role:manage',

  // Sistem
  PARAMETER_VIEW: 'parameter:view',
  PARAMETER_MANAGE: 'parameter:manage',
  AUDIT_LOG_VIEW: 'audit_log:view',
  INTEGRATION_MANAGE: 'integration:manage',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Öntanımlı roller ve yetkileri
export const DEFAULT_ROLES = {
  ADMIN: {
    name: 'ADMIN',
    label: 'Sistem Yöneticisi',
    description: 'Tüm yetkilere sahip sistem yöneticisi',
    permissions: Object.values(PERMISSIONS),
  },
  RISK_MANAGER: {
    name: 'RISK_MANAGER',
    label: 'Risk Yöneticisi',
    description: 'Risk ve kontrol süreçlerini yönetir',
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.RISK_VIEW, PERMISSIONS.RISK_CREATE, PERMISSIONS.RISK_UPDATE, PERMISSIONS.RISK_ASSESS, PERMISSIONS.RISK_TREAT, PERMISSIONS.RISK_EXPORT,
      PERMISSIONS.CONTROL_VIEW, PERMISSIONS.CONTROL_CREATE, PERMISSIONS.CONTROL_UPDATE, PERMISSIONS.CONTROL_TEST, PERMISSIONS.CONTROL_EXPORT,
      PERMISSIONS.FINDING_VIEW, PERMISSIONS.FINDING_CREATE, PERMISSIONS.FINDING_UPDATE, PERMISSIONS.FINDING_EXPORT,
      PERMISSIONS.ACTION_VIEW, PERMISSIONS.ACTION_CREATE, PERMISSIONS.ACTION_UPDATE, PERMISSIONS.ACTION_EFFECTIVENESS,
      PERMISSIONS.COMPLIANCE_VIEW, PERMISSIONS.COMPLIANCE_MAP,
      PERMISSIONS.REPORT_VIEW, PERMISSIONS.REPORT_CREATE, PERMISSIONS.REPORT_EXPORT,
      PERMISSIONS.USER_VIEW,
      PERMISSIONS.PARAMETER_VIEW,
    ],
  },
  AUDITOR: {
    name: 'AUDITOR',
    label: 'Denetçi',
    description: 'Denetim planları oluşturur ve yürütür',
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.RISK_VIEW, PERMISSIONS.RISK_EXPORT,
      PERMISSIONS.CONTROL_VIEW, PERMISSIONS.CONTROL_TEST, PERMISSIONS.CONTROL_APPROVE, PERMISSIONS.CONTROL_EXPORT,
      PERMISSIONS.AUDIT_VIEW, PERMISSIONS.AUDIT_CREATE, PERMISSIONS.AUDIT_UPDATE, PERMISSIONS.AUDIT_EXECUTE,
      PERMISSIONS.FINDING_VIEW, PERMISSIONS.FINDING_CREATE, PERMISSIONS.FINDING_UPDATE, PERMISSIONS.FINDING_EXPORT,
      PERMISSIONS.ACTION_VIEW, PERMISSIONS.ACTION_CREATE,
      PERMISSIONS.COMPLIANCE_VIEW,
      PERMISSIONS.REPORT_VIEW, PERMISSIONS.REPORT_CREATE, PERMISSIONS.REPORT_EXPORT,
      PERMISSIONS.USER_VIEW,
    ],
  },
  CONTROL_OWNER: {
    name: 'CONTROL_OWNER',
    label: 'Kontrol Sahibi',
    description: 'Atanmış kontrollerin testlerini yapar ve sonuçlarını raporlar',
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.RISK_VIEW,
      PERMISSIONS.CONTROL_VIEW, PERMISSIONS.CONTROL_UPDATE, PERMISSIONS.CONTROL_TEST,
      PERMISSIONS.FINDING_VIEW,
      PERMISSIONS.ACTION_VIEW, PERMISSIONS.ACTION_UPDATE,
      PERMISSIONS.REPORT_VIEW,
    ],
  },
  VIEWER: {
    name: 'VIEWER',
    label: 'Görüntüleyici',
    description: 'Sadece görüntüleme yetkisi',
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.RISK_VIEW,
      PERMISSIONS.CONTROL_VIEW,
      PERMISSIONS.FINDING_VIEW,
      PERMISSIONS.ACTION_VIEW,
      PERMISSIONS.COMPLIANCE_VIEW,
      PERMISSIONS.REPORT_VIEW,
    ],
  },
} as const;

export type RoleName = keyof typeof DEFAULT_ROLES;

// Modül-izin grupları (UI'da permission checkbox matrisi için)
export const PERMISSION_GROUPS = [
  {
    module: 'Dashboard',
    icon: 'dashboard',
    permissions: [PERMISSIONS.DASHBOARD_VIEW],
  },
  {
    module: 'Risk Yönetimi',
    icon: 'risk',
    permissions: [
      PERMISSIONS.RISK_VIEW, PERMISSIONS.RISK_CREATE, PERMISSIONS.RISK_UPDATE,
      PERMISSIONS.RISK_DELETE, PERMISSIONS.RISK_ASSESS, PERMISSIONS.RISK_TREAT, PERMISSIONS.RISK_EXPORT,
    ],
  },
  {
    module: 'Kontrol Yönetimi',
    icon: 'control',
    permissions: [
      PERMISSIONS.CONTROL_VIEW, PERMISSIONS.CONTROL_CREATE, PERMISSIONS.CONTROL_UPDATE,
      PERMISSIONS.CONTROL_DELETE, PERMISSIONS.CONTROL_TEST, PERMISSIONS.CONTROL_APPROVE, PERMISSIONS.CONTROL_EXPORT,
    ],
  },
  {
    module: 'Denetim & İnceleme',
    icon: 'audit',
    permissions: [
      PERMISSIONS.AUDIT_VIEW, PERMISSIONS.AUDIT_CREATE, PERMISSIONS.AUDIT_UPDATE,
      PERMISSIONS.AUDIT_DELETE, PERMISSIONS.AUDIT_EXECUTE,
    ],
  },
  {
    module: 'Bulgu Yönetimi',
    icon: 'finding',
    permissions: [
      PERMISSIONS.FINDING_VIEW, PERMISSIONS.FINDING_CREATE, PERMISSIONS.FINDING_UPDATE,
      PERMISSIONS.FINDING_DELETE, PERMISSIONS.FINDING_EXPORT,
    ],
  },
  {
    module: 'Aksiyon Yönetimi',
    icon: 'action',
    permissions: [
      PERMISSIONS.ACTION_VIEW, PERMISSIONS.ACTION_CREATE, PERMISSIONS.ACTION_UPDATE,
      PERMISSIONS.ACTION_DELETE, PERMISSIONS.ACTION_EFFECTIVENESS,
    ],
  },
  {
    module: 'Uyum & Regülasyon',
    icon: 'compliance',
    permissions: [
      PERMISSIONS.COMPLIANCE_VIEW, PERMISSIONS.COMPLIANCE_CREATE, PERMISSIONS.COMPLIANCE_UPDATE,
      PERMISSIONS.COMPLIANCE_DELETE, PERMISSIONS.COMPLIANCE_MAP,
    ],
  },
  {
    module: 'Raporlama',
    icon: 'report',
    permissions: [
      PERMISSIONS.REPORT_VIEW, PERMISSIONS.REPORT_CREATE, PERMISSIONS.REPORT_EXPORT,
    ],
  },
  {
    module: 'Kullanıcı & Rol Yönetimi',
    icon: 'user',
    permissions: [
      PERMISSIONS.USER_VIEW, PERMISSIONS.USER_CREATE, PERMISSIONS.USER_UPDATE,
      PERMISSIONS.USER_DELETE, PERMISSIONS.ROLE_MANAGE,
    ],
  },
  {
    module: 'Sistem',
    icon: 'system',
    permissions: [
      PERMISSIONS.PARAMETER_VIEW, PERMISSIONS.PARAMETER_MANAGE,
      PERMISSIONS.AUDIT_LOG_VIEW, PERMISSIONS.INTEGRATION_MANAGE,
    ],
  },
];

// Permission label haritası (UI gösterimi için)
export const PERMISSION_LABELS: Record<string, string> = {
  'dashboard:view': 'Dashboard Görüntüle',
  'risk:view': 'Görüntüle',
  'risk:create': 'Oluştur',
  'risk:update': 'Güncelle',
  'risk:delete': 'Sil',
  'risk:assess': 'Değerlendir',
  'risk:treat': 'Tedavi Et',
  'risk:export': 'Dışa Aktar',
  'control:view': 'Görüntüle',
  'control:create': 'Oluştur',
  'control:update': 'Güncelle',
  'control:delete': 'Sil',
  'control:test': 'Test Et',
  'control:approve': 'Onayla',
  'control:export': 'Dışa Aktar',
  'audit:view': 'Görüntüle',
  'audit:create': 'Oluştur',
  'audit:update': 'Güncelle',
  'audit:delete': 'Sil',
  'audit:execute': 'Yürüt',
  'finding:view': 'Görüntüle',
  'finding:create': 'Oluştur',
  'finding:update': 'Güncelle',
  'finding:delete': 'Sil',
  'finding:export': 'Dışa Aktar',
  'action:view': 'Görüntüle',
  'action:create': 'Oluştur',
  'action:update': 'Güncelle',
  'action:delete': 'Sil',
  'action:effectiveness': 'Etkinlik Değerlendir',
  'compliance:view': 'Görüntüle',
  'compliance:create': 'Oluştur',
  'compliance:update': 'Güncelle',
  'compliance:delete': 'Sil',
  'compliance:map': 'Eşleştir',
  'report:view': 'Görüntüle',
  'report:create': 'Oluştur',
  'report:export': 'Dışa Aktar',
  'user:view': 'Görüntüle',
  'user:create': 'Oluştur',
  'user:update': 'Güncelle',
  'user:delete': 'Sil',
  'role:manage': 'Rolleri Yönet',
  'parameter:view': 'Görüntüle',
  'parameter:manage': 'Yönet',
  'audit_log:view': 'Denetim Logları Görüntüle',
  'integration:manage': 'Entegrasyonları Yönet',
};

// Utility: Kullanıcının belirli bir yetkisi var mı kontrol et
export function hasPermission(userPermissions: string[], permission: Permission): boolean {
  return userPermissions.includes(permission);
}

// Utility: Kullanıcının herhangi bir yetkisi var mı
export function hasAnyPermission(userPermissions: string[], permissions: Permission[]): boolean {
  return permissions.some(p => userPermissions.includes(p));
}

// Utility: Kullanıcının tüm yetkileri var mı
export function hasAllPermissions(userPermissions: string[], permissions: Permission[]): boolean {
  return permissions.every(p => userPermissions.includes(p));
}
