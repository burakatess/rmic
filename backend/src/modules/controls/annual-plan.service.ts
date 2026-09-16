import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ControlFrequency } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { DirectorateScopeService } from '../../common/services/directorate-scope.service';
import { ControlScopeService } from './control-scope.service';
import { computeScopePeriods, computeMonthGroup, monthNumbersToLabels } from './control-period.util';
import {
    AnnualPlanDraftItemPatchDto, AnnualPlanWorkspaceQueryDto, ApplyPlanDto, BulkDraftActionDto, SaveDraftItemsDto,
} from './dto/annual-plan.dto';

interface WorkloadRow {
    controlId: string;
    frequency: ControlFrequency;
    selectedMonths: string[];
    controlDate: Date | null;
}

export interface WorkloadResult {
    controlCount: number;
    totalTasks: number;
    byMonth: number[]; // 12 eleman, index 0 = Ocak
    byFrequency: Record<string, number>;
    adHocCount: number;
    missingScheduleCount: number; // AD_HOC, ne controlDate ne selectedMonths var
    dailyExcludedCount: number; // DAILY — otomatik task üretilmez
    peakMonths: number[]; // en yoğun ay(lar), 0-indeksli
    peakCount: number;
}

/**
 * Bir kontrol kümesinin (yıla göre) iş yükünü hesaplar — TEK saf fonksiyon,
 * hem workspace KPI/grafiği hem preview/apply tarafından kullanılır (Madde
 * 11-12, aynı hesaplama çıktısı şartı). `computeScopePeriods` DIŞINDA yeni
 * bir dönem hesaplama mantığı YOKTUR.
 */
export function computeWorkload(rows: WorkloadRow[], year: number): WorkloadResult {
    const byMonth = new Array(12).fill(0);
    const byFrequency: Record<string, number> = {};
    let totalTasks = 0, adHocCount = 0, missingScheduleCount = 0, dailyExcludedCount = 0;

    for (const row of rows) {
        byFrequency[row.frequency] = (byFrequency[row.frequency] ?? 0) + 1;

        if (row.frequency === 'AD_HOC') {
            adHocCount++;
            if (!row.controlDate && row.selectedMonths.length === 0) missingScheduleCount++;
            continue; // Madde 7: AD_HOC kesin toplama varsayımla eklenmez.
        }
        if (row.frequency === 'DAILY') { dailyExcludedCount++; continue; }

        const periods = computeScopePeriods(row.frequency, year, { selectedMonths: row.selectedMonths, controlDate: row.controlDate });
        totalTasks += periods.length;
        for (const p of periods) byMonth[p.targetDate.getMonth()] += 1;
    }

    const peakCount = Math.max(0, ...byMonth);
    const peakMonths = peakCount > 0 ? byMonth.map((c, i) => (c === peakCount ? i : -1)).filter(i => i >= 0) : [];

    return {
        controlCount: rows.length, totalTasks, byMonth, byFrequency,
        adHocCount, missingScheduleCount, dailyExcludedCount, peakMonths, peakCount,
    };
}

interface AssigneeWorkloadRow extends WorkloadRow {
    assigneeId: string | null;
    secondControllerId: string | null;
}

export interface AssigneeWorkloadEntry {
    userId: string; controlCount: number; taskCount: number; byMonth: number[];
}

export interface WorkloadByAssigneeResult {
    byAssignee: AssigneeWorkloadEntry[];
    bySecondController: { userId: string; reviewCount: number }[];
    unassignedControlCount: number;
    unassignedTaskCount: number;
}

/**
 * Kontrolcü bazlı iş yükü — `computeWorkload` ile AYNI `computeScopePeriods`
 * çağrısını kullanır (Madde 12: ikinci bir paralel hesap yazılmaz), yalnızca
 * ay/sıklık yerine kullanıcı bazında toplar. Kontrol sayısı ≠ task sayısı
 * (bir aylık kontrol 12, bir yıllık kontrol 1 task üretir) — "birinci +
 * ikinci kontrolcü" nedeniyle toplam task sayısı ASLA ikiye katlanmaz: her
 * task yalnızca kendi assignee'sinin taskCount'una, kendi secondController'ının
 * reviewCount'una eklenir (aynı task iki farklı sayaca girer, "iki task" olmaz).
 */
export function computeWorkloadByAssignee(rows: AssigneeWorkloadRow[], year: number): WorkloadByAssigneeResult {
    const byAssignee = new Map<string, AssigneeWorkloadEntry>();
    const bySecondController = new Map<string, number>();
    let unassignedControlCount = 0, unassignedTaskCount = 0;

    const touch = (userId: string) => {
        if (!byAssignee.has(userId)) byAssignee.set(userId, { userId, controlCount: 0, taskCount: 0, byMonth: new Array(12).fill(0) });
        return byAssignee.get(userId)!;
    };

    for (const row of rows) {
        if (row.assigneeId) touch(row.assigneeId).controlCount++;
        else unassignedControlCount++;

        let taskCount = 0;
        let monthsHit: number[] = [];
        if (row.frequency === 'AD_HOC') {
            taskCount = 1; // Madde 7: kesin toplama girmez ama kişi bazlı tekil task olarak sayılır
        } else if (row.frequency === 'DAILY') {
            taskCount = 0;
        } else {
            const periods = computeScopePeriods(row.frequency, year, { selectedMonths: row.selectedMonths, controlDate: row.controlDate });
            taskCount = periods.length;
            monthsHit = periods.map(p => p.targetDate.getMonth());
        }

        if (row.assigneeId) {
            const entry = touch(row.assigneeId);
            entry.taskCount += taskCount;
            for (const m of monthsHit) entry.byMonth[m] += 1;
        } else {
            unassignedTaskCount += taskCount;
        }

        if (row.secondControllerId) {
            bySecondController.set(row.secondControllerId, (bySecondController.get(row.secondControllerId) ?? 0) + taskCount);
        }
    }

    return {
        byAssignee: Array.from(byAssignee.values()),
        bySecondController: Array.from(bySecondController.entries()).map(([userId, reviewCount]) => ({ userId, reviewCount })),
        unassignedControlCount, unassignedTaskCount,
    };
}

