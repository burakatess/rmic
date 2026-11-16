import { matchesPermission } from '../util/permission-match';
import { hasOrgScope } from './access-scope.service';

/**
 * Kontrolcü uygunluğu — Yıllık Plan, dönem kontrolü ve test atamalarında TEK kural.
 * Rol adı listesi yerine işlem izni + kayıt kapsamı + görev ayrılığı:
 *  - aktif kullanıcı
 *  - işlem izni: birinci kontrolcü test yürütür (control:test; IKS uyumu için test:execute),
 *    ikinci kontrolcü testi onaylar (control:approve — control:* ve * kapsar)
 *  - kayıt kapsamı: kurum geneli test kapsamı veya kontrolün direktörlüğüne üyelik
 *    (kayıt kapsamı uygulaması kapalıyken herkes kurum geneli sayılır — mevcut davranış)
 *  - birinci ve ikinci kontrolcü farklı kişi (atama doğrulamasında ayrıca denetlenir)
 */
export type ControllerRole = 'assignee' | 'secondController';

export const CONTROLLER_PERMISSIONS: Record<ControllerRole, string[]> = {
    assignee: ['control:test', 'test:execute'],
    secondController: ['control:approve'],
};

export interface EligibilityCandidate {
    isActive: boolean;
    permissions: unknown;
    directorateIds: string[];
}

/** Uygunsa null; değilse okunur Türkçe gerekçe. */
export function controllerIneligibility(
    user: EligibilityCandidate,
    role: ControllerRole,
    controlDirectorateId: string | null | undefined,
    scopeEnforced: boolean,
): string | null {
    if (!user.isActive) return 'kullanıcı pasif';
    const perms = Array.isArray(user.permissions) ? user.permissions.filter((p): p is string => typeof p === 'string') : [];
    if (!CONTROLLER_PERMISSIONS[role].some(p => matchesPermission(perms, p))) {
        return role === 'assignee' ? 'test yürütme izni yok (control:test)' : 'test onay izni yok (control:approve)';
    }
    if (scopeEnforced && !hasOrgScope(perms, 'controlTest')) {
        if (!controlDirectorateId) return 'kontrolün direktörlüğü yok ve kurum geneli kapsamı yok';
        if (!user.directorateIds.includes(controlDirectorateId)) return 'kontrolün direktörlüğü üzerinde kayıt kapsamı yok';
    }
    return null;
}
