/** İş akışı ve silme onayı rol kümeleri (tek kaynak; servisler arası döngüsel import olmasın diye ayrı). */
export const MANAGER_ROLES = new Set(['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER']);
export const EXEC_ROLES = new Set(['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR']);
