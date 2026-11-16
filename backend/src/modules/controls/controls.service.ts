import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { getLastBusinessDay, getFridaysInYear, TURKISH_MONTH_INDEX } from './control-period.util';
import { generateControlCode } from './control-code.util';
import { nextTestCode } from './test-code.util';
import { projectControlStatus } from '../../common/workflow/workflow-projection';
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
                    owner: { select: { id: true, firstName: true, lastName: true, email: true, department: true } },
                    directorateRel: { select: { id: true, name: true, code: true } },
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
        const data = controls.map((c: any) => {
            const scopeYears = c.yearScopes.map((s: any) => s.year);
            return { ...c, scopeYears, ...projectControlStatus(scopeYears.includes(currentYear), currentYear) };
        });

        return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
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
                        _count: { select: { tasks: true } },
                    },
                },
                tests: {
                    where: sc.test ?? undefined,
                    orderBy: { plannedDate: 'asc' },
                    include: {
                        findings: { where: sc.finding ?? undefined, select: { id: true, findingId: true, severity: true, resolutionStatus: true } },
                    },
                },
                findings: {
                    where: sc.finding ?? undefined,
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    include: {
                        actions: { where: sc.action ?? undefined, include: { owner: { select: { firstName: true, lastName: true } } } },
                    },
                },
                regulations: { include: { article: { include: { regulation: true } } } },
            },
        });
        if (!control) throw new NotFoundException(`Control with ID ${id} not found`);
        const scopeYears = control.yearScopes.filter(s => s.status === 'ACTIVE').map(s => s.year);
        const currentYear = new Date().getFullYear();
        return { ...control, scopeYears, ...projectControlStatus(scopeYears.includes(currentYear), currentYear) };
    }

    async create(data: any, userId: string) {
        // ownerId/testPerformerId/reviewerId/secondControllerId ana kontrolde
        // artık yazılabilir DEĞİL (bkz. plan D5/D6) — DTO'da zaten yoklar, ama
        // servis katmanında da savunmacı biçimde ...rest'e sızmaları engellenir.
        const { months, status, isActive, ownerId: _ownerId, testPerformerId: _tp, reviewerId: _rv, secondControllerId: _sc, ...rest } = data;
        let controlStatus: 'ACTIVE' | 'PASSIVE' = 'ACTIVE';
        if (isActive === false || status === 'PASSIVE') controlStatus = 'PASSIVE';

        // directorateId FK doğrulaması — Prisma FK 500 yerine okunur 400
        if (data.directorateId) {
            const dirExists = await this.prisma.directorate.findUnique({
                where: { id: data.directorateId }, select: { id: true },
            });
            if (!dirExists) throw new BadRequestException('Geçersiz direktörlük: seçilen direktörlük bulunamadı');
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
            control = await this.prisma.control.create({
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
                },
                include: {
                    owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                    directorateRel: { select: { id: true, name: true, code: true } },
                },
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

        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'Control', entityId: control.id, newValue: control },
        });

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
        if (data.directorateId) {
            const dirExists = await this.prisma.directorate.findUnique({
                where: { id: data.directorateId },
                select: { id: true },
            });
            if (!dirExists) {
                throw new BadRequestException('Geçersiz direktörlük: seçilen direktörlük bulunamadı');
            }
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

        // Kontrol SÜRÜMÜ — yalnızca tanım/test adımları/mehaz/ad GERÇEKTEN
        // değiştiyse artar (madde 17). Bu, uygulanmış Dönem Kontrollerinin
        // "kaynak kontrolde yeni sürüm var" göstergesinin dayanağıdır — geçmiş
        // dönemler sessizce değişmez, yalnızca açık "Yeni sürümü uygula"
        // işlemiyle (control-scope.service.ts::applyNewVersion) güncellenir.
        const VERSION_FIELDS = ['name', 'description', 'testSteps', 'mehaz'] as const;
        const definitionChanged = VERSION_FIELDS.some(f => updateData[f] !== undefined && updateData[f] !== (existing as any)[f]);
        if (definitionChanged) updateData.version = { increment: 1 };

        const control = await this.prisma.control.update({
            where: { id },
            data: updateData,
            include: {
                owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                directorateRel: { select: { id: true, name: true, code: true } },
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'Control', entityId: id, oldValue: existing, newValue: control },
        });

        return control;
    }

    async activate(id: string, userId: string) {
        const control = await this.prisma.control.update({
            where: { id },
            data: { status: 'ACTIVE' },
        });
        await this.prisma.auditLog.create({
            data: { userId, action: 'ACTIVATE', entityType: 'Control', entityId: id },
        });
        return control;
    }

    async passivate(id: string, userId: string) {
        const control = await this.prisma.control.update({
            where: { id },
            data: { status: 'PASSIVE' },
        });
        await this.prisma.auditLog.create({
            data: { userId, action: 'PASSIVATE', entityType: 'Control', entityId: id },
        });
        return control;
    }

    async mapRisk(controlId: string, riskId: string, mappingType = 'PRIMARY') {
        return this.prisma.controlRiskMapping.upsert({
            where: { controlId_riskId: { controlId, riskId } },
            update: { mappingType },
            create: { controlId, riskId, mappingType },
            include: { control: true, risk: true },
        });
    }

    async unmapRisk(controlId: string, riskId: string) {
        return this.prisma.controlRiskMapping.deleteMany({ where: { controlId, riskId } });
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

        const where: any = {};
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
            where.status = { in: ['BEKLIYOR', 'DEVAM_EDIYOR', 'GERI_GONDERILDI'] };
            where.plannedDate = { lt: new Date() };
        }
        if (testScope) where.AND = [...(where.AND || []), testScope];

        const [tests, total] = await Promise.all([
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
        ]);

        return { data: tests, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async getTests(controlId: string, sc: RelatedScopes = {}) {
        return this.prisma.controlTest.findMany({
            where: sc.test ? { AND: [{ controlId }, sc.test] } : { controlId },
            include: {
                findings: { where: sc.finding ?? undefined, select: { id: true, findingId: true, severity: true, resolutionStatus: true } },
                directorate: { select: { id: true, name: true } },
                attachments: true,
            },
            orderBy: { plannedDate: 'desc' },
        });
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

        const updated = await this.prisma.controlTest.update({ where: { id: testId }, data });

        await this.prisma.auditLog.create({
            data: { userId, action: 'SAVE_DRAFT', entityType: 'ControlTest', entityId: testId },
        });

        return updated;
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
        const test = await this.prisma.controlTest.create({
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

        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'ControlTest', entityId: test.id, newValue: test },
        });

        return test;
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
        const updated = await this.prisma.controlTestAttachment.update({ where: { id: attachmentId }, data: {
            displayName: dto.displayName !== undefined ? (dto.displayName.trim() || old.originalName) : undefined,
            description: dto.description !== undefined ? (dto.description.trim() || null) : undefined,
        } });
        await this.prisma.auditLog.create({ data: { userId, action: 'FILE_METADATA_UPDATED', entityType: 'ControlTestAttachment', entityId: attachmentId, oldValue: { displayName: old.displayName, description: old.description }, newValue: { displayName: updated.displayName, description: updated.description } } });
        return updated;
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

        await this.prisma.controlTestAttachment.delete({ where: { id: attachmentId } });
        await this.prisma.auditLog.create({
            data: { userId, action: 'FILE_DELETED', entityType: 'ControlTestAttachment', entityId: attachmentId },
        });
        return { success: true };
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
            await tx.auditLog.create({
                data: { userId, action: 'RETURN_TEST', entityType: 'ControlTest', entityId: testId, newValue: { reason } },
            });
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
            await tx.auditLog.create({
                data: { userId, action: 'CANCEL_FINAL_APPROVAL', entityType: 'ControlTest', entityId: testId, newValue: { reason } },
            });
            return tx.controlTest.findUniqueOrThrow({ where: { id: testId } });
        });
    }

    /** Kontrol özeti, onaylama sırasına değil tamamlanma tarihine göre en yeni
     * onaylı teste dayanır. Final onay iptalinde bir önceki onaylı teste döner. */
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
