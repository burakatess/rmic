import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { getLastBusinessDay, getFridaysInYear, TURKISH_MONTH_INDEX } from './control-period.util';
import { generateControlCode } from './control-code.util';
import { nextTestCode } from './test-code.util';
import { projectControlStatus, projectTestStatus } from '../../common/workflow/workflow-projection';
import { overdueTestWhere, isTestOverdue, ACTIVE_TEST_STATUSES, OPEN_TEST_STATUSES } from '../../common/util/metric-definitions';
import { logTransition, testStage } from '../../common/workflow/workflow-stages';
import { personFieldWhere } from '../../common/util/person-filter';
import { CompleteControlTestDto, CreateControlTestDto } from './dto';
import { parsePaging, safeOrderBy } from '../../common/util/list-query';
import { Prisma } from '@prisma/client';

@Injectable()
export class ControlsService {
    constructor(private prisma: PrismaService) { }

    private duplicateControlCode(controlId: string) {
        return new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            code: 'CONTROL_CODE_ALREADY_EXISTS',
            message: `${controlId} Kontrol Kodu zaten kullanılıyor`,
            field: 'controlId',
        });
    }

    // ─── Controls CRUD ────────────────────────────────────────────────────────
    // Kontrol Havuzu kurum geneli açıktır; ancak ilişkili test/bulgu/risk kayıtları
    // (sayıları dahil) kendi kapsam politikalarından geçer → RelatedScopes.

    async findAll(query: any, sc: RelatedScopes = {}) {
        const { search, type, nature, ownerId, status, directorateId, sortBy, sortOrder, year } = query;
        const { page, limit, skip } = parsePaging(query, 20);

        const where: any = {};
        if (search) {
            // Eski kod (K-YYYY-NNNN) ile arama da yeni BTK kaydına ulaşmalı (Madde
            // 19/22) — CodeAlias'ta eşleşen entityId'ler de arama kümesine eklenir.
            const aliasMatches = await this.prisma.codeAlias.findMany({
                where: { entityType: 'CONTROL', oldCode: { contains: search, mode: 'insensitive' } },
                select: { entityId: true },
            });
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { controlId: { contains: search, mode: 'insensitive' } },
                ...(aliasMatches.length > 0 ? [{ id: { in: aliasMatches.map(a => a.entityId) } }] : []),
            ];
        }
        if (type) where.type = type;
        if (nature) where.nature = nature;
        if (ownerId) where.ownerId = ownerId;
        if (status) where.status = status;
        if (directorateId) where.directorateId = directorateId;
        // "Tüm Envanter" (year=all veya boş) → filtre yok. Belirli yıl → o yılın
        // aktif kapsamına giren kontroller.
        if (year && year !== 'all') {
            where.yearScopes = { some: { year: parseInt(year, 10), status: 'ACTIVE' } };
        }

        const [controls, total] = await Promise.all([
            this.prisma.control.findMany({
                where,
                include: {
                    owner: { select: { id: true, firstName: true, lastName: true, email: true, department: true } },                    directorateRel: { select: { id: true, name: true, code: true } },
                    risks: { where: sc.risk ? { risk: sc.risk } : undefined, include: { risk: { select: { id: true, riskId: true, name: true } } } },
                    yearScopes: { where: { status: 'ACTIVE' }, select: { year: true }, orderBy: { year: 'asc' } },
                    _count: {
                        select: {
                            risks: sc.risk ? { where: { risk: sc.risk } } : true,
                            tests: sc.test ? { where: sc.test } : true,
                            findings: sc.finding ? { where: sc.finding } : true,
                        },
                    },
                },
                skip,
                take: limit,
                orderBy: safeOrderBy(sortBy, sortOrder, Prisma.ControlScalarFieldEnum, 'createdAt', 'desc'),
            }),
            this.prisma.control.count({ where }),
        ]);

        const currentYear = new Date().getFullYear();
        const summaries = await this.listSummaries(controls.map((c: any) => c.id), currentYear, sc);
        const data = controls.map((c: any) => {
            const scopeYears = c.yearScopes.map((s: any) => s.year);
            return {
                ...c, scopeYears, ...projectControlStatus(scopeYears.includes(currentYear), currentYear),
                ...(summaries.get(c.id) ?? { testSummary: { year: currentYear, planned: 0, completed: 0, overdue: 0, nextPlannedDate: null }, openFindingCount: 0 }),
            };
        });

        return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    /**
     * Envanter listesi özeti (tek sorguda sayfadaki tüm kontroller için): bu yılın test uyumu,
     * sıradaki açık test ve açık bulgu sayısı. Gecikme kuralı tek kaynaktan (metric-definitions).
     */
    private async listSummaries(ids: string[], year: number, sc: RelatedScopes) {
        const out = new Map<string, { testSummary: { year: number; planned: number; completed: number; overdue: number; nextPlannedDate: Date | null }; openFindingCount: number }>();
        if (ids.length === 0) return out;
        const from = new Date(Date.UTC(year, 0, 1) - 3 * 3600000); // İstanbul yılbaşı
        const to = new Date(Date.UTC(year + 1, 0, 1) - 3 * 3600000);
        const [tests, findings] = await Promise.all([
            this.prisma.controlTest.findMany({
                where: { AND: [{ controlId: { in: ids }, deletedAt: null, status: { in: [...ACTIVE_TEST_STATUSES] }, plannedDate: { gte: from, lt: to } }, sc.test ?? {}] },
                select: { controlId: true, status: true, plannedDate: true },
            }),
            this.prisma.finding.groupBy({
                by: ['controlId'],
                where: { AND: [{ controlId: { in: ids }, resolutionStatus: { not: 'KAPATILDI' }, workflowStatus: { not: 'IPTAL' }, status: { not: 'CLOSED' } }, sc.finding ?? {}] },
                _count: { _all: true },
            }),
        ]);
        const get = (id: string) => {
            let e = out.get(id);
            if (!e) { e = { testSummary: { year, planned: 0, completed: 0, overdue: 0, nextPlannedDate: null }, openFindingCount: 0 }; out.set(id, e); }
            return e;
        };
        const now = new Date();
        for (const t of tests) {
            const ts = get(t.controlId).testSummary;
            ts.planned++;
            if (t.status === 'TAMAMLANDI' || t.status === 'ONAYLANDI') ts.completed++;
            if ((OPEN_TEST_STATUSES as readonly string[]).includes(t.status)) {
                if (isTestOverdue(t, now)) ts.overdue++;
                if (!ts.nextPlannedDate || t.plannedDate < ts.nextPlannedDate) ts.nextPlannedDate = t.plannedDate;
            }
        }
        for (const f of findings) if (f.controlId) get(f.controlId).openFindingCount = f._count._all;
        return out;
    }

    async findOne(id: string, sc: RelatedScopes = {}) {
        const control = await this.prisma.control.findUnique({
            where: { id },
            include: {
                owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                testPerformer: { select: { id: true, firstName: true, lastName: true, email: true } },
                reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
                directorateRel: { select: { id: true, name: true, code: true, gmy: true } },
                risks: { where: sc.risk ? { risk: sc.risk } : undefined, include: { risk: true } },
                yearScopes: {
                    orderBy: { year: 'asc' },
                    include: {
                        addedBy: { select: { id: true, firstName: true, lastName: true } },
                        removedBy: { select: { id: true, firstName: true, lastName: true } },
                        assignee: { select: { id: true, firstName: true, lastName: true, department: true } },
                        secondController: { select: { id: true, firstName: true, lastName: true, department: true } },
                        _count: { select: { tasks: true } },
                    },
                },
                tests: {
                    where: sc.test ? { AND: [{ deletedAt: null }, sc.test] } : { deletedAt: null },
                    orderBy: { plannedDate: 'asc' },
                    include: {
                        findings: { where: sc.finding ?? undefined, select: { id: true, findingId: true, severity: true, resolutionStatus: true } },
                        _count: { select: { findingLinks: true } },
                    },
                },
                // Tüm bulgular (önceden ilk 10 ile sessizce kesiliyordu). Kontrol başına bulgu sayısı küçüktür.
                findings: {
                    where: sc.finding ?? undefined,
                    orderBy: { createdAt: 'desc' },
                    include: {
                        actions: {
                            where: sc.action ?? undefined,
                            orderBy: { dueDate: 'asc' },
                            select: {
                                id: true, actionId: true, description: true, status: true, approvalState: true, dueDate: true, completedAt: true,
                                owner: { select: { firstName: true, lastName: true } },
                            },
                        },
                    },
                },
                regulations: { include: { article: { include: { regulation: true } } } },
            },
        });
        if (!control) throw new NotFoundException(`Control with ID ${id} not found`);
        const scopeYears = control.yearScopes.filter(s => s.status === 'ACTIVE').map(s => s.year);
        const currentYear = new Date().getFullYear();
        const now = new Date();
        // Test sorumlusu / 2. kontrolcü yalnız id olarak tutuluyor (ilişki yok) — adlar tek sorguda çözülür.
        const personIds = [...new Set((control.tests ?? []).flatMap(t => [t.assigneeId, t.secondControllerId]).filter((x): x is string => !!x))];
        const people = personIds.length
            ? await this.prisma.user.findMany({ where: { id: { in: personIds } }, select: { id: true, firstName: true, lastName: true } })
            : [];
        const person = new Map(people.map(p => [p.id, p]));
        const tests = (control.tests ?? []).map(t => ({
            ...t,
            assignee: t.assigneeId ? person.get(t.assigneeId) ?? null : null,
            secondController: t.secondControllerId ? person.get(t.secondControllerId) ?? null : null,
            ...projectTestStatus(t.status, t.plannedDate, now),
        }));
        // Bu kontrolün testlerine "mevcut bulgu" olarak bağlanmış, BAŞKA kontrole ait bulgular (iki yönlü ilişki).
        const ownFindingIds = new Set((control.findings ?? []).map(f => f.id));
        const links = await this.prisma.controlTestFindingLink.findMany({
            where: {
                controlTest: { controlId: id, deletedAt: null },
                ...(sc.finding ? { finding: sc.finding } : {}),
            },
            orderBy: { linkedAt: 'asc' },
            select: {
                controlTest: { select: { id: true, testNo: true } },
                finding: {
                    select: {
                        id: true, findingId: true, summary: true, severity: true, workflowStatus: true, resolutionStatus: true,
                        control: { select: { id: true, controlId: true, name: true } },
                    },
                },
            },
        });
        const linkedMap = new Map<string, { finding: (typeof links)[number]['finding']; tests: Array<{ id: string; testNo: string }> }>();
        for (const l of links) {
            if (ownFindingIds.has(l.finding.id)) continue;
            const e = linkedMap.get(l.finding.id) ?? { finding: l.finding, tests: [] };
            e.tests.push(l.controlTest);
            linkedMap.set(l.finding.id, e);
        }
        const linkedFindings = [...linkedMap.values()].map(e => ({ ...e.finding, viaTests: e.tests }));
        return { ...control, tests, linkedFindings, scopeYears, ...projectControlStatus(scopeYears.includes(currentYear), currentYear) };
    }

    /**
     * Kontrolün değişiklik geçmişi (denetim izinden): ana kayıt, yıllık kapsamlar ve risk eşleştirmeleri.
     * Güncellemelerde yalnız iş açısından anlamlı alanların farkı döner (ham JSON dökülmez).
     */
    async getHistory(id: string) {
        const control = await this.prisma.control.findUnique({ where: { id }, select: { id: true, yearScopes: { select: { id: true, year: true } } } });
        if (!control) throw new NotFoundException('Kontrol bulunamadı');
        const scopeYear = new Map(control.yearScopes.map(s => [s.id, s.year]));
        const logs = await this.prisma.auditLog.findMany({
            where: {
                OR: [
                    { entityType: 'Control', entityId: id },
                    { entityType: 'ControlRiskMapping', entityId: id },
                    ...(scopeYear.size ? [{ entityType: 'ControlYearScope', entityId: { in: [...scopeYear.keys()] } }] : []),
                ],
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
            select: {
                id: true, action: true, entityType: true, entityId: true, oldValue: true, newValue: true, createdAt: true,
                user: { select: { firstName: true, lastName: true } },
            },
        });
        return logs.map(l => ({
            id: l.id,
            action: l.action,
            entityType: l.entityType,
            year: l.entityType === 'ControlYearScope' ? scopeYear.get(l.entityId) ?? null : null,
            at: l.createdAt,
            by: l.user ? `${l.user.firstName} ${l.user.lastName}` : null,
            changes: l.action === 'UPDATE' && l.entityType === 'Control' ? diffControlFields(l.oldValue, l.newValue) : [],
            detail: l.entityType === 'ControlRiskMapping' ? historyRiskDetail(l.newValue ?? l.oldValue) : historyReason(l.newValue),
        }));
    }

    async create(data: any, userId: string) {
        // ownerId/testPerformerId/reviewerId/secondControllerId ana kontrolde
        // artık yazılabilir DEĞİL (bkz. plan D5/D6) — DTO'da zaten yoklar, ama
        // servis katmanında da savunmacı biçimde ...rest'e sızmaları engellenir.
        const { months, status, isActive, ownerId: _ownerId, testPerformerId: _tp, reviewerId: _rv, secondControllerId: _sc, ...rest } = data;
        let controlStatus: 'ACTIVE' | 'PASSIVE' = 'ACTIVE';
        if (isActive === false || status === 'PASSIVE') controlStatus = 'PASSIVE';

        // directorateId FK doğrulaması — Prisma FK 500 yerine okunur 400
        let directorateName: string | null = null;
        if (data.directorateId) {
            const dirExists = await this.prisma.directorate.findUnique({
                where: { id: data.directorateId }, select: { id: true, name: true },
            });
            if (!dirExists) throw new BadRequestException('Geçersiz direktörlük: seçilen direktörlük bulunamadı');
            // Eski serbest metin `directorate` alanı FK'den türetilir (onu okuyan liste/rapor/bulgu formu boş kalmasın).
            directorateName = dirExists.name;
        }

        const controlId = data.controlId || await generateControlCode(this.prisma);

        if (data.controlId) {
            const existingControl = await this.prisma.control.findUnique({
                where: { controlId },
                select: { id: true },
            });
            if (existingControl) throw this.duplicateControlCode(controlId);
        }

        let control: any;
        try {
            // Kayıt + denetim kaydı tek işlemde (kayıt yazılıp denetim izi kaybolamaz).
            control = await this.prisma.$transaction(async (tx) => {
              const created = await tx.control.create({
                data: {
                    ...rest,
                    controlId,
                    name: data.name || controlId,
                    description: data.description || '',
                    type: data.type || 'BT',
                    nature: data.nature || 'PREVENTIVE',
                    automation: data.automation || 'MANUAL',
                    frequency: data.frequency || 'MONTHLY',
                    selectedMonths: months || [],
                    status: controlStatus,
                    ownerId: userId, // kaydı oluşturan — artık "atanan kontrolcü" değil, DTO'dan kabul edilmez
                    directorateId: data.directorateId || null,
                    ...(directorateName ? { directorate: directorateName } : {}),
                },
                include: {
                    owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                    directorateRel: { select: { id: true, name: true, code: true } },
                },
              });
              await tx.auditLog.create({
                data: { userId, action: 'CREATE', entityType: 'Control', entityId: created.id, newValue: created },
              });
              return created;
            });
        } catch (error) {
            // Ön kontrol kullanıcıya erken ve açık geri bildirim sağlar; bu yakalama
            // ise aynı kodla eşzamanlı iki isteğin yarışma durumunu güvenle kapatır.
            if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
                const target = 'meta' in error && error.meta && typeof error.meta === 'object' && 'target' in error.meta
                    ? error.meta.target
                    : undefined;
                const fields = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
                if (fields.length === 0 || fields.includes('controlId')) {
                    throw this.duplicateControlCode(controlId);
                }
            }
            throw error;
        }

        // Not: Task üretimi artık burada tetiklenmiyor. Kontrol kalıcı ana envanterdir;
        // tasklar yalnızca bir yılın kapsamına alındığında (ControlScopeService.addScope)
        // üretilir (bkz. plan §3).

        return control;
    }

    async update(id: string, data: any, userId: string) {
        const existing = await this.findOne(id);

        let controlStatus: 'ACTIVE' | 'PASSIVE' | undefined;
        if (data.isActive !== undefined) {
            controlStatus = data.isActive ? 'ACTIVE' : 'PASSIVE';
        } else if (data.status !== undefined) {
            controlStatus = data.status === 'ACTIVE' ? 'ACTIVE' : 'PASSIVE';
        }

        // directorateId doğrulaması: FK 500 yerine 400
        let directorateName: string | null = null;
        if (data.directorateId) {
            const dirExists = await this.prisma.directorate.findUnique({
                where: { id: data.directorateId },
                select: { id: true, name: true },
            });
            if (!dirExists) {
                throw new BadRequestException('Geçersiz direktörlük: seçilen direktörlük bulunamadı');
            }
            directorateName = dirExists.name;
        }

        // Whitelist: yalnızca Control şemasında olan alanlar
        const updateData: any = {};
        const ALLOWED = ['controlId', 'name', 'description', 'type', 'nature', 'automation', 'frequency',
            'controlPeriod', 'controlDate', 'mehaz', 'testSteps', 'notes', 'gmy'];
        for (const key of ALLOWED) {
            if (data[key] !== undefined) updateData[key] = data[key];
        }

        // ownerId/testPerformerId/reviewerId/secondControllerId ARTIK BU YOLDAN
        // YAZILAMAZ (bkz. plan D5/D6) — LEGACY, yalnızca geriye dönük okuma için
        // tutulur. Yıl bazlı test kontrolcü ataması için bkz. ControlYearScope
        // (control-scope.service.ts::addScope/changePeriodicity).
        if (data.contactPersonId) updateData.contactPersonId = data.contactPersonId;
        else if (data.contactPersonId === null) updateData.contactPersonId = null;

        // Özel alanlar
        if (data.months !== undefined) updateData.selectedMonths = data.months;
        if (data.selectedMonths !== undefined) updateData.selectedMonths = data.selectedMonths;
        if (controlStatus !== undefined) updateData.status = controlStatus;
        if (data.directorateId !== undefined) updateData.directorateId = data.directorateId || null;
        // Eski serbest metin `directorate` FK ile senkron tutulur.
        if (directorateName) updateData.directorate = directorateName;

        // Kontrol SÜRÜMÜ — yalnızca tanım/test adımları/mehaz/ad GERÇEKTEN
        // değiştiyse artar (madde 17). Bu, uygulanmış Dönem Kontrollerinin
        // "kaynak kontrolde yeni sürüm var" göstergesinin dayanağıdır — geçmiş
        // dönemler sessizce değişmez, yalnızca açık "Yeni sürümü uygula"
        // işlemiyle (control-scope.service.ts::applyNewVersion) güncellenir.
        const VERSION_FIELDS = ['name', 'description', 'testSteps', 'mehaz'] as const;
        const definitionChanged = VERSION_FIELDS.some(f => updateData[f] !== undefined && updateData[f] !== (existing as any)[f]);
        if (definitionChanged) updateData.version = { increment: 1 };

        return this.prisma.$transaction(async (tx) => {
            const control = await tx.control.update({
                where: { id },
                data: updateData,
                include: {
                    owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                    directorateRel: { select: { id: true, name: true, code: true } },
                },
            });

            await tx.auditLog.create({
                data: { userId, action: 'UPDATE', entityType: 'Control', entityId: id, oldValue: existing, newValue: control },
            });

            return control;
        });
    }

    private async assertControlExists(id: string) {
        const c = await this.prisma.control.findUnique({ where: { id }, select: { id: true, status: true } });
        if (!c) throw new NotFoundException('Kontrol bulunamadı');
        return c;
    }

    async activate(id: string, userId: string) {
        const current = await this.assertControlExists(id);
        if (current.status === 'ACTIVE') throw new BadRequestException('Kontrol zaten aktif');
        return this.prisma.$transaction(async (tx) => {
            const control = await tx.control.update({
                where: { id },
                data: { status: 'ACTIVE' },
            });
            await tx.auditLog.create({
                data: { userId, action: 'ACTIVATE', entityType: 'Control', entityId: id },
            });
            return control;
        });
    }

    async passivate(id: string, userId: string) {
        const current = await this.assertControlExists(id);
        if (current.status === 'PASSIVE') throw new BadRequestException('Kontrol zaten pasif');
        return this.prisma.$transaction(async (tx) => {
            const control = await tx.control.update({
                where: { id },
                data: { status: 'PASSIVE' },
            });
            await tx.auditLog.create({
                data: { userId, action: 'PASSIVATE', entityType: 'Control', entityId: id },
            });
            return control;
        });
    }

    // Risk eşleştirme: FK doğrulaması + kayıt ve denetim izi aynı işlemde (önceden denetimsizdi).
    // Denetim kaydı entityId = kontrol id, böylece kontrolün değişiklik geçmişinde görünür.
    async mapRisk(controlId: string, riskId: string, mappingType = 'PRIMARY', userId?: string) {
        await this.assertControlExists(controlId);
        const risk = await this.prisma.risk.findUnique({ where: { id: riskId }, select: { id: true, riskId: true, name: true } });
        if (!risk) throw new BadRequestException('Geçersiz risk: seçilen risk bulunamadı');
        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.controlRiskMapping.findUnique({ where: { controlId_riskId: { controlId, riskId } }, select: { mappingType: true } });
            const mapping = await tx.controlRiskMapping.upsert({
                where: { controlId_riskId: { controlId, riskId } },
                update: { mappingType },
                create: { controlId, riskId, mappingType },
                include: { control: true, risk: true },
            });
            await tx.auditLog.create({
                data: {
                    userId: userId ?? null, action: existing ? 'UPDATE_RISK_MAPPING' : 'MAP_RISK', entityType: 'ControlRiskMapping', entityId: controlId,
                    oldValue: existing ? { riskId: risk.id, riskCode: risk.riskId, riskName: risk.name, mappingType: existing.mappingType } : undefined,
                    newValue: { riskId: risk.id, riskCode: risk.riskId, riskName: risk.name, mappingType },
                },
            });
            return mapping;
        });
    }

    async unmapRisk(controlId: string, riskId: string, userId?: string) {
        await this.assertControlExists(controlId);
        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.controlRiskMapping.findUnique({
                where: { controlId_riskId: { controlId, riskId } },
                select: { mappingType: true, risk: { select: { id: true, riskId: true, name: true } } },
            });
            const res = await tx.controlRiskMapping.deleteMany({ where: { controlId, riskId } });
            if (existing) {
                await tx.auditLog.create({
                    data: {
                        userId: userId ?? null, action: 'UNMAP_RISK', entityType: 'ControlRiskMapping', entityId: controlId,
                        oldValue: { riskId: existing.risk.id, riskCode: existing.risk.riskId, riskName: existing.risk.name, mappingType: existing.mappingType },
                    },
                });
            }
            return res;
        });
    }

    // Kalıcı silme kaldırıldı: Control ana envanterdir, hard-delete API'den ve
    // servis katmanından tamamen çıkarıldı (bkz. plan "KONTROL ENVANTERİ").
    // Yerine: passivate() (ACTIVE→PASSIVE) kullanılır — geçmiş yıl kapsamları,
    // taskları ve değerlendirmeleri etkilenmez.

    async getRelations(id: string, sc: RelatedScopes = {}) {
        const control = await this.prisma.control.findUnique({
            where: { id },
            include: { owner: { select: { id: true, firstName: true, lastName: true } } },
        });
        if (!control) throw new NotFoundException(`Control ${id} not found`);

        const riskMappings = await this.prisma.controlRiskMapping.findMany({
            where: sc.risk ? { controlId: id, risk: sc.risk } : { controlId: id },
            include: { risk: { select: { id: true, riskId: true, name: true, status: true, residualRiskScore: true } } },
        });

        const findings = await this.prisma.finding.findMany({
            where: sc.finding ? { AND: [{ controlId: id }, sc.finding] } : { controlId: id },
            select: { id: true, findingId: true, description: true, status: true, severity: true },
        });

        const actions = await this.prisma.action.findMany({
            where: sc.action
                ? { AND: [{ findingId: { in: findings.map(f => f.id) } }, sc.action] }
                : { findingId: { in: findings.map(f => f.id) } },
            select: { id: true, actionId: true, description: true, status: true, dueDate: true },
        });

        return {
            control: { id: control.id, controlId: control.controlId, name: control.name, effectivenessStatus: control.effectivenessStatus, owner: control.owner },
            risks: riskMappings.map(m => m.risk),
            findings,
            actions,
        };
    }

    // ─── ControlTest CRUD ─────────────────────────────────────────────────────

    async getAllTests(query: any, currentUserId?: string, testScope?: Prisma.ControlTestWhereInput | null) {
        const {
            status, controlId, directorateId, assigneeId, assigneeIds, secondControllerIds, findingStatus, sortBy, sortOrder,
            year, month, period, frequency, overdue, includeOutOfScope, search,
        } = query;
        const { page, limit, skip } = parsePaging(query, 50);

        const where: any = { deletedAt: null }; // yönetici onayıyla silinmiş testler listelenmez (kayıt korunur)
        if (status) where.status = status;
        if (controlId) where.controlId = controlId;
        if (directorateId) where.directorateId = directorateId;
        const personAnd = [personFieldWhere('assigneeId', assigneeIds || assigneeId, currentUserId), personFieldWhere('secondControllerId', secondControllerIds, currentUserId)].filter(Boolean);
        if (personAnd.length) where.AND = personAnd;
        if (findingStatus) where.findingStatus = findingStatus;
        if (year && year !== 'all') where.year = parseInt(year, 10);
        if (month) {
            const filterYear = year && year !== 'all' ? parseInt(year, 10) : new Date().getFullYear();
            const filterMonth = parseInt(month, 10);
            where.plannedDate = { gte: new Date(filterYear, filterMonth - 1, 1), lt: new Date(filterYear, filterMonth, 1) };
        }
        if (search) where.AND = [...(where.AND || []), { OR: [
            { testNo: { contains: search, mode: 'insensitive' } },
            { summary: { contains: search, mode: 'insensitive' } },
            { control: { controlId: { contains: search, mode: 'insensitive' } } },
            { control: { name: { contains: search, mode: 'insensitive' } } },
            { directorate: { name: { contains: search, mode: 'insensitive' } } },
        ] }];
        // Sütun süzgeçleri sunucuda uygulanır: istemci yalnız açık sayfayı süzerse diğer sayfalardaki
        // kayıtlar "bulunamadı" görünür. Girdi 200 karakterle sınırlanır (CLAUDE.md: contains + insensitive).
        const col = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null);
        const testNoQ = col(query.testNo), controlNameQ = col(query.controlName), directorateQ = col(query.directorateName);
        if (testNoQ) where.AND = [...(where.AND || []), { testNo: { contains: testNoQ, mode: 'insensitive' } }];
        if (controlNameQ) where.AND = [...(where.AND || []), { OR: [
            { control: { name: { contains: controlNameQ, mode: 'insensitive' } } },
            { control: { controlId: { contains: controlNameQ, mode: 'insensitive' } } },
        ] }];
        if (directorateQ) where.AND = [...(where.AND || []), { directorate: { name: { contains: directorateQ, mode: 'insensitive' } } }];
        if (period) where.periodKey = period;
        if (frequency) {
            where.OR = [
                { scope: { frequency } },
                { scopeId: null, control: { frequency } },
            ];
        }
        // Varsayılan: iptal/kapsam-dışı kayıtlar listeye dahil edilmez — ayrı bir
        // filtreyle (includeOutOfScope=true) açıkça istenmedikçe.
        if (includeOutOfScope !== 'true' && !status) {
            where.status = { notIn: ['IPTAL', 'KAPSAM_DISI'] };
        }
        if (overdue === 'true') {
            // Gecikme kuralı tek kaynaktan (metric-definitions.ts); `status` süzgeciyle birlikte AND ile kesişir.
            where.AND = [...(where.AND || []), overdueTestWhere()];
        }
        if (testScope) where.AND = [...(where.AND || []), testScope];

        const [tests, total, overdueCount] = await Promise.all([
            this.prisma.controlTest.findMany({
                where,
                include: {
                    control: { select: { id: true, controlId: true, name: true, type: true, frequency: true, gmy: true } },
                    directorate: { select: { id: true, name: true, code: true } },
                    findings: { select: { id: true, findingId: true, severity: true, resolutionStatus: true } },
                    attachments: true,
                },
                skip,
                take: limit,
                orderBy: safeOrderBy(sortBy, sortOrder, Prisma.ControlTestScalarFieldEnum, 'plannedDate', 'asc'),
            }),
            this.prisma.controlTest.count({ where }),
            // KPI "Gecikmiş": mevcut süzgeçler altında TÜM sonuçtaki gecikmiş sayısı (yalnız açık sayfa değil).
            this.prisma.controlTest.count({ where: { AND: [where, overdueTestWhere()] } }),
        ]);

        const now = new Date();
        return {
            data: tests.map(t => ({ ...t, ...projectTestStatus(t.status, t.plannedDate, now) })),
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
            summary: { overdueCount },
        };
    }

    async getTests(controlId: string, sc: RelatedScopes = {}) {
        const now = new Date();
        const tests = await this.prisma.controlTest.findMany({
            where: sc.test ? { AND: [{ controlId, deletedAt: null }, sc.test] } : { controlId, deletedAt: null },
            include: {
                findings: { where: sc.finding ?? undefined, select: { id: true, findingId: true, severity: true, resolutionStatus: true } },
                directorate: { select: { id: true, name: true } },
                attachments: true,
            },
            orderBy: { plannedDate: 'desc' },
        });
        return tests.map(t => ({ ...t, ...projectTestStatus(t.status, t.plannedDate, now) }));
    }

    /** Kontrol Testi çalışma sayfası için tekil, tam detaylı test kaydı (Bölüm A + B). */
    async getTestById(testId: string, sc: RelatedScopes = {}) {
        const test = await this.prisma.controlTest.findUnique({
            where: { id: testId },
            include: {
                control: {
                    include: {
                        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                        directorateRel: { select: { id: true, name: true, code: true, gmy: true } },
                        risks: { where: sc.risk ? { risk: sc.risk } : undefined, include: { risk: { select: { id: true, riskId: true, name: true, category: { select: { name: true } } } } } },
                        regulations: { include: { article: { select: { id: true, articleCode: true, title: true, regulation: { select: { id: true, code: true, name: true } } } } } },
                        sourceMappings: { include: { version: { select: { id: true, versionLabel: true, source: { select: { id: true, title: true } } } } } },
                    },
                },
                directorate: { select: { id: true, name: true, code: true } },
                findings: { where: sc.finding ?? undefined, select: { id: true, findingId: true, severity: true, resolutionStatus: true, summary: true, status: true } },
                referencedFinding: { select: { id: true, findingId: true, status: true, summary: true } },
                attachments: { orderBy: { createdAt: 'desc' } },
                // Dönem Kontrolü çapraz bağlantısı için (madde 16) — "Dönem Kontrolü: 2027.BTK.0042".
                scope: { select: { id: true, code: true, year: true } },
            },
        });
        if (!test) throw new NotFoundException(`Test ${testId} bulunamadı`);

        const assignee = test.assigneeId
            ? await this.prisma.user.findUnique({ where: { id: test.assigneeId }, select: { id: true, firstName: true, lastName: true, email: true } })
            : null;
        const secondController = test.secondControllerId
            ? await this.prisma.user.findUnique({ where: { id: test.secondControllerId }, select: { id: true, firstName: true, lastName: true, email: true } })
            : null;
        const uploaderIds = [...new Set(test.attachments.map(a => a.uploadedBy).filter((x): x is string => !!x))];
        const uploaders = uploaderIds.length
            ? await this.prisma.user.findMany({ where: { id: { in: uploaderIds } }, select: { id: true, firstName: true, lastName: true } })
            : [];
        const uploaderMap = new Map(uploaders.map(u => [u.id, u]));

        return {
            ...test,
            ...projectTestStatus(test.status, test.plannedDate),
            assignee,
            secondController,
            attachments: test.attachments.map(a => ({ ...a, uploader: a.uploadedBy ? uploaderMap.get(a.uploadedBy) || null : null })),
        };
    }

    /**
     * Maker/checker: testin ikinci kontrolcüsü testi yürütemez (başlatma, taslak, tamamlama).
     * Onaylayıcı maker içeriğini değiştirirse onay bağımsızlığını yitirir.
     */
    private assertNotChecker(test: { secondControllerId: string | null }, userId: string) {
        if (test.secondControllerId && test.secondControllerId === userId) {
            throw new ForbiddenException('Bu testin ikinci kontrolcüsü testi yürütemez veya içeriğini değiştiremez.');
        }
    }

    /**
     * Taslak kaydetme (durum değiştirmez) — iyimser eşzamanlılık kontrolü ile.
     * dto.contentVersion sunucudaki güncel değerle eşleşmezse ConflictException (409):
     * çağıran taraf sessizce üzerine yazmak yerine kullanıcıya açıkça sormalı.
     */
    async saveDraft(testId: string, dto: any, userId: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test ${testId} bulunamadı`);
        // Onay bekleyen (TAMAMLANDI) testin içeriği dondurulur: değişiklik yalnız geri gönderimle.
        if (!['BEKLIYOR', 'DEVAM_EDIYOR', 'GERI_GONDERILDI'].includes(test.status)) {
            throw new ConflictException(`Bu statüdeki (${test.status}) bir testte taslak kaydedilemez.`);
        }
        this.assertNotChecker(test, userId);
        if (typeof dto.contentVersion !== 'number' || dto.contentVersion !== test.contentVersion) {
            throw new ConflictException({
                message: 'Bu test başka bir oturumda güncellendi. Sayfayı yenileyip devam edin.',
                currentVersion: test.contentVersion,
            });
        }

        const data: any = { contentVersion: { increment: 1 } };
        if (dto.resultText !== undefined) data.resultText = dto.resultText;
        if (dto.evidenceSummary !== undefined) data.evidenceSummary = dto.evidenceSummary;
        if (dto.findingStatus !== undefined) data.findingStatus = dto.findingStatus;
        if (dto.stepObservations !== undefined) data.stepObservations = dto.stepObservations;

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.controlTest.update({ where: { id: testId }, data });

            await tx.auditLog.create({
                data: { userId, action: 'SAVE_DRAFT', entityType: 'ControlTest', entityId: testId },
            });

            return updated;
        });
    }

    async createTest(controlId: string, data: CreateControlTestDto, userId: string) {
        const control = await this.prisma.control.findUnique({ where: { id: controlId }, select: { type: true, controlId: true } });
        if (!control) throw new NotFoundException('Kontrol bulunamadı');
        // Görev ayrılığı: testi yapan ile ikinci kontrolcü aynı kişi olamaz.
        if (data.assigneeId && data.secondControllerId && data.assigneeId === data.secondControllerId) {
            throw new BadRequestException('Test sorumlusu ile ikinci kontrolcü aynı kişi olamaz.');
        }
        for (const [field, id] of [['test sorumlusu', data.assigneeId], ['ikinci kontrolcü', data.secondControllerId]] as const) {
            if (!id) continue;
            const user = await this.prisma.user.findUnique({ where: { id }, select: { isActive: true } });
            if (!user || !user.isActive) throw new BadRequestException(`Geçersiz ${field}: kullanıcı bulunamadı veya pasif`);
        }
        if (data.directorateId) {
            const dir = await this.prisma.directorate.findUnique({ where: { id: data.directorateId }, select: { id: true } });
            if (!dir) throw new BadRequestException('Geçersiz birim: seçilen birim bulunamadı');
        }
        const plannedDate = data.plannedDate ? new Date(data.plannedDate) : new Date();
        // AD_HOC/manuel testler de aynı (kontrol,yıl) sayacından çeker — madde 13:
        // "plansız testler de bu kodu kullanacaksa aynı benzersiz sayaçtan yararlansın".
        const testNo = await nextTestCode(this.prisma, controlId, control.controlId, plannedDate.getFullYear());
        return this.prisma.$transaction(async (tx) => {
            const test = await tx.controlTest.create({
                data: {
                    testNo,
                    controlId,
                    plannedDate,
                    summary: data.summary || null,
                    description: data.description || null,
                    assigneeId: data.assigneeId || null,
                    secondControllerId: data.secondControllerId || null,
                    directorateId: data.directorateId || null,
                    sprint: data.sprint || null,
                    isAutoGenerated: false,
                    status: 'BEKLIYOR',
                },
            });

            await tx.auditLog.create({
                data: { userId, action: 'CREATE', entityType: 'ControlTest', entityId: test.id, newValue: test },
            });

            return test;
        });
    }

    // ─── ControlTest Kanıt Ekleri ─────────────────────────────────────────────
    async addControlTestAttachment(
        testId: string,
        meta: { uploadId: string; fileName: string; originalName: string; mimeType: string; sizeBytes: number; displayName?: string; description?: string },
        userId: string,
    ) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId }, select: { id: true, status: true } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);
        if (test.status === 'ONAYLANDI') {
            throw new BadRequestException('Onaylanmış testin kanıtları değiştirilemez. Önce SYSTEM_ADMIN final onayı iptal etmeli.');
        }

        return this.prisma.$transaction(async tx => {
            const ticket = await tx.uploadTicket.findFirst({ where: { id: meta.uploadId, uploadedById: userId, claimedAt: null, expiresAt: { gt: new Date() } } });
            if (!ticket || ticket.fileName !== meta.fileName || ticket.originalName !== meta.originalName || ticket.mimeType !== meta.mimeType || ticket.sizeBytes !== meta.sizeBytes) throw new BadRequestException('Yükleme kaydı geçersiz, süresi dolmuş veya bu kullanıcıya ait değil.');
            const claim = await tx.uploadTicket.updateMany({ where: { id: ticket.id, claimedAt: null }, data: { claimedAt: new Date() } });
            if (claim.count !== 1) throw new BadRequestException('Bu yükleme daha önce kullanılmış.');
            const att = await tx.controlTestAttachment.create({ data: {
                controlTestId: testId,
                fileName: meta.fileName,
                originalName: meta.originalName,
                displayName: (meta as any).displayName?.trim() || meta.originalName,
                description: (meta as any).description?.trim() || null,
                mimeType: meta.mimeType,
                sizeBytes: meta.sizeBytes,
                uploadedBy: userId,
            } });

            await tx.auditLog.create({ data: { userId, action: 'FILE_UPLOADED', entityType: 'ControlTestAttachment', entityId: att.id, newValue: { testId, originalName: meta.originalName } } });

            return att;
        });
    }

    async updateControlTestAttachment(testId: string, attachmentId: string, dto: { displayName?: string; description?: string }, userId: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId }, select: { status: true } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);
        if (test.status === 'ONAYLANDI') throw new BadRequestException('Onaylanmış testin kanıtları değiştirilemez.');
        const old = await this.prisma.controlTestAttachment.findFirst({ where: { id: attachmentId, controlTestId: testId } });
        if (!old) throw new NotFoundException('Ek bulunamadı');
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.controlTestAttachment.update({ where: { id: attachmentId }, data: {
                displayName: dto.displayName !== undefined ? (dto.displayName.trim() || old.originalName) : undefined,
                description: dto.description !== undefined ? (dto.description.trim() || null) : undefined,
            } });
            await tx.auditLog.create({ data: { userId, action: 'FILE_METADATA_UPDATED', entityType: 'ControlTestAttachment', entityId: attachmentId, oldValue: { displayName: old.displayName, description: old.description }, newValue: { displayName: updated.displayName, description: updated.description } } });
            return updated;
        });
    }

    async removeControlTestAttachment(testId: string, attachmentId: string, userId: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId }, select: { status: true } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);
        if (test.status === 'ONAYLANDI') {
            throw new BadRequestException('Onaylanmış testin kanıtları değiştirilemez. Önce SYSTEM_ADMIN final onayı iptal etmeli.');
        }

        const att = await this.prisma.controlTestAttachment.findFirst({
            where: { id: attachmentId, controlTestId: testId },
        });
        if (!att) throw new NotFoundException('Ek bulunamadı');

        return this.prisma.$transaction(async (tx) => {
            await tx.controlTestAttachment.delete({ where: { id: attachmentId } });
            await tx.auditLog.create({
                data: { userId, action: 'FILE_DELETED', entityType: 'ControlTestAttachment', entityId: attachmentId },
            });
            return { success: true };
        });
    }

    async startTest(testId: string, userId: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);
        if (test.status !== 'BEKLIYOR') throw new BadRequestException('Test başlatmak için BEKLIYOR statüsünde olmalı.');
        this.assertNotChecker(test, userId);

        // Durum koşulu UPDATE içinde + denetim kaydı aynı transaction'da (atomik, yarışa dayanıklı).
        return this.prisma.$transaction(async (tx) => {
            const res = await tx.controlTest.updateMany({ where: { id: testId, status: 'BEKLIYOR' }, data: { status: 'DEVAM_EDIYOR' } });
            if (res.count !== 1) throw new ConflictException('Test bu sırada başka bir işlemle değişti; başlatılmadı.');
            await logTransition(tx, { entityType: 'CONTROL_TEST', entityId: testId, action: 'START', from: 'BEKLIYOR', to: 'DEVAM_EDIYOR', userId, reason: null });
            await tx.auditLog.create({
                data: { userId, action: 'START_TEST', entityType: 'ControlTest', entityId: testId },
            });
            return tx.controlTest.findUniqueOrThrow({ where: { id: testId } });
        });
    }

    async getOpenFindingReferences(testId: string, findingScope?: Prisma.FindingWhereInput | null) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId }, select: { id: true, controlId: true, plannedDate: true } });
        if (!test) throw new NotFoundException(`Test ${testId} bulunamadı`);
        const findings = await this.prisma.finding.findMany({
            where: {
                AND: [
                    { OR: [{ controlId: test.controlId }, { controlTest: { controlId: test.controlId } }] },
                    { status: { not: 'CLOSED' }, workflowStatus: { not: 'IPTAL' }, resolutionStatus: { not: 'KAPATILDI' } },
                    ...(findingScope ? [findingScope] : []),
                ],
            },
            select: {
                id: true, findingId: true, summary: true, status: true, workflowStatus: true,
                resolutionStatus: true, createdAt: true,
                control: { select: { id: true, controlId: true, name: true } },
                controlTest: { select: { id: true, testNo: true, plannedDate: true, periodLabel: true, control: { select: { id: true, controlId: true, name: true } } } },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        });
        return findings.map(finding => ({
            ...finding,
            control: finding.control ?? finding.controlTest?.control ?? null,
            recommended: !!finding.controlTest?.plannedDate && finding.controlTest.plannedDate < test.plannedDate,
        })).sort((a, b) => Number(b.recommended) - Number(a.recommended));
    }

    // ─── Kontrol testi ↔ bulgu çoklu ilişkilendirme ─────────────────────────
    private findingLinkSelect = {
        id: true, findingId: true, summary: true, status: true, workflowStatus: true, resolutionStatus: true, severity: true,
        control: { select: { id: true, controlId: true, name: true } },
        controlTest: { select: { id: true, testNo: true, control: { select: { id: true, controlId: true, name: true } } } },
    } as const;

    private relationOf(f: { control?: { id: string } | null; controlTest?: { id: string; control: { id: string } } | null }, test: { id: string; controlId: string }): 'SAME_TEST' | 'SAME_CONTROL' | 'OTHER_CONTROL' {
        if (f.controlTest?.id === test.id) return 'SAME_TEST';
        if (f.control?.id === test.controlId || f.controlTest?.control.id === test.controlId) return 'SAME_CONTROL';
        return 'OTHER_CONTROL';
    }

    /** Bağlanabilecek bulgular: açık (kapanmamış/iptal edilmemiş), aynı veya başka kontrolden. Aynı kontrol önce. */
    async findingLinkCandidates(testId: string, search: string | undefined, findingScope?: Prisma.FindingWhereInput | null) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId }, select: { id: true, controlId: true } });
        if (!test) throw new NotFoundException('Test bulunamadı');
        const q = search?.trim().slice(0, 100);
        const rows = await this.prisma.finding.findMany({
            where: {
                AND: [
                    { workflowStatus: { not: 'IPTAL' }, resolutionStatus: { not: 'KAPATILDI' }, status: { not: 'CLOSED' } },
                    q ? { OR: [{ findingId: { contains: q, mode: 'insensitive' } }, { summary: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] } : {},
                    ...(findingScope ? [findingScope] : []),
                ],
            },
            select: this.findingLinkSelect, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 100,
        });
        const order = { SAME_TEST: 0, SAME_CONTROL: 1, OTHER_CONTROL: 2 } as const;
        return rows
            .map(f => ({ ...f, control: f.control ?? f.controlTest?.control ?? null, relation: this.relationOf(f, test) }))
            .sort((a, b) => order[a.relation] - order[b.relation]);
    }

    async getFindingLinks(testId: string, findingScope?: Prisma.FindingWhereInput | null) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId }, select: { id: true, controlId: true } });
        if (!test) throw new NotFoundException('Test bulunamadı');
        const links = await this.prisma.controlTestFindingLink.findMany({
            where: { controlTestId: testId, ...(findingScope ? { finding: findingScope } : {}) },
            include: { finding: { select: this.findingLinkSelect } }, orderBy: { linkedAt: 'asc' },
        });
        return links.map(l => ({ id: l.id, linkedAt: l.linkedAt, linkedById: l.linkedById, note: l.note, finding: { ...l.finding, control: l.finding.control ?? l.finding.controlTest?.control ?? null, relation: this.relationOf(l.finding, test) } }));
    }

    /** Bağlı bulgu kümesini değiştirir (çoklu). Yalnız yürütülmekte olan test; 2. kontrolcü değiştiremez. */
    async setFindingLinks(testId: string, findingIds: string[], userId: string, findingScope?: Prisma.FindingWhereInput | null) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test || test.deletedAt) throw new NotFoundException('Test bulunamadı');
        if (!['BEKLIYOR', 'DEVAM_EDIYOR', 'GERI_GONDERILDI'].includes(test.status)) {
            throw new ConflictException('Bulgu ilişkisi yalnız yürütülmekte olan testte değiştirilebilir (onaya gönderilmiş/onaylı test dondurulmuştur).');
        }
        this.assertNotChecker(test, userId);
        const ids = [...new Set(findingIds)];
        if (ids.length > 50) throw new BadRequestException('Bir teste en fazla 50 bulgu bağlanabilir.');
        if (ids.length) {
            const found = await this.prisma.finding.findMany({ where: { AND: [{ id: { in: ids } }, ...(findingScope ? [findingScope] : [])] }, select: { id: true, workflowStatus: true } });
            if (found.length !== ids.length) throw new BadRequestException('Geçersiz bulgu: seçilen bulgulardan biri bulunamadı veya erişiminiz yok.');
            if (found.some(f => f.workflowStatus === 'IPTAL')) throw new BadRequestException('İptal edilmiş bulgu ilişkilendirilemez.');
        }
        return this.prisma.$transaction(async (tx) => {
            const before = await tx.controlTestFindingLink.findMany({ where: { controlTestId: testId }, select: { findingId: true } });
            const prev = new Set(before.map(b => b.findingId));
            const removed = [...prev].filter(id => !ids.includes(id));
            const added = ids.filter(id => !prev.has(id));
            if (removed.length) await tx.controlTestFindingLink.deleteMany({ where: { controlTestId: testId, findingId: { in: removed } } });
            if (added.length) await tx.controlTestFindingLink.createMany({ data: added.map(findingId => ({ controlTestId: testId, findingId, linkedById: userId })) });
            await tx.auditLog.create({ data: { userId, action: 'TEST_FINDING_LINKS', entityType: 'ControlTest', entityId: testId, oldValue: { findingIds: [...prev] }, newValue: { findingIds: ids, added, removed } } });
            return { findingIds: ids, added, removed };
        });
    }

    async completeTest(testId: string, data: CompleteControlTestDto, userId: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);
        // İş kuralı: test yeniden başlatılmadan (DEVAM_EDIYOR) veya geri gönderilmiş
        // (GERI_GONDERILDI) haldeyken tamamlanıp onaya gönderilebilir.
        if (!['DEVAM_EDIYOR', 'GERI_GONDERILDI'].includes(test.status)) {
            throw new BadRequestException(`Test tamamlanmak için DEVAM_EDIYOR veya GERI_GONDERILDI statüsünde olmalı. Mevcut: ${test.status}`);
        }
        this.assertNotChecker(test, userId);

        // ── Madde 6: Açık bulguya referans ile ilerletme ────────────────────────
        if (data.referencedFindingId) {
            const ref = await this.prisma.finding.findUnique({ where: { id: data.referencedFindingId } });
            if (!ref) throw new BadRequestException('Referans verilen bulgu bulunamadı.');
            // Aynı kontrol zinciriyle ilişkili olmalı: doğrudan bu kontrole bağlı olsun
            // ya da bu kontrolün başka bir testine bağlı olsun.
            const relatedViaControl = ref.controlId === test.controlId;
            const relatedViaTest = ref.controlTestId
                ? (await this.prisma.controlTest.findUnique({ where: { id: ref.controlTestId }, select: { controlId: true } }))?.controlId === test.controlId
                : false;
            if (!relatedViaControl && !relatedViaTest) {
                throw new BadRequestException('Referans verilen bulgu bu kontrolle ilişkili değil.');
            }
            if (ref.status === 'CLOSED' || ref.workflowStatus === 'IPTAL' || ref.resolutionStatus === 'KAPATILDI') {
                throw new BadRequestException('Kapalı, sonuçlandırılmış veya iptal edilmiş bir bulguya referans verilemez.');
            }

            return this.prisma.$transaction(async (tx) => {
                const res = await tx.controlTest.updateMany({
                    where: { id: testId, status: { in: ['DEVAM_EDIYOR', 'GERI_GONDERILDI'] } },
                    data: {
                        status: 'TAMAMLANDI',
                        completedAt: new Date(),
                        findingStatus: 'BULGUSU_VAR',
                        referencedFindingId: ref.id,
                        referenceReason: data.referenceReason!.trim(),
                        resultText: data.resultText || `Devam eden açık bulgu (${ref.findingId}) referans alınarak ilerletildi.`,
                    },
                });
                if (res.count !== 1) throw new ConflictException('Test bu sırada başka bir işlemle değişti; tamamlanmadı.');
                await logTransition(tx, { entityType: 'CONTROL_TEST', entityId: testId, action: 'COMPLETE', from: testStage(test.status), to: 'TAMAMLANDI', userId, reason: null });
                await tx.auditLog.create({
                    data: { userId, action: 'REFERENCE_FINDING', entityType: 'ControlTest', entityId: testId, newValue: { referencedFindingId: ref.id, findingId: ref.findingId, referenceReason: data.referenceReason!.trim() } },
                });
                return tx.controlTest.findUniqueOrThrow({ where: { id: testId } });
            });
        }

        // İş kuralı: BULGUSU_VAR seçildiyse en az 1 bulgu kaydı olmalı
        const findingCount = await this.prisma.finding.count({ where: { controlTestId: testId } });
        if (data.findingStatus === 'BULGUSU_VAR' && findingCount === 0) {
            throw new BadRequestException(
                'BULGUSU_VAR seçilen test için en az bir bulgu kaydı oluşturulmalıdır.',
            );
        }
        if (data.findingStatus === 'BULGUSU_YOK' && findingCount > 0) {
            throw new BadRequestException(
                'Bu teste bağlı bulgu kayıtları var. Sonuç BULGUSU_YOK olamaz.',
            );
        }

        // Test tamamlandığında BULGUSU_VAR/YOK farketmeksizin doğrudan final onaylı
        // sayılmaz — TAMAMLANDI = 2. kontrolcü onayına gönderildi.
        return this.prisma.$transaction(async (tx) => {
            const res = await tx.controlTest.updateMany({
                where: { id: testId, status: { in: ['DEVAM_EDIYOR', 'GERI_GONDERILDI'] } },
                data: {
                    status: 'TAMAMLANDI',
                    completedAt: new Date(),
                    findingStatus: data.findingStatus || 'BULGUSU_YOK',
                    resultText: data.resultText || null,
                    evidenceSummary: data.evidenceSummary || null,
                    evidenceUrls: data.evidenceUrls || [],
                },
            });
            if (res.count !== 1) throw new ConflictException('Test bu sırada başka bir işlemle değişti; tamamlanmadı.');
            const updated = await tx.controlTest.findUniqueOrThrow({ where: { id: testId } });
            await logTransition(tx, { entityType: 'CONTROL_TEST', entityId: testId, action: 'COMPLETE', from: testStage(test.status), to: 'TAMAMLANDI', userId, reason: null });
            await tx.auditLog.create({
                data: { userId, action: 'COMPLETE_TEST', entityType: 'ControlTest', entityId: testId, newValue: updated },
            });
            return updated;
        });
    }

    async approveTest(testId: string, userId: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);
        if (test.status !== 'TAMAMLANDI') throw new BadRequestException('Onaylamak için test TAMAMLANDI statüsünde olmalı.');

        const approver = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: { select: { name: true } } } });
        const isAdmin = approver?.role?.name === 'SYSTEM_ADMIN';

        // İş kuralı: testi yapan kendi ikinci kontrol onayını veremez — maker/checker
        // ayrımı SYSTEM_ADMIN için de istisnasız uygulanır (kullanıcı talebinde "eğer iş
        // kuralı böyle değilse açıkça raporla" denmişti; en güvenli/tutarlı yorum budur).
        if (test.assigneeId === userId) {
            throw new BadRequestException('Testi yapan kullanıcı kendi ikinci kontrol onayını veremez.');
        }
        // İkinci kontrolcü atanmışsa yalnızca o kişi (veya admin) onaylayabilir.
        if (test.secondControllerId && test.secondControllerId !== userId && !isAdmin) {
            throw new BadRequestException('Bu test size atanmış bir onay değil.');
        }

        return this.prisma.$transaction(async (tx) => {
            const res = await tx.controlTest.updateMany({
                where: { id: testId, status: 'TAMAMLANDI' },
                data: { status: 'ONAYLANDI', approvedAt: new Date(), approvedById: userId },
            });
            if (res.count !== 1) throw new ConflictException('Test bu sırada başka bir işlemle değişti; onaylanmadı.');
            await this.recalculateControlTestSummary(test.controlId, tx);
            await logTransition(tx, { entityType: 'CONTROL_TEST', entityId: testId, action: 'APPROVE', from: 'TAMAMLANDI', to: 'ONAYLANDI', userId, reason: null });
            await tx.auditLog.create({
                data: { userId, action: 'APPROVE_TEST', entityType: 'ControlTest', entityId: testId },
            });
            return tx.controlTest.findUniqueOrThrow({ where: { id: testId } });
        });
    }

    async returnTest(testId: string, reason: string, userId: string) {
        if (!reason || !reason.trim()) {
            throw new BadRequestException('Geri gönderme gerekçesi zorunludur.');
        }
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);
        if (test.status !== 'TAMAMLANDI') throw new BadRequestException('Geri göndermek için test TAMAMLANDI (onay bekliyor) statüsünde olmalı.');

        const approver = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: { select: { name: true } } } });
        const isAdmin = approver?.role?.name === 'SYSTEM_ADMIN';
        if (test.secondControllerId && test.secondControllerId !== userId && !isAdmin) {
            throw new BadRequestException('Bu test size atanmış bir onay değil.');
        }

        return this.prisma.$transaction(async (tx) => {
            const res = await tx.controlTest.updateMany({
                where: { id: testId, status: 'TAMAMLANDI' },
                data: { status: 'GERI_GONDERILDI', rejectionReason: reason, returnedById: userId, returnedAt: new Date() },
            });
            if (res.count !== 1) throw new ConflictException('Test bu sırada başka bir işlemle değişti; geri gönderilmedi.');
            await logTransition(tx, { entityType: 'CONTROL_TEST', entityId: testId, action: 'RETURN', from: 'TAMAMLANDI', to: 'DEVAM_EDIYOR', userId, reason: reason });
            await tx.auditLog.create({
                data: { userId, action: 'RETURN_TEST', entityType: 'ControlTest', entityId: testId, newValue: { reason } },
            });
            return tx.controlTest.findUniqueOrThrow({ where: { id: testId } });
        });
    }

    /**
     * İş akışı: yetkili kullanıcı testi bir önceki aşamaya geri alır (gerekçe zorunlu).
     * Onaylandı → Tamamlandı (onay kaldırılır, kontrol özeti yeniden hesaplanır), Tamamlandı → Devam Ediyor,
     * Devam Ediyor → Bekliyor. Rol kısıtı WorkflowService'te uygulanır.
     */
    async revertTestStage(testId: string, reason: string, userId: string) {
        if (!reason?.trim()) throw new BadRequestException('Geri alma gerekçesi zorunludur.');
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test || test.deletedAt) throw new NotFoundException('Test bulunamadı');
        const plan: Record<string, { to: string; data: Record<string, unknown>; toStage: 'BEKLIYOR' | 'DEVAM_EDIYOR' | 'TAMAMLANDI' }> = {
            ONAYLANDI: { to: 'TAMAMLANDI', data: { approvedAt: null, approvedById: null }, toStage: 'TAMAMLANDI' },
            TAMAMLANDI: { to: 'DEVAM_EDIYOR', data: {}, toStage: 'DEVAM_EDIYOR' },
            GERI_GONDERILDI: { to: 'BEKLIYOR', data: {}, toStage: 'BEKLIYOR' },
            DEVAM_EDIYOR: { to: 'BEKLIYOR', data: {}, toStage: 'BEKLIYOR' },
        };
        const step = plan[test.status];
        if (!step) throw new BadRequestException('Bu aşamadaki test geri alınamaz.');
        return this.prisma.$transaction(async (tx) => {
            const res = await tx.controlTest.updateMany({ where: { id: testId, status: test.status }, data: { status: step.to as never, ...step.data } });
            if (res.count !== 1) throw new ConflictException('Test bu sırada başka bir işlemle değişti.');
            if (test.status === 'ONAYLANDI') await this.recalculateControlTestSummary(test.controlId, tx);
            await logTransition(tx, { entityType: 'CONTROL_TEST', entityId: testId, action: 'REVERT', from: testStage(test.status), to: step.toStage, userId, reason });
            await tx.auditLog.create({ data: { userId, action: 'REVERT_TEST_STAGE', entityType: 'ControlTest', entityId: testId, oldValue: { status: test.status }, newValue: { status: step.to, reason } } });
            return tx.controlTest.findUniqueOrThrow({ where: { id: testId } });
        });
    }

    /** İş akışı: onaylanmamış testi gerekçeyle iptal eder (onaylı test için cancelFinalApproval). */
    async cancelTest(testId: string, reason: string, userId: string) {
        if (!reason?.trim()) throw new BadRequestException('İptal gerekçesi zorunludur.');
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test || test.deletedAt) throw new NotFoundException('Test bulunamadı');
        if (test.status === 'ONAYLANDI') return this.cancelFinalApproval(testId, reason, userId);
        if (!['BEKLIYOR', 'DEVAM_EDIYOR', 'GERI_GONDERILDI', 'TAMAMLANDI'].includes(test.status)) {
            throw new BadRequestException('Bu test zaten iptal edilmiş veya kapsam dışı.');
        }
        return this.prisma.$transaction(async (tx) => {
            const res = await tx.controlTest.updateMany({
                where: { id: testId, status: test.status },
                data: { status: 'IPTAL', cancelledAt: new Date(), cancelledById: userId, cancelReason: reason.trim() },
            });
            if (res.count !== 1) throw new ConflictException('Test bu sırada başka bir işlemle değişti.');
            await logTransition(tx, { entityType: 'CONTROL_TEST', entityId: testId, action: 'CANCEL', from: testStage(test.status), to: 'IPTAL', userId, reason });
            await tx.auditLog.create({ data: { userId, action: 'CANCEL_TEST', entityType: 'ControlTest', entityId: testId, oldValue: { status: test.status }, newValue: { reason } } });
            return tx.controlTest.findUniqueOrThrow({ where: { id: testId } });
        });
    }

    /** Final (ONAYLANDI) bir testi iptal eder — yalnızca SYSTEM_ADMIN çağırabilir (RBAC controller'da). */
    async cancelFinalApproval(testId: string, reason: string, userId: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);
        if (test.status !== 'ONAYLANDI') {
            throw new BadRequestException('Yalnızca final onaylanmış (ONAYLANDI) testler iptal edilebilir.');
        }

        return this.prisma.$transaction(async (tx) => {
            const res = await tx.controlTest.updateMany({
                where: { id: testId, status: 'ONAYLANDI' },
                data: { status: 'IPTAL', cancelledAt: new Date(), cancelledById: userId, cancelReason: reason || null },
            });
            if (res.count !== 1) throw new ConflictException('Test bu sırada başka bir işlemle değişti; iptal edilmedi.');
            await this.recalculateControlTestSummary(test.controlId, tx);
            await logTransition(tx, { entityType: 'CONTROL_TEST', entityId: testId, action: 'CANCEL', from: 'ONAYLANDI', to: 'IPTAL', userId, reason: reason });
            await tx.auditLog.create({
                data: { userId, action: 'CANCEL_FINAL_APPROVAL', entityType: 'ControlTest', entityId: testId, newValue: { reason } },
            });
            return tx.controlTest.findUniqueOrThrow({ where: { id: testId } });
        });
    }

    /** Kontrol özeti, onaylama sırasına değil tamamlanma tarihine göre en yeni
     * onaylı teste dayanır. Final onay iptalinde bir önceki onaylı teste döner. */
    /** Silme onayı gibi dış akışlar için (aynı işlem istemcisiyle). */
    recalculateControlSummaryPublic(controlId: string, db: Prisma.TransactionClient) {
        return this.recalculateControlTestSummary(controlId, db);
    }

    private async recalculateControlTestSummary(controlId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
        const latestApproved = await db.controlTest.findFirst({
            where: { controlId, status: 'ONAYLANDI' },
            orderBy: [{ completedAt: 'desc' }, { approvedAt: 'desc' }],
            select: { findingStatus: true, completedAt: true, approvedAt: true },
        });
        const effectivenessMap: Record<string, 'EFFECTIVE' | 'INEFFECTIVE' | 'PARTIALLY_EFFECTIVE'> = {
            BULGUSU_YOK: 'EFFECTIVE',
            BULGUSU_VAR: 'INEFFECTIVE',
        };
        const effectiveness = latestApproved?.findingStatus
            ? (effectivenessMap[latestApproved.findingStatus] || 'NOT_TESTED')
            : 'NOT_TESTED';
        await db.control.update({
            where: { id: controlId },
            data: {
                lastTestDate: latestApproved?.completedAt || latestApproved?.approvedAt || null,
                lastTestResult: latestApproved ? effectiveness as any : null,
                effectivenessStatus: effectiveness as any,
            },
        });
    }

    // ─── Merkezi Onay Sayfası ──────────────────────────────────────────────────

    async getMyPendingApprovals(userId: string, query: any) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: { select: { name: true } } } });
        const isAdmin = user?.role?.name === 'SYSTEM_ADMIN';

        const where: any = {
            status: 'TAMAMLANDI',
            OR: [
                { secondControllerId: userId },
                ...(isAdmin ? [{ secondControllerId: null }] : []),
            ],
        };
        if (query.directorateId) where.directorateId = query.directorateId;
        if (query.dateFrom || query.dateTo) {
            where.completedAt = {};
            if (query.dateFrom) where.completedAt.gte = new Date(query.dateFrom);
            if (query.dateTo) where.completedAt.lte = new Date(query.dateTo);
        }

        const tests = await this.prisma.controlTest.findMany({
            where,
            include: {
                control: { select: { id: true, controlId: true, name: true, type: true } },
                directorate: { select: { id: true, name: true } },
                findings: { select: { id: true, findingId: true, severity: true } },
                attachments: true,
            },
            orderBy: { completedAt: 'asc' },
        });

        return {
            data: tests.map(t => ({ ...t, type: 'CONTROL_TEST' as const })),
        };
    }

    async getApprovalDetail(testId: string) {
        const test = await this.prisma.controlTest.findUnique({
            where: { id: testId },
            include: {
                control: { select: { id: true, controlId: true, name: true, type: true, gmy: true } },
                directorate: { select: { id: true, name: true, code: true } },
                findings: { select: { id: true, findingId: true, severity: true, resolutionStatus: true, summary: true } },
                referencedFinding: { select: { id: true, findingId: true, status: true, summary: true } },
                attachments: true,
            },
        });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);

        const submittedBy = test.assigneeId
            ? await this.prisma.user.findUnique({ where: { id: test.assigneeId }, select: { id: true, firstName: true, lastName: true, email: true } })
            : null;

        return { ...test, type: 'CONTROL_TEST' as const, submittedBy, submittedAt: test.completedAt };
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────
    // getLastBusinessDay / getFridaysInYear / TURKISH_MONTH_INDEX artık
    // control-period.util.ts'ten import ediliyor (yıllık kapsam motoru ile ortak).

    // Not: Eski tek-seferlik "generateTestsForControl" (yıl kavramı olmayan,
    // idempotent olmayan) kaldırıldı. Task üretimi artık ControlScopeService'te
    // yıllık kapsam bazlı, eşzamanlılığa dayanıklı motor ile yapılıyor
    // (bkz. control-scope.service.ts, control-period.util.ts).
}

export interface RelatedScopes {
    test?: Prisma.ControlTestWhereInput | null;
    finding?: Prisma.FindingWhereInput | null;
    action?: Prisma.ActionWhereInput | null;
    risk?: Prisma.RiskWhereInput | null;
}

// ─── Değişiklik geçmişi yardımcıları ─────────────────────────────────────────

/** Geçmişte farkı gösterilen kontrol alanları ve Türkçe adları (sıra = görüntü sırası). */
const CONTROL_HISTORY_FIELDS: Array<[string, string]> = [
    ['controlId', 'Kontrol kodu'], ['name', 'Kontrol adı'], ['description', 'Tanım'], ['mehaz', 'Mehaz'],
    ['testSteps', 'Test adımları'], ['frequency', 'Sıklık'], ['selectedMonths', 'Seçili aylar'], ['type', 'Tür'],
    ['nature', 'Nitelik'], ['automation', 'Otomasyon'], ['directorate', 'Direktörlük'], ['directorateId', 'Direktörlük (kayıt)'],
    ['gmy', 'GMY'], ['notes', 'Notlar'], ['controlPeriod', 'Dönem'], ['controlDate', 'Kontrol tarihi'], ['status', 'Envanter durumu'],
];
const HISTORY_TEXT_MAX = 300;

const historyValue = (v: unknown): string | null => {
    if (v === null || v === undefined || v === '') return null;
    const s = Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return s.length > HISTORY_TEXT_MAX ? `${s.slice(0, HISTORY_TEXT_MAX)}…` : s;
};

export function diffControlFields(oldValue: unknown, newValue: unknown): Array<{ field: string; label: string; from: string | null; to: string | null }> {
    if (!oldValue || !newValue || typeof oldValue !== 'object' || typeof newValue !== 'object') return [];
    const o = oldValue as Record<string, unknown>;
    const n = newValue as Record<string, unknown>;
    const out: Array<{ field: string; label: string; from: string | null; to: string | null }> = [];
    for (const [field, label] of CONTROL_HISTORY_FIELDS) {
        const from = historyValue(o[field]);
        const to = historyValue(n[field]);
        if (from !== to) out.push({ field, label, from, to });
    }
    return out;
}

function historyRiskDetail(v: unknown): string | null {
    if (!v || typeof v !== 'object') return null;
    const r = v as Record<string, unknown>;
    return [r.riskCode, r.riskName].filter(Boolean).join(' · ') || null;
}

function historyReason(v: unknown): string | null {
    if (!v || typeof v !== 'object') return null;
    const r = (v as Record<string, unknown>).reason ?? (v as Record<string, unknown>).removalReason;
    return typeof r === 'string' && r.trim() ? r.trim() : null;
}