@Injectable()
export class AnnualPlanService {
    constructor(
        private prisma: PrismaService,
        private scopeService: DirectorateScopeService,
        private controlScopeService: ControlScopeService,
    ) { }

    private async resolveAndAssertControlsInScope(
        userId: string, permissions: string[], requested: { scope?: any; directorateId?: string[] },
        controlIds: string[], year?: number,
    ) {
        const resolved = await this.scopeService.resolveScope(userId, permissions, requested);
        if (resolved.appliedScope === 'ORG' || controlIds.length === 0) return resolved;

        const where: any = { id: { in: controlIds } };
        if (resolved.appliedScope === 'UNIT') {
            where.directorateId = { in: resolved.directorateIds! };
        } else {
            // MINE — ownerId artık "oluşturan" demek, "atanan kontrolcü" değil
            // (bkz. plan D5). Bu yılın kapsamında kendisine atanmış (assignee/
            // secondController) olan kontroller de MINE'a dahil edilmeli, yoksa
            // yalnızca oluşturan kişi görebilir, gerçek kontrolcü dışlanır.
            where.OR = [
                { ownerId: userId },
                ...(year != null ? [{ yearScopes: { some: { year, OR: [{ assigneeId: userId }, { secondControllerId: userId }] } } }] : []),
            ];
        }

        const authorizedCount = await this.prisma.control.count({ where });
        if (authorizedCount !== controlIds.length) {
            throw new ForbiddenException('Yetkiniz dışındaki kontrolleri planlayamazsınız.');
        }
        return resolved;
    }

    // ─── Taslak getir/oluştur (yıl başına TEK paylaşılan taslak) ─────────────
    async getOrCreateDraft(year: number, userId: string) {
        const existing = await this.prisma.annualPlanDraft.findUnique({ where: { year } });
        if (existing) return existing;
        try {
            return await this.prisma.annualPlanDraft.create({ data: { year, updatedById: userId } });
        } catch (e: any) {
            // Eşzamanlı ilk-oluşturma yarışı — @@unique([year]) kazanan tarafı bulur.
            if (e?.code === 'P2002') return this.prisma.annualPlanDraft.findUniqueOrThrow({ where: { year } });
            throw e;
        }
    }

    async getDraft(year: number, userId: string) {
        const draft = await this.getOrCreateDraft(year, userId);
        const items = await this.prisma.annualPlanDraftItem.findMany({ where: { draftId: draft.id } });
        return { ...draft, items };
    }

    // ─── Taslak satırlarını güncelle (iyimser eşzamanlılık) ──────────────────
    async saveDraftItems(year: number, userId: string, permissions: string[], dto: SaveDraftItemsDto, requestedScope: { scope?: any; directorateId?: string[] }) {
        await this.resolveAndAssertControlsInScope(userId, permissions, requestedScope, dto.items.map(i => i.controlId), year);
        const draft = await this.getOrCreateDraft(year, userId);

        return this.prisma.$transaction(async (tx) => {
            const claim = await tx.annualPlanDraft.updateMany({
                where: { id: draft.id, revision: dto.expectedRevision },
                data: { revision: { increment: 1 }, updatedById: userId },
            });
            if (claim.count === 0) {
                throw new ConflictException('Taslak başka bir kullanıcı tarafından güncellendi. Sayfayı yenileyip tekrar deneyin.');
            }
            await this.upsertItems(tx, draft.id, dto.items);
            return tx.annualPlanDraft.findUniqueOrThrow({ where: { id: draft.id }, include: { items: true } });
        });
    }

    /**
     * Taslak satırını KISMİ günceller — Kapsam-Takvim sekmesi yalnızca
     * frequency/referenceMonth/controlDate gönderir, Kontrolcü Atamaları
     * sekmesi yalnızca assigneeId/secondControllerId gönderir (madde 4/6: aynı
     * PATCH uç noktası, iki sekme). Bir alan `undefined` gelirse (bu istekte
     * dokunulmadıysa) satırın MEVCUT değeri korunur — aksi halde bir sekmenin
     * kaydı diğer sekmenin daha önce kaydettiği alanları sessizce sıfırlardı.
     */
    private async upsertItems(tx: any, draftId: string, items: AnnualPlanDraftItemPatchDto[]) {
        for (const item of items) {
            const existing = await tx.annualPlanDraftItem.findUnique({
                where: { draftId_controlId: { draftId, controlId: item.controlId } },
            });

            const frequency = item.frequency !== undefined ? item.frequency : existing?.frequency ?? undefined;
            const referenceMonth = item.referenceMonth !== undefined ? item.referenceMonth : existing?.referenceMonth ?? null;
            // Periyodik sıklıklarda selectedMonths istemciden güvenilmez — referenceMonth
            // varsa backend kendi hesaplar (madde 21). referenceMonth de selectedMonths de
            // bu istekte değişmediyse mevcut selectedMonths korunur (AD_HOC dahil).
            const scheduleTouched = item.frequency !== undefined || item.referenceMonth !== undefined || item.selectedMonths !== undefined;
            const selectedMonths = !scheduleTouched
                ? (existing?.selectedMonths ?? [])
                : (referenceMonth != null && frequency && ['QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL'].includes(frequency)
                    ? monthNumbersToLabels(computeMonthGroup(frequency as any, referenceMonth))
                    : (item.selectedMonths ?? []));
            const controlDate = item.controlDate !== undefined ? new Date(item.controlDate) : (scheduleTouched ? null : existing?.controlDate ?? null);
            const reason = item.reason !== undefined ? item.reason : existing?.reason ?? null;

            const assigneeId = item.assigneeId !== undefined ? (item.assigneeId || null) : (existing?.assigneeId ?? null);
            const secondControllerId = item.secondControllerId !== undefined ? (item.secondControllerId || null) : (existing?.secondControllerId ?? null);
            if (item.assigneeId !== undefined || item.secondControllerId !== undefined) {
                await this.controlScopeService.validateAssignment(tx, assigneeId, secondControllerId);
            }

            await tx.annualPlanDraftItem.upsert({
                where: { draftId_controlId: { draftId, controlId: item.controlId } },
                create: {
                    draftId, controlId: item.controlId, inScope: item.inScope,
                    frequency, referenceMonth, selectedMonths, controlDate, reason,
                    assigneeId, secondControllerId,
                },
                update: {
                    inScope: item.inScope, frequency, referenceMonth, selectedMonths, controlDate, reason,
                    assigneeId, secondControllerId,
                },
            });
        }
    }

