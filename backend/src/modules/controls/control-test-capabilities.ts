import { matchesPermission } from '../../common/util/permission-match';

/**
 * Kontrol testi detayında kullanıcının YAPABİLECEĞİ işlemler — tek kaynak. Kurallar
 * controls.controller (izinler) ve controls.service (durum + maker/checker) ile aynıdır;
 * uçlar kendi kontrollerini yine uygular, bu bayraklar yalnız arayüz içindir.
 */
export interface ControlTestCapabilities {
    canStart: boolean;
    canEditContent: boolean;
    canComplete: boolean;
    canApprove: boolean;
    canReturn: boolean;
}

const EDITABLE = new Set(['BEKLIYOR', 'DEVAM_EDIYOR', 'GERI_GONDERILDI']);

export function controlTestCapabilities(
    test: { status?: string | null; assigneeId?: string | null; secondControllerId?: string | null },
    actor: { id: string; role?: string | null; permissions?: unknown },
): ControlTestCapabilities {
    const perms = Array.isArray(actor.permissions) ? actor.permissions.filter((p): p is string => typeof p === 'string') : [];
    const canExecute = matchesPermission(perms, 'control:test') || matchesPermission(perms, 'test:execute');
    const canApprovePerm = matchesPermission(perms, 'control:approve');
    const isChecker = !!test.secondControllerId && test.secondControllerId === actor.id;
    const isAdmin = actor.role === 'SYSTEM_ADMIN';
    // approveTest/returnTest: ikinci kontrolcü atanmışsa yalnız o kişi veya admin; testi
    // yapan kendi onayını veremez (admin dahil).
    const reviewer = canApprovePerm && test.status === 'TAMAMLANDI'
        && (!test.secondControllerId || isChecker || isAdmin);
    return {
        canStart: canExecute && test.status === 'BEKLIYOR' && !isChecker,
        canEditContent: canExecute && EDITABLE.has(test.status ?? '') && !isChecker,
        canComplete: canExecute && (test.status === 'DEVAM_EDIYOR' || test.status === 'GERI_GONDERILDI') && !isChecker,
        canApprove: reviewer && test.assigneeId !== actor.id,
        canReturn: reviewer,
    };
}
