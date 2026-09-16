import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { matchesPermission } from '../util/permission-match';

/** Kapsam türü — "İşlerim" (yalnızca kendisi) / "Birimim" (üye olduğu direktörlükler) / "Kurum" (org geneli). */
export type DirectorateScopeRequest = 'MINE' | 'UNIT' | 'ORG';

export interface ResolvedDirectorateScope {
    appliedScope: DirectorateScopeRequest;
    userId: string;
    /** null = kapsam sınırlaması yok (ORG) veya kapsam sınırı kullanıcının kendisi (MINE). */
    directorateIds: string[] | null;
}

export interface DirectorateScopeOptions {
    mine: { available: true };
    unit: { available: boolean; directorates: { id: string; name: string }[] };
    org: { available: boolean };
}

/**
 * Ortak kapsam çözümleyici — Çalışma Panosu VE Kontrol Yönetimi (Yıllık Plan)
 * dahil, direktörlük bazlı görünürlük gereken TÜM modüller bunu kullanır.
 * İstemciden gelen `scope`/`directorateId` yalnızca bir TERCİHTİR; gerçek
 * erişim her zaman oturumdaki izin + `DirectorateMembership` kayıtlarından
 * üretilir. İstemci hiçbir zaman yetkisiz bir kapsamı genişletemez — yalnızca
 * kendi yetkili alt kümesine daraltılır veya en kısıtlayıcı (MINE) kapsama düşer.
 *
 * `org.available` bugün `report:org` iznine bağlı (Çalışma Panosu'nun
 * kullandığı tanım) — Kontrol Yönetimi'nde org-geneli mutasyon zaten ayrıca
 * `control:*`/rol guard'ıyla korunuyor, bu servis yalnızca GÖRÜNÜRLÜK
 * kapsamını çözer.
 */
@Injectable()
export class DirectorateScopeService {
    constructor(private prisma: PrismaService) { }

    async getScopeOptions(userId: string, permissions: string[]): Promise<DirectorateScopeOptions> {
        const memberships = await this.prisma.directorateMembership.findMany({
            where: { userId },
            include: { directorate: { select: { id: true, name: true } } },
        });
        const directorates = memberships
            .map(m => m.directorate)
            .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

        return {
            mine: { available: true },
            unit: { available: directorates.length > 0, directorates },
            org: { available: matchesPermission(permissions, 'report:org') },
        };
    }

    async resolveScope(
        userId: string,
        permissions: string[],
        requested: { scope?: DirectorateScopeRequest; directorateId?: string[] },
    ): Promise<ResolvedDirectorateScope> {
        const options = await this.getScopeOptions(userId, permissions);
        const requestedScope = requested.scope ?? 'MINE';

        if (requestedScope === 'ORG' && options.org.available) {
            return { appliedScope: 'ORG', userId, directorateIds: null };
        }

        if (requestedScope === 'UNIT' && options.unit.available) {
            const authorizedIds = new Set(options.unit.directorates.map(d => d.id));
            const requestedIds = (requested.directorateId ?? []).filter(id => authorizedIds.has(id));
            // Hiç geçerli seçim yoksa (veya hiç seçim yapılmadıysa) TÜM yetkili
            // direktörlükler uygulanır — istemci "Birimim" seçtiğinde varsayılan
            // olarak tüm yetkili birimlerini görür.
            const directorateIds = requestedIds.length > 0
                ? requestedIds
                : options.unit.directorates.map(d => d.id);
            return { appliedScope: 'UNIT', userId, directorateIds };
        }

        // MINE veya yetkisiz bir kapsam istendi — en kısıtlayıcıya düş.
        return { appliedScope: 'MINE', userId, directorateIds: null };
    }
}