    // ─── Toplu taslak işlemi (Madde 14) — ADD/REMOVE kapsam, ASSIGN atama ────
    async bulkDraftAction(year: number, userId: string, permissions: string[], dto: BulkDraftActionDto, requestedScope: { scope?: any; directorateId?: string[] }) {
        await this.resolveAndAssertControlsInScope(userId, permissions, requestedScope, dto.controlIds, year);
        const draft = await this.getOrCreateDraft(year, userId);
        const controls = await this.prisma.control.findMany({ where: { id: { in: dto.controlIds } } });

        if (dto.action === 'ASSIGN') {
            return this.bulkAssign(year, userId, draft, controls, dto);
        }

        return this.prisma.$transaction(async (tx) => {
            const claim = await tx.annualPlanDraft.updateMany({
                where: { id: draft.id, revision: dto.expectedRevision },
                data: { revision: { increment: 1 }, updatedById: userId },
            });
            if (claim.count === 0) {
                throw new ConflictException('Taslak başka bir kullanıcı tarafından güncellendi. Sayfayı yenileyip tekrar deneyin.');
            }
            const items: AnnualPlanDraftItemPatchDto[] = controls.map(c => ({
                controlId: c.id,
                inScope: dto.action === 'ADD',
                frequency: dto.frequency ?? (c.frequency as ControlFrequency),
                selectedMonths: dto.selectedMonths ?? c.selectedMonths,
            }));
            await this.upsertItems(tx, draft.id, items);
            return tx.annualPlanDraft.findUniqueOrThrow({ where: { id: draft.id }, include: { items: true } });
        });
    }

    /** ASSIGN dalı — aynı-kişi-iki-alana çakışmasını topluca reddeder, dryRun'da
     * önizleme (willOverwrite/willSet) döner, onlyMissing yalnızca eksik atamalı
     * satırları etkiler (Madde 11). */
    private async bulkAssign(year: number, userId: string, draft: { id: string; revision: number }, controls: { id: string }[], dto: BulkDraftActionDto) {
        if (dto.assigneeId && dto.secondControllerId && dto.assigneeId === dto.secondControllerId) {
            throw new BadRequestException('Aynı kişi hem atanan kontrolcü hem ikinci kontrolcü olarak toplu atanamaz.');
        }
        const assigneeId = dto.assigneeId !== undefined ? (dto.assigneeId || null) : undefined;
        const secondControllerId = dto.secondControllerId !== undefined ? (dto.secondControllerId || null) : undefined;
        if (assigneeId !== undefined || secondControllerId !== undefined) {
            await this.controlScopeService.validateAssignment(this.prisma, assigneeId ?? null, secondControllerId ?? null);
        }

        const controlIds = controls.map(c => c.id);
        const draftItems = await this.prisma.annualPlanDraftItem.findMany({ where: { draftId: draft.id, controlId: { in: controlIds } } });
        const draftByControl = new Map(draftItems.map(i => [i.controlId, i]));
        const realScopes = await this.prisma.controlYearScope.findMany({ where: { controlId: { in: controlIds }, year, status: 'ACTIVE' } });
        const realScopeByControl = new Map(realScopes.map(s => [s.controlId, s]));

        const willOverwrite: { controlId: string; from: { assigneeId: string | null; secondControllerId: string | null } }[] = [];
        const willSet: string[] = [];
        for (const controlId of controlIds) {
            const draftItem = draftByControl.get(controlId);
            const realScope = realScopeByControl.get(controlId);
            const currentAssignee = draftItem?.assigneeId ?? realScope?.assigneeId ?? null;
            const currentSecond = draftItem?.secondControllerId ?? realScope?.secondControllerId ?? null;
            const hasExisting = !!currentAssignee || !!currentSecond;
            if (dto.onlyMissing && hasExisting) continue;
            if (hasExisting) willOverwrite.push({ controlId, from: { assigneeId: currentAssignee, secondControllerId: currentSecond } });
            else willSet.push(controlId);
        }

        if (dto.dryRun) {
            return { willOverwrite, willSet, totalAffected: willOverwrite.length + willSet.length };
        }

        const targetControlIds = new Set([...willOverwrite.map(w => w.controlId), ...willSet]);
        return this.prisma.$transaction(async (tx) => {
            const claim = await tx.annualPlanDraft.updateMany({
                where: { id: draft.id, revision: dto.expectedRevision },
                data: { revision: { increment: 1 }, updatedById: userId },
            });
            if (claim.count === 0) {
                throw new ConflictException('Taslak başka bir kullanıcı tarafından güncellendi. Sayfayı yenileyip tekrar deneyin.');
            }
            const items: AnnualPlanDraftItemPatchDto[] = controls.filter(c => targetControlIds.has(c.id)).map(c => {
                const draftItem = draftByControl.get(c.id);
                const realScope = realScopeByControl.get(c.id);
                return {
                    controlId: c.id,
                    inScope: draftItem ? draftItem.inScope : !!realScope,
                    ...(assigneeId !== undefined ? { assigneeId: assigneeId ?? '' } : {}),
                    ...(secondControllerId !== undefined ? { secondControllerId: secondControllerId ?? '' } : {}),
                };
            });
            await this.upsertItems(tx, draft.id, items);
            await tx.auditLog.create({
                data: {
                    userId, action: 'ANNUAL_PLAN_BULK_ASSIGN', entityType: 'AnnualPlanDraft', entityId: draft.id,
                    newValue: { year, assigneeId, secondControllerId, affectedCount: items.length },
                },
            });
            return tx.annualPlanDraft.findUniqueOrThrow({ where: { id: draft.id }, include: { items: true } });
        });
    }

    // ─── Önceki yıldan taslağa tohumla (yalnızca eksikleri doldurur — mevcut
    // taslak satırlarının üzerine YAZMAZ; Madde 14 "ekleme ile değiştirme farkı"). ──
    async copyFromYear(year: number, fromYear: number, userId: string, permissions: string[], requestedScope: { scope?: any; directorateId?: string[] }) {
        const resolved = await this.scopeService.resolveScope(userId, permissions, requestedScope);
        const scopeWhere: any = { year: fromYear, status: 'ACTIVE' };
        if (resolved.appliedScope === 'UNIT') scopeWhere.control = { directorateId: { in: resolved.directorateIds! } };

        const sourceScopes = await this.prisma.controlYearScope.findMany({ where: scopeWhere, include: { control: true } });
        const draft = await this.getOrCreateDraft(year, userId);
        const existingItems = await this.prisma.annualPlanDraftItem.findMany({ where: { draftId: draft.id }, select: { controlId: true } });
        const alreadyTouched = new Set(existingItems.map(i => i.controlId));

        const toSeed = sourceScopes.filter(s => !alreadyTouched.has(s.controlId) && s.control.status === 'ACTIVE');

        const result = await this.prisma.$transaction(async (tx) => {
            const claim = await tx.annualPlanDraft.updateMany({
                where: { id: draft.id, revision: draft.revision },
                data: { revision: { increment: 1 }, updatedById: userId },
            });
            if (claim.count === 0) {
                throw new ConflictException('Taslak başka bir kullanıcı tarafından güncellendi. Sayfayı yenileyip tekrar deneyin.');
            }
            const items: AnnualPlanDraftItemPatchDto[] = toSeed.map(s => ({
                controlId: s.controlId, inScope: true,
                frequency: s.frequency as ControlFrequency, selectedMonths: s.selectedMonths,
                reason: `${fromYear} yılından kopyalandı`,
            }));
            await this.upsertItems(tx, draft.id, items);
            return tx.annualPlanDraft.findUniqueOrThrow({ where: { id: draft.id }, include: { items: true } });
        });

        return {
            draft: result,
            seeded: toSeed.length,
            skippedAlreadyInDraft: sourceScopes.length - toSeed.length,
        };
    }

    // ─── Taslağı gerçek duruma sıfırla ("Değişiklikleri Geri Al") ────────────
    async discardDraft(year: number, userId: string) {
        const draft = await this.getOrCreateDraft(year, userId);
        return this.prisma.$transaction(async (tx) => {
            await tx.annualPlanDraftItem.deleteMany({ where: { draftId: draft.id } });
            return tx.annualPlanDraft.update({ where: { id: draft.id }, data: { revision: { increment: 1 }, updatedById: userId } });
        });
    }

    /** RBAC-scoped bağlam: hem Kapsam-Takvim hem Kontrolcü-Atamaları sekmesi
     * BUNU çağırır — iki ayrı hesap yazılmaz. */
    private async loadWorkspaceContext(year: number, userId: string, permissions: string[], scopeQuery: { scope?: any; directorateId?: string[] }) {
        const resolved = await this.scopeService.resolveScope(userId, permissions, scopeQuery);
        const scopeOptions = await this.scopeService.getScopeOptions(userId, permissions);

        const rbacWhere: any = { status: 'ACTIVE' };
        if (resolved.appliedScope === 'UNIT') rbacWhere.directorateId = { in: resolved.directorateIds! };
        else if (resolved.appliedScope === 'MINE') {
            rbacWhere.OR = [{ ownerId: userId }, { yearScopes: { some: { year, OR: [{ assigneeId: userId }, { secondControllerId: userId }] } } }];
        }

        const draft = await this.getOrCreateDraft(year, userId);
        const draftItems = await this.prisma.annualPlanDraftItem.findMany({ where: { draftId: draft.id } });
        const draftByControl = new Map(draftItems.map(i => [i.controlId, i]));

        const allControls = await this.prisma.control.findMany({
            where: rbacWhere,
            select: { id: true, controlId: true, name: true, frequency: true, selectedMonths: true, controlDate: true, directorateId: true, ownerId: true },
        });

        const realScopesThisYear = await this.prisma.controlYearScope.findMany({
            where: { year, controlId: { in: allControls.map(c => c.id) }, status: 'ACTIVE' },
        });
        const realScopeByControl = new Map(realScopesThisYear.map(s => [s.controlId, s]));

        return { resolved, scopeOptions, draft, allControls, draftByControl, realScopeByControl };
    }

    /** Kontrol × yıl için TEK etkin-satır hesabı — Kapsam-Takvim tablosu,
     * Kontrolcü-Atamaları tablosu ve iş yükü KPI'ları hepsi bundan türer. */
    private buildEffectiveRows(
        allControls: { id: string; controlId: string; name: string; frequency: ControlFrequency; selectedMonths: string[]; controlDate: Date | null; directorateId: string | null; ownerId: string }[],
        draftByControl: Map<string, any>, realScopeByControl: Map<string, any>, year: number,
    ) {
        return allControls.map(c => {
            const draftItem = draftByControl.get(c.id);
            const realScope = realScopeByControl.get(c.id);
            const inScope = draftItem ? draftItem.inScope : !!realScope;
            const effFrequency = (draftItem?.frequency ?? realScope?.frequency ?? c.frequency) as ControlFrequency;
            const effReferenceMonth = draftItem?.referenceMonth ?? realScope?.referenceMonth ?? null;
            const effMonths = draftItem?.selectedMonths ?? realScope?.selectedMonths ?? c.selectedMonths;
            const effControlDate = draftItem?.controlDate ?? realScope?.controlDate ?? c.controlDate;
            const effAssigneeId = draftItem?.assigneeId ?? realScope?.assigneeId ?? null;
            const effSecondControllerId = draftItem?.secondControllerId ?? realScope?.secondControllerId ?? null;
            const isAdHoc = effFrequency === 'AD_HOC';
            const isDaily = effFrequency === 'DAILY';
            const missingSchedule = isAdHoc && inScope && !effControlDate && effMonths.length === 0;
            // Madde 10: yalnızca periyodik (DAILY/AD_HOC hariç) kontroller için atama zorunlu.
            const assignmentRequired = inScope && !isAdHoc && !isDaily;
            const assignmentComplete = !assignmentRequired || (!!effAssigneeId && !!effSecondControllerId);
            const changed = !!draftItem && (
                draftItem.inScope !== !!realScope ||
                (realScope && draftItem.frequency && draftItem.frequency !== realScope.frequency) ||
                (realScope && draftItem.referenceMonth != null && draftItem.referenceMonth !== realScope.referenceMonth) ||
                (realScope && draftItem.assigneeId !== undefined && draftItem.assigneeId !== realScope.assigneeId) ||
                (realScope && draftItem.secondControllerId !== undefined && draftItem.secondControllerId !== realScope.secondControllerId)
            );
            const plannedTestCount = inScope && !isAdHoc && !isDaily
                ? computeScopePeriods(effFrequency, year, { selectedMonths: effMonths, controlDate: effControlDate, referenceMonth: effReferenceMonth }).length
                : (inScope && isAdHoc ? 1 : 0);
            return {
                controlId: c.id, controlCode: c.controlId, name: c.name, frequency: c.frequency,
                directorateId: c.directorateId, ownerId: c.ownerId,
                inScope, effectiveFrequency: effFrequency, effectiveReferenceMonth: effReferenceMonth,
                effectiveSelectedMonths: effMonths, effectiveControlDate: effControlDate,
                assigneeId: effAssigneeId, secondControllerId: effSecondControllerId,
                assignmentComplete, plannedTestCount,
                isAdHoc, missingSchedule, changedInDraft: !!changed,
                pendingAction: draftItem ? (draftItem.inScope === !!realScope ? (changed ? 'MODIFY' : 'NONE') : (draftItem.inScope ? 'ADD' : 'REMOVE')) : 'NONE',
            };
        });
    }

    // ─── Workspace: kontrol × yıl matrisi + KPI'lar (Kapsam ve Takvim sekmesi) ──
    async getWorkspace(year: number, userId: string, permissions: string[], query: AnnualPlanWorkspaceQueryDto) {
        const { resolved, scopeOptions, draft, allControls, draftByControl, realScopeByControl } =
            await this.loadWorkspaceContext(year, userId, permissions, { scope: query.scope, directorateId: query.directorateId });

        // İş yükü KPI/grafiği yalnızca görüntülenen sayfaya/filtreye göre değil,
        // taslağın tamamına göre hesaplanır (Madde 11-12).
        const effectiveRows = this.buildEffectiveRows(allControls, draftByControl, realScopeByControl, year);
        const workloadRows: WorkloadRow[] = effectiveRows.filter(r => r.inScope).map(r => ({
            controlId: r.controlId, frequency: r.effectiveFrequency, selectedMonths: r.effectiveSelectedMonths, controlDate: r.effectiveControlDate,
        }));
        const workload = computeWorkload(workloadRows, year);
        const changedCount = effectiveRows.filter(r => r.changedInDraft).length;

        // ── YUMUŞAK (tablo görünümü) filtreler — yalnızca `rows`u daraltır,
        // KPI/workload zaten yukarıda tüm yetkili kümeden hesaplandı. ─────────
        let rows = effectiveRows;
        if (query.search) {
            const q = query.search.toLowerCase();
            rows = rows.filter(r => r.controlCode.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
        }
        if (query.ownerId) rows = rows.filter(r => r.ownerId === query.ownerId);
        if (query.frequency) rows = rows.filter(r => r.frequency === query.frequency);
        if (query.scopeFilter === 'IN_SCOPE') rows = rows.filter(r => r.inScope);
        if (query.scopeFilter === 'OUT_OF_SCOPE') rows = rows.filter(r => !r.inScope);
        if (query.missingSchedule) rows = rows.filter(r => r.missingSchedule);
        if (query.changedInDraft) rows = rows.filter(r => r.changedInDraft);
        if (query.assignmentIncomplete) rows = rows.filter(r => !r.assignmentComplete);

        const totalCount = rows.length;
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 25;
        const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

        // Sayfadaki satırlar için önceki/sonraki yıl kapsam durumu (yalnızca
        // görünen sayfa — bu iki sütun yalnızca gösterim amaçlı, KPI'ya girmez).
        const pageControlIds = pageRows.map(r => r.controlId);
        const adjacentScopes = await this.prisma.controlYearScope.findMany({
            where: { controlId: { in: pageControlIds }, year: { in: [year - 1, year + 1] }, status: 'ACTIVE' },
            select: { controlId: true, year: true },
        });
        const prevSet = new Set(adjacentScopes.filter(s => s.year === year - 1).map(s => s.controlId));
        const nextSet = new Set(adjacentScopes.filter(s => s.year === year + 1).map(s => s.controlId));

        return {
            year, draftId: draft.id, draftRevision: draft.revision, draftStatus: draft.status,
            draftUpdatedAt: draft.updatedAt, draftLastAppliedAt: draft.lastAppliedAt,
            scope: { applied: resolved.appliedScope, directorateIds: resolved.directorateIds, options: scopeOptions },
            workload, changedCount,
            page, pageSize, totalCount,
            data: pageRows.map(r => ({
                ...r,
                prevYearScoped: prevSet.has(r.controlId),
                nextYearScoped: nextSet.has(r.controlId),
            })),
        };
    }

    // ─── Kontrolcü Atamaları sekmesi: yalnızca taslak kapsamındaki kontroller ──
    async getAssignmentsView(year: number, userId: string, permissions: string[], query: AnnualPlanWorkspaceQueryDto) {
        const { draft, allControls, draftByControl, realScopeByControl } =
            await this.loadWorkspaceContext(year, userId, permissions, { scope: query.scope, directorateId: query.directorateId });

        let rows = this.buildEffectiveRows(allControls, draftByControl, realScopeByControl, year).filter(r => r.inScope);

        if (query.search) {
            const q = query.search.toLowerCase();
            rows = rows.filter(r => r.controlCode.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
        }
        if (query.frequency) rows = rows.filter(r => r.frequency === query.frequency);
        if (query.assignmentIncomplete) rows = rows.filter(r => !r.assignmentComplete);
        if (query.changedInDraft) rows = rows.filter(r => r.changedInDraft);

        const totalCount = rows.length;
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 25;
        const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

        return {
            year, draftId: draft.id, draftRevision: draft.revision, draftStatus: draft.status,
            page, pageSize, totalCount, data: pageRows,
        };
    }

    // ─── Seçilebilir kontrolcü listesi (Madde 10) ─────────────────────────────
    async getEligibleControllers(year: number, userId: string, permissions: string[], role: 'assignee' | 'secondController', controlId: string | undefined, scopeQuery: { scope?: any; directorateId?: string[] }) {
        const resolved = await this.scopeService.resolveScope(userId, permissions, scopeQuery);
        let directorateId: string | null = null;
        if (controlId) {
            const control = await this.prisma.control.findUnique({ where: { id: controlId }, select: { directorateId: true } });
            directorateId = control?.directorateId ?? null;
        }

        const where: any = { isActive: true };
        if (resolved.appliedScope === 'UNIT') {
            where.directorateMemberships = { some: { directorateId: { in: resolved.directorateIds! } } };
        }

        const users = await this.prisma.user.findMany({
            where, select: { id: true, firstName: true, lastName: true, email: true, role: { select: { permissions: true } } },
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        });

        const filtered = role === 'secondController'
            ? users.filter(u => {
                const perms: string[] = Array.isArray(u.role?.permissions) ? (u.role.permissions as unknown as string[]) : [];
                return perms.some(p => p === '*' || p === 'control:*' || p === 'control:test' || p.startsWith('control:'));
            })
            : users;

        return { data: filtered.map(u => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email })), directorateId };
    }

    // ─── Kontrolcü bazlı iş yükü (Madde 12) ───────────────────────────────────
    async getWorkloadByAssignee(year: number, userId: string, permissions: string[], scopeQuery: { scope?: any; directorateId?: string[] }) {
        const { allControls, draftByControl, realScopeByControl } = await this.loadWorkspaceContext(year, userId, permissions, scopeQuery);
        const effectiveRows = this.buildEffectiveRows(allControls, draftByControl, realScopeByControl, year).filter(r => r.inScope);

        const rows: AssigneeWorkloadRow[] = effectiveRows.map(r => ({
            controlId: r.controlId, frequency: r.effectiveFrequency, selectedMonths: r.effectiveSelectedMonths,
            controlDate: r.effectiveControlDate, assigneeId: r.assigneeId, secondControllerId: r.secondControllerId,
        }));
        const result = computeWorkloadByAssignee(rows, year);

        const userIds = [...new Set([...result.byAssignee.map(a => a.userId), ...result.bySecondController.map(a => a.userId)])];
        const users = userIds.length > 0
            ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
            : [];
        const nameById = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`]));

        return {
            byAssignee: result.byAssignee.map(a => ({ ...a, name: nameById.get(a.userId) ?? a.userId })),
            bySecondController: result.bySecondController.map(a => ({ ...a, name: nameById.get(a.userId) ?? a.userId })),
            unassignedControlCount: result.unassignedControlCount, unassignedTaskCount: result.unassignedTaskCount,
        };
    }

    // ─── Önizleme: taslak → gerçek fark (yazmaz) ─────────────────────────────
    async previewApply(year: number, userId: string, permissions: string[]) {
        const draft = await this.getOrCreateDraft(year, userId);
        const items = await this.prisma.annualPlanDraftItem.findMany({ where: { draftId: draft.id } });
        if (items.length === 0) {
            return { toAdd: [], toRemove: [], toModify: [], conflicts: [], missingSchedule: [], assignmentBlocked: [], taskSummary: { toCreate: 0, toCancel: 0, protectedCount: 0 }, blocked: false };
        }

        const controls = await this.prisma.control.findMany({ where: { id: { in: items.map(i => i.controlId) } } });
        const controlById = new Map(controls.map(c => [c.id, c]));
        const realScopes = await this.prisma.controlYearScope.findMany({
            where: { controlId: { in: items.map(i => i.controlId) }, year },
        });
        const realScopeByControl = new Map(realScopes.map(s => [s.controlId, s]));

        const toAdd: any[] = [], toRemove: any[] = [], toModify: any[] = [], conflicts: any[] = [], missingSchedule: any[] = [], assignmentBlocked: any[] = [];
        let taskToCreate = 0, taskToCancel = 0, taskProtected = 0;

        for (const item of items) {
            const control = controlById.get(item.controlId);
            if (!control) continue;
            const realScope = realScopeByControl.get(item.controlId);
            const realActive = !!realScope && realScope.status === 'ACTIVE';
            const frequency = (item.frequency ?? control.frequency) as ControlFrequency;
            const referenceMonth = item.referenceMonth ?? realScope?.referenceMonth ?? null;
            const selectedMonths = referenceMonth != null && ['QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL'].includes(frequency)
                ? monthNumbersToLabels(computeMonthGroup(frequency as any, referenceMonth))
                : (item.selectedMonths.length > 0 ? item.selectedMonths : control.selectedMonths);
            const effAssigneeId = item.assigneeId ?? realScope?.assigneeId ?? null;
            const effSecondControllerId = item.secondControllerId ?? realScope?.secondControllerId ?? null;
            const isPeriodic = frequency !== 'AD_HOC' && frequency !== 'DAILY';

            if (item.inScope && frequency === 'AD_HOC' && !item.controlDate && selectedMonths.length === 0) {
                missingSchedule.push({ controlId: control.id, controlCode: control.controlId, name: control.name });
                continue; // Madde 16: eksik zorunlu takvim → apply bloklanır, taslak kaydı etkilenmez.
            }
            // Madde 10: periyodik kontrol için plan uygulama, atama tamamlanmadan bloklanır.
            if (item.inScope && isPeriodic && (!effAssigneeId || !effSecondControllerId)) {
                assignmentBlocked.push({ controlId: control.id, controlCode: control.controlId, name: control.name });
                continue;
            }

            const frequencyChanged = item.frequency && item.frequency !== realScope?.frequency;
            const referenceMonthChanged = item.referenceMonth != null && item.referenceMonth !== realScope?.referenceMonth;
            const assignmentChanged = realActive && (effAssigneeId !== (realScope!.assigneeId ?? null) || effSecondControllerId !== (realScope!.secondControllerId ?? null));

            if (item.inScope && !realActive) {
                // addScope ile AYNI geçmiş-dönem filtresi (computePeriodsForScope) —
                // aksi halde önizleme, yıl ortasında kapsama alınan bir kontrol için
                // gerçekte oluşmayacak geçmiş dönemleri de sayıp yanlış task sayısı gösterir.
                const periods = this.controlScopeService.computePeriodsForScope(frequency, year, selectedMonths, item.controlDate, false, referenceMonth);
                toAdd.push({ controlId: control.id, controlCode: control.controlId, name: control.name, frequency, periodCount: periods.length, assigneeId: effAssigneeId, secondControllerId: effSecondControllerId });
                taskToCreate += periods.length;
            } else if (!item.inScope && realActive) {
                const pending = await this.controlScopeService.getOngoingTasksRequiringDecision(realScope!.id, [], this.prisma);
                if (pending.length > 0) {
                    conflicts.push({ controlId: control.id, controlCode: control.controlId, name: control.name, reason: 'Devam eden task(lar) için karar gerekli', ongoingTasks: pending });
                    continue;
                }
                const pendingTaskCount = await this.prisma.controlTest.count({ where: { scopeId: realScope!.id, status: 'BEKLIYOR' } });
                toRemove.push({ controlId: control.id, controlCode: control.controlId, name: control.name });
                taskToCancel += pendingTaskCount;
            } else if (item.inScope && realActive && (frequencyChanged || referenceMonthChanged || assignmentChanged)) {
                if (assignmentChanged) {
                    const liveAuto = await this.prisma.controlTest.findMany({
                        where: { scopeId: realScope!.id, isAutoGenerated: true, status: { in: ['DEVAM_EDIYOR', 'TAMAMLANDI', 'GERI_GONDERILDI'] } },
                        select: { id: true, testNo: true, status: true, assigneeId: true, secondControllerId: true },
                    });
                    const needsDecision = liveAuto.filter(t => t.assigneeId !== effAssigneeId || t.secondControllerId !== effSecondControllerId);
                    if (needsDecision.length > 0) {
                        conflicts.push({ controlId: control.id, controlCode: control.controlId, name: control.name, reason: 'Atama değişikliği için devam eden/onay bekleyen task kararı gerekli', ongoingTasks: needsDecision });
                        continue;
                    }
                }
                const newPeriods = computeScopePeriods(frequency, year, { selectedMonths, controlDate: item.controlDate, referenceMonth });
                const newKeys = new Set(newPeriods.map(p => p.periodKey));
                const existingTasks = await this.prisma.controlTest.findMany({ where: { scopeId: realScope!.id } });
                const cancel = existingTasks.filter(t => t.status === 'BEKLIYOR' && t.periodKey && !newKeys.has(t.periodKey));
                const existingKeys = new Set(existingTasks.map(t => t.periodKey));
                const create = newPeriods.filter(p => !existingKeys.has(p.periodKey));
                const protectedCount = existingTasks.filter(t => t.status !== 'BEKLIYOR' && t.periodKey && !newKeys.has(t.periodKey)).length;
                toModify.push({
                    controlId: control.id, controlCode: control.controlId, name: control.name,
                    fromFrequency: realScope!.frequency, toFrequency: frequency, toCreate: create.length, toCancel: cancel.length, protectedCount,
                    assigneeChange: assignmentChanged ? { from: realScope!.assigneeId ?? null, to: effAssigneeId } : null,
                    secondControllerChange: assignmentChanged ? { from: realScope!.secondControllerId ?? null, to: effSecondControllerId } : null,
                });
                taskToCreate += create.length; taskToCancel += cancel.length; taskProtected += protectedCount;
            }
        }

        return {
            toAdd, toRemove, toModify, conflicts, missingSchedule, assignmentBlocked,
            taskSummary: { toCreate: taskToCreate, toCancel: taskToCancel, protectedCount: taskProtected },
            blocked: conflicts.length > 0 || missingSchedule.length > 0 || assignmentBlocked.length > 0,
        };
    }

    // ─── Planı Uygula: TEK transaction, tümü ya da hiçbiri ───────────────────
    async applyPlan(year: number, userId: string, permissions: string[], dto: ApplyPlanDto) {
        const draft = await this.getOrCreateDraft(year, userId);
        if (draft.revision !== dto.expectedRevision) {
            throw new ConflictException('Taslak son önizlemeden sonra değişmiş. Lütfen yeniden önizleyin.');
        }

        const preview = await this.previewApply(year, userId, permissions);
        if (preview.blocked) {
            return { applied: false, requiresDecision: true, ...preview };
        }

        const items = await this.prisma.annualPlanDraftItem.findMany({ where: { draftId: draft.id } });
        const controls = await this.prisma.control.findMany({ where: { id: { in: items.map(i => i.controlId) } } });
        const controlById = new Map(controls.map(c => [c.id, c]));
        const realScopes = await this.prisma.controlYearScope.findMany({ where: { controlId: { in: items.map(i => i.controlId) }, year } });
        const realScopeByControl = new Map(realScopes.map(s => [s.controlId, s]));

        const result = await this.prisma.$transaction(async (tx) => {
            const claim = await tx.annualPlanDraft.updateMany({
                where: { id: draft.id, revision: dto.expectedRevision },
                data: { revision: { increment: 1 }, status: 'APPLIED', lastAppliedAt: new Date(), lastAppliedById: userId, updatedById: userId },
            });
            if (claim.count === 0) {
                throw new ConflictException('Taslak başka bir kullanıcı tarafından güncellendi. Sayfayı yenileyip tekrar deneyin.');
            }

            let added = 0, removed = 0, modified = 0, tasksCreated = 0;
            for (const item of items) {
                const control = controlById.get(item.controlId);
                if (!control) continue;
                const realScope = realScopeByControl.get(item.controlId);
                const realActive = !!realScope && realScope.status === 'ACTIVE';

                const effAssigneeId = item.assigneeId ?? realScope?.assigneeId ?? null;
                const effSecondControllerId = item.secondControllerId ?? realScope?.secondControllerId ?? null;
                const frequencyChanged = item.frequency && item.frequency !== realScope?.frequency;
                const referenceMonthChanged = item.referenceMonth != null && item.referenceMonth !== realScope?.referenceMonth;
                const assignmentChanged = realActive && (effAssigneeId !== (realScope!.assigneeId ?? null) || effSecondControllerId !== (realScope!.secondControllerId ?? null));

                if (item.inScope && !realActive) {
                    const r = await this.controlScopeService.addScope(item.controlId, {
                        years: [year],
                        frequency: item.frequency ?? undefined,
                        referenceMonth: item.referenceMonth ?? undefined,
                        selectedMonths: item.selectedMonths.length > 0 ? item.selectedMonths : undefined,
                        controlDate: item.controlDate ? item.controlDate.toISOString() : undefined,
                        assigneeId: effAssigneeId ?? undefined,
                        secondControllerId: effSecondControllerId ?? undefined,
                    } as any, userId, tx);
                    added++; tasksCreated += r.results[0]?.tasksCreated ?? 0;
                } else if (!item.inScope && realActive) {
                    const r = await this.controlScopeService.removeScope(item.controlId, year, { reason: item.reason || 'Yıllık Plan uygulaması ile kapsam dışı bırakıldı' } as any, userId, tx);
                    if (!r.requiresDecision) removed++;
                } else if (item.inScope && realActive && (frequencyChanged || referenceMonthChanged || assignmentChanged)) {
                    const r: any = await this.controlScopeService.changePeriodicity(item.controlId, year, {
                        frequency: item.frequency, referenceMonth: item.referenceMonth ?? undefined,
                        selectedMonths: item.selectedMonths.length > 0 ? item.selectedMonths : undefined,
                        assigneeId: effAssigneeId ?? undefined, secondControllerId: effSecondControllerId ?? undefined,
                        reason: item.reason || 'Yıllık Plan uygulaması',
                    } as any, userId, tx);
                    // previewApply zaten bu durumu conflicts'e alıp bloklamış olmalı — burası
                    // ikinci bir savunma katmanı: yine de gelirse TÜM transaction rollback olur
                    // (Madde 16: "kısmi kapsam/task/atama kalmaz").
                    if (r.requiresAssignmentDecision) {
                        throw new ConflictException(`Kontrol ${item.controlId}: atama değişikliği için devam eden task kararı gerekli — önce önizleyin.`);
                    }
                    modified++; tasksCreated += r.created;
                }
            }

            await tx.auditLog.create({
                data: {
                    userId, action: 'ANNUAL_PLAN_APPLY', entityType: 'AnnualPlanDraft', entityId: draft.id,
                    newValue: { year, added, removed, modified, tasksCreated, itemCount: items.length },
                },
            });

            return { added, removed, modified, tasksCreated };
        });

        return { applied: true, requiresDecision: false, ...result };
    }
}
