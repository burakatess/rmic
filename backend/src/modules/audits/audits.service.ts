import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { nextFindingNo, nextActionNo, nextFollowUpNo } from '../../common/util/sequential-id';
import { projectActionStatus, projectFindingStatus, projectFollowUpStatus } from '../../common/workflow/workflow-projection';
import { personFieldWhere } from '../../common/util/person-filter';
import { matchesPermission } from '../../common/util/permission-match';
import { parsePaging, safeOrderBy } from '../../common/util/list-query';

// Takip değerlendirmesini onaylayabilecek roller (ikinci kontrolcü) — mutabakat
// onayıyla aynı yetki seviyesi (bkz. audits.controller.ts::mutabakatOnayla).
const FOLLOWUP_APPROVER_ROLES = new Set(['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER']);
// Takip değerlendirmesini (maker) yazabilecek roller — PUT follow-up route guard'ıyla aynı küme.
const FOLLOWUP_EVALUATOR_ROLES = new Set(['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR']);
const normalizeRole = (r?: string): string =>
    ({ ADMIN: 'SYSTEM_ADMIN', RISK_MANAGER: 'RISK_CONTROL_MANAGER' }[r ?? ''] ?? r ?? '');
const isFutureIstanbulDate = (value: string): boolean => {
    const day = value.slice(0, 10);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(new Date(`${day}T00:00:00+03:00`).getTime()) && day > today;
};

// Prisma client VEYA transaction client — yardımcı metotlar ikisini de kabul eder
// (onay zinciri tek transaction içinde aynı tx istemcisini kullanır, Madde 1).
type PrismaLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuditsService {
    constructor(private prisma: PrismaService) { }

    // ─── Audit Plans ─────────────────────────────────────────────────────────

    async findAllPlans(query: any) {
        const { year, status } = query;
        const { page, limit, skip } = parsePaging(query, 20);
        const where: any = {};
        if (year) where.year = year;
        if (status) where.status = status;

        const [plans, total] = await Promise.all([
            this.prisma.auditPlan.findMany({
                where,
                include: {
                    _count: { select: { executions: true } },
                    executions: {
                        select: {
                            findings: {
                                select: {
                                    id: true,
                                    status: true,
                                    actions: { select: { status: true } },
                                },
                            },
                        },
                    },
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.auditPlan.count({ where }),
        ]);

        const data = plans.map((p) => this.withPlanDerivedFields(p));

        return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async findPlanById(id: string) {
        const plan = await this.prisma.auditPlan.findUnique({
            where: { id },
            include: {
                _count: { select: { executions: true } },
                executions: {
                    include: {
                        _count: { select: { findings: true } },
                        findings: {
                            select: {
                                id: true,
                                status: true,
                                actions: { select: { status: true } },
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });
        if (!plan) throw new NotFoundException(`Denetim planı bulunamadı: ${id}`);
        return this.withPlanDerivedFields(plan, true);
    }

    /** Bulgu/aksiyon sayıları executions ilişkisinden türetilir — planda ayrıca saklanmaz. */
    private withPlanDerivedFields(plan: any, includeExecutions = false) {
        const findings = (plan.executions || []).flatMap((e: any) => e.findings || []);
        const totalFindings = findings.length;
        const openFindings = findings.filter((f: any) => f.status !== 'CLOSED').length;
        const actions = findings.flatMap((f: any) => f.actions || []);
        let actionStatus: 'NO_ACTIONS' | 'IN_PROGRESS' | 'COMPLETED' = 'NO_ACTIONS';
        if (actions.length > 0) {
            actionStatus = actions.every((a: any) => a.status === 'KAPATILDI' || a.status === 'CLOSED')
                ? 'COMPLETED'
                : 'IN_PROGRESS';
        }
        const { executions, ...rest } = plan;
        const executionsSummary = includeExecutions
            ? (executions || []).map((e: any) => ({
                id: e.id, executionId: e.executionId, startDate: e.startDate, endDate: e.endDate,
                auditor: e.auditor, status: e.status, progress: e.progress, workpapers: e.workpapers,
                findingsCount: e._count?.findings ?? 0,
            }))
            : undefined;
        return { ...rest, totalFindings, openFindings, actionStatus, ...(includeExecutions ? { executions: executionsSummary } : {}) };
    }

    async createPlan(data: any, userId: string) {
        const auditCode = `AP-${data.year}-${(await this.nextPlanSequence(data.year)).toString().padStart(3, '0')}`;
        const { auditCode: _ignored, ...rest } = data;
        const plan = await this.prisma.auditPlan.create({ data: { ...rest, planId: auditCode } });
        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'AuditPlan', entityId: plan.id, newValue: plan },
        });
        return plan;
    }

    private async nextPlanSequence(year: number): Promise<number> {
        const prefix = `AP-${year}-`;
        const last = await this.prisma.auditPlan.findFirst({
            where: { planId: { startsWith: prefix } },
            orderBy: { planId: 'desc' },
        });
        if (!last) return 1;
        const n = parseInt(last.planId.split('-')[2], 10);
        return isNaN(n) ? 1 : n + 1;
    }

    async updatePlan(id: string, data: any, userId: string) {
        const { auditCode, totalFindings, openFindings, actionStatus, ...rest } = data;
        const plan = await this.prisma.auditPlan.update({ where: { id }, data: rest });
        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'AuditPlan', entityId: id, newValue: plan },
        });
        return plan;
    }

    // ─── Audit Executions ────────────────────────────────────────────────────

    async findAllExecutions(query: any) {
        const { status, auditPlanId } = query;
        const { page, limit, skip } = parsePaging(query, 50);
        const where: any = {};
        if (status) where.status = status;
        if (auditPlanId) where.auditPlanId = auditPlanId;

        const [executions, total] = await Promise.all([
            this.prisma.auditExecution.findMany({
                where,
                include: {
                    auditPlan: { select: { id: true, planId: true, name: true } },
                    _count: { select: { findings: true } },
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.auditExecution.count({ where }),
        ]);

        return { data: executions, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    private async nextExecutionSequence(year: number): Promise<number> {
        const prefix = `AE-${year}-`;
        const last = await this.prisma.auditExecution.findFirst({
            where: { executionId: { startsWith: prefix } },
            orderBy: { executionId: 'desc' },
        });
        if (!last?.executionId) return 1;
        const n = parseInt(last.executionId.split('-')[2], 10);
        return isNaN(n) ? 1 : n + 1;
    }

    async createExecution(data: any, userId: string) {
        const year = new Date(data.startDate || Date.now()).getFullYear();
        const executionId = `AE-${year}-${(await this.nextExecutionSequence(year)).toString().padStart(3, '0')}`;
        const execution = await this.prisma.auditExecution.create({ data: { ...data, executionId } });
        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'AuditExecution', entityId: execution.id, newValue: execution },
        });
        return execution;
    }

    async updateExecution(id: string, data: any, userId: string) {
        const { executionId, ...rest } = data;
        const execution = await this.prisma.auditExecution.update({ where: { id }, data: rest });
        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'AuditExecution', entityId: id, newValue: execution },
        });
        return execution;
    }

    // ─── Findings ────────────────────────────────────────────────────────────

    async findAllFindings(query: any, currentUserId?: string, scope?: Prisma.FindingWhereInput | null) {
        const { search, riskId, controlId, severity, status, findingType, auditPlanId, sortBy, sortOrder, assigneeIds, workflowStatus, resolutionStatus, delayStatus, thisMonth } = query;
        const { page, limit, skip } = parsePaging(query, 50);
        const where: any = {};

        if (search) {
            where.OR = [
                { description: { contains: search, mode: 'insensitive' } },
                { findingId: { contains: search, mode: 'insensitive' } },
                { summary: { contains: search, mode: 'insensitive' } },
                { relatedDepartment: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (riskId) where.riskId = riskId;
        if (controlId) where.controlId = controlId;
        if (severity) where.severity = severity;
        if (status) where.status = status;
        if (findingType) where.findingType = findingType;
        if (workflowStatus) where.workflowStatus = workflowStatus;
        if (resolutionStatus) where.resolutionStatus = resolutionStatus;
        const now = new Date();
        if (thisMonth === 'true') where.targetResolutionDate = { gte: new Date(now.getFullYear(), now.getMonth(), 1), lt: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
        if (delayStatus === 'OVERDUE') where.targetResolutionDate = { lt: now };
        if (delayStatus === 'APPROACHING') where.targetResolutionDate = { gte: now, lte: new Date(now.getTime() + 14 * 86400000) };
        if (delayStatus === 'ON_TIME') where.targetResolutionDate = { gt: new Date(now.getTime() + 14 * 86400000) };
        if (auditPlanId) where.auditExecution = { auditPlanId };
        const assigneeFilter = personFieldWhere('assigneeId', assigneeIds, currentUserId);
        if (assigneeFilter) where.AND = [...(where.AND || []), assigneeFilter];
        // Kayıt kapsamı (AccessScopeService) — filtrelerle birlikte AND'lenir; sayaç da aynı kapsamı kullanır.
        if (scope) where.AND = [...(where.AND || []), scope];

        const [findings, total] = await Promise.all([
            this.prisma.finding.findMany({
                where,
                include: {
                    risk: { select: { id: true, riskId: true, name: true } },
                    control: { select: { id: true, controlId: true, name: true, directorate: true, frequency: true, status: true } },
                    linkedRisks: { select: { id: true, riskId: true, name: true, residualRiskScore: true, owner: { select: { id: true, firstName: true, lastName: true } } } },
                    _count: { select: { actions: true, followUps: true } },
                },
                skip,
                take: limit,
                orderBy: safeOrderBy(sortBy, sortOrder, Prisma.FindingScalarFieldEnum, 'createdAt', 'desc'),
            }),
            this.prisma.finding.count({ where }),
        ]);

        const data = findings.map(f => ({
            ...f,
            ...projectFindingStatus(f.workflowStatus, f.resolutionStatus, Array.from({ length: f._count.actions }, () => ({ status: 'UNKNOWN' }))),
        }));
        return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async createFinding(data: any, userId: string) {
        const {
            risk, control, riskId, controlId, testRecordId, controlTestId, directorateId,
            source, affectedSystem, recommendation, managementResponse,
            targetResolutionDate, closedDate, relatedDepartment, responsiblePerson,
            findingType, summary, gmy, internalControlAssessment, currentStatusDetail,
            testDate, attachment, sendEmail, birimCevabi, assigneeId, actions,
            iletisimKisisi, workflowStatus, resolutionStatus, firstControllerId, secondControllerId,
            ...rest
        } = data;
        // controlTestId doğrulaması (varsa)
        const resolvedTestId = controlTestId || testRecordId || null;
        if (resolvedTestId) {
            const testExists = await this.prisma.controlTest.findUnique({
                where: { id: resolvedTestId }, select: { id: true },
            });
            if (!testExists) throw new BadRequestException('Geçersiz kontrol testi kaydı');
        }

        // riskId / controlId / assigneeId / directorateId FK doğrulaması — Prisma FK 500 yerine okunur 400
        if (riskId) {
            const riskExists = await this.prisma.risk.findUnique({ where: { id: riskId }, select: { id: true } });
            if (!riskExists) throw new BadRequestException('Geçersiz risk: seçilen risk bulunamadı');
        }
        if (controlId) {
            const controlExists = await this.prisma.control.findUnique({ where: { id: controlId }, select: { id: true } });
            if (!controlExists) throw new BadRequestException('Geçersiz kontrol: seçilen kontrol bulunamadı');
        }
        if (assigneeId) {
            const assigneeExists = await this.prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true } });
            if (!assigneeExists) throw new BadRequestException('Geçersiz kullanıcı: seçilen sorumlu bulunamadı');
        }
        // Kontrolcü zinciri: kontrol noktası (dönem kontrolü → kontrol testi) → bulgu. Bulguyu oluşturan
        // değiştirebilir; seçilmezse kontrol testinin kontrolcüleri kullanılır.
        const ctControllers = resolvedTestId
            ? await this.prisma.controlTest.findUnique({ where: { id: resolvedTestId }, select: { assigneeId: true, secondControllerId: true } })
            : null;
        const controllers = await this.resolveControllerPair(
            { first: firstControllerId, second: secondControllerId },
            { first: ctControllers?.assigneeId ?? assigneeId ?? null, second: ctControllers?.secondControllerId ?? null },
            this.prisma,
        );
        let resolvedRelatedDepartment = relatedDepartment || null;
        if (directorateId) {
            const dir = await this.prisma.directorate.findUnique({ where: { id: directorateId }, select: { id: true, name: true } });
            if (!dir) throw new BadRequestException('Geçersiz direktörlük: seçilen direktörlük bulunamadı');
            // relatedDepartment (legacy serbest metin) direktörlük adından türetilir — FK esastır (Madde 3).
            resolvedRelatedDepartment = dir.name;
        }
        if (actions && Array.isArray(actions)) {
            for (const act of actions) {
                if (act.ownerId) {
                    const ownerExists = await this.prisma.user.findUnique({ where: { id: act.ownerId }, select: { id: true } });
                    if (!ownerExists) throw new BadRequestException('Geçersiz kullanıcı: aksiyon sorumlusu bulunamadı');
                }
            }
        }

        const findingData: any = {
            ...rest,
            impact: (rest.impact && String(rest.impact).trim()) || 'Kontrol testi veya iç denetim sırasında sapma tespit edilmiştir.',
            controlTestId: resolvedTestId,
            directorateId: directorateId || null,
            source: source || 'INTERNAL_AUDIT',
            affectedSystem: affectedSystem || null,
            recommendation: recommendation || null,
            managementResponse: managementResponse || null,
            birimCevabi: birimCevabi || null,
            // targetResolutionDate İSTEMCİDEN yazılmaz — aksiyonlar eklendikten sonra
            // recalculateFindingTargetDate() ile hesaplanır (Madde 4).
            targetResolutionDate: null,
            closedDate: closedDate ? new Date(closedDate) : null,
            relatedDepartment: resolvedRelatedDepartment,
            responsiblePerson: responsiblePerson || null,
            riskId: riskId || null,
            controlId: controlId || null,

            findingType: findingType || null,
            summary: summary || null,
            gmy: gmy || null,
            internalControlAssessment: internalControlAssessment || null,
            currentStatusDetail: currentStatusDetail || null,
            testDate: testDate ? new Date(testDate) : null,
            sendEmail: sendEmail === true || sendEmail === 'true',
            assigneeId: assigneeId || null,
            firstControllerId: controllers.first,
            secondControllerId: controllers.second,
            iletisimKisisi: iletisimKisisi || null,
            workflowStatus: workflowStatus || 'TASLAK',
            resolutionStatus: resolutionStatus || 'DEVAM_EDIYOR',
        };

        // Auto-set closedDate when resolution is KAPATILDI
        if (findingData.resolutionStatus === 'KAPATILDI' && !findingData.closedDate) {
            findingData.closedDate = new Date();
        }
        // Legacy compat
        if (findingData.status === 'CLOSED' && !findingData.closedDate) {
            findingData.closedDate = new Date();
        }

        // İlk tespit yılı testDate'ten, yoksa sunucu zamanından alınır. Sayaç artışı
        // tek SQL deyimidir; eşzamanlı istekler aynı numarayı alamaz.
        const findingId = await nextFindingNo(this.prisma, findingData.testDate || new Date());

        const finding = await this.prisma.finding.create({
            // createdById yalnız oturumdan yazılır (DTO'da yok → istemci belirleyemez).
            data: { ...findingData, findingId, createdById: userId },
            include: {
                risk: { select: { id: true, riskId: true, name: true } },
                control: { select: { id: true, controlId: true, name: true } },
                linkedRisks: { select: { id: true, riskId: true, name: true } },

                _count: { select: { actions: true, followUps: true } },
            },
        });

        // Create actions through the shared domain path so inline finding actions
        // receive the same automatic follow-up, target-date and audit behaviour as
        // actions created later from the action screens.
        if (actions && Array.isArray(actions) && actions.length > 0) {
            for (const act of actions) {
                const createdAction = await this.createAction(finding.id, act, userId, this.prisma);

                // Aksiyona yüklenen dosya eklerini bağla
                if (Array.isArray(act.attachments) && act.attachments.length > 0) {
                    for (const attachment of act.attachments.filter((a: any) => a?.uploadId)) {
                        await this.addActionAttachment(finding.id, createdAction.id, attachment, userId);
                    }
                }
            }
        }

        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'Finding', entityId: finding.id, newValue: finding },
        });

        return finding;
    }

    async updateFinding(id: string, data: any, userId: string) {
        const {
            risk, control, riskId, controlId, testRecordId, directorateId,
            source, affectedSystem, recommendation, managementResponse,
            targetResolutionDate, closedDate, relatedDepartment, responsiblePerson,
            findingType, summary, gmy, internalControlAssessment, currentStatusDetail,
            testDate, attachment, sendEmail, birimCevabi, assigneeId, firstControllerId, secondControllerId,
            iletisimKisisi, workflowStatus, resolutionStatus,
            ...rest
        } = data;

        // targetResolutionDate İSTEMCİDEN ASLA yazılmaz — tek otorite bağlı aksiyonların
        // dueDate'lerinden hesaplanan recalculateFindingTargetDate()'tir (Madde 4).
        void targetResolutionDate;

        // ── Durum geçişleri genel PUT'tan YAPILMAZ (Madde 3) ──────────────────
        // workflowStatus / resolutionStatus / closedDate: yalnızca korumalı ayrı
        // işlemlerden (workflow/* ve takip akışı) değişir. Genel PUT ile gelirlerse
        // sessizce yok saymak yerine açık hata ver — "uyumluluk için mevcut değeri
        // tekrar gönderme" ile gerçek geçiş girişimi ayırt edilemeyeceğinden reddet.
        if (workflowStatus !== undefined) {
            throw new BadRequestException(
                'workflowStatus genel güncellemeden değiştirilemez — /findings/:id/workflow/* işlemlerini kullanın',
            );
        }
        if (resolutionStatus !== undefined) {
            throw new BadRequestException(
                'resolutionStatus genel güncellemeden değiştirilemez — takip (follow-up) değerlendirmesinden güncellenir',
            );
        }
        if (closedDate !== undefined) {
            throw new BadRequestException('closedDate sunucu tarafından üretilir — istemciden yazılamaz');
        }
        // status: yalnızca ara statüler (SELECTABLE_STATUSES: IN_PROGRESS,
        // PARTIALLY_CLOSED). CLOSED kapanış korumalı işlemden geçer.
        if (rest.status === 'CLOSED' || rest.status === 'VERIFIED') {
            throw new BadRequestException(
                'Bulgu kapanışı genel güncellemeden yapılamaz — POST /findings/:id/workflow/kapat kullanın',
            );
        }

        let resolvedRelatedDepartment = relatedDepartment !== undefined ? (relatedDepartment || null) : undefined;
        if (directorateId) {
            const dir = await this.prisma.directorate.findUnique({ where: { id: directorateId }, select: { id: true, name: true } });
            if (!dir) throw new BadRequestException('Geçersiz direktörlük: seçilen direktörlük bulunamadı');
            // relatedDepartment (legacy serbest metin) direktörlük adından türetilir — FK esastır.
            resolvedRelatedDepartment = dir.name;
        }

        const findingData: any = {
            ...rest,
            source: source || undefined,
            affectedSystem: affectedSystem !== undefined ? (affectedSystem || null) : undefined,
            recommendation: recommendation !== undefined ? (recommendation || null) : undefined,
            managementResponse: managementResponse !== undefined ? (managementResponse || null) : undefined,
            birimCevabi: birimCevabi !== undefined ? (birimCevabi || null) : undefined,
            relatedDepartment: resolvedRelatedDepartment,
            directorateId: directorateId !== undefined ? (directorateId || null) : undefined,
            responsiblePerson: responsiblePerson !== undefined ? (responsiblePerson || null) : undefined,
            riskId: riskId !== undefined ? (riskId || null) : undefined,
            controlId: controlId !== undefined ? (controlId || null) : undefined,

            findingType: findingType !== undefined ? (findingType || null) : undefined,
            summary: summary !== undefined ? (summary || null) : undefined,
            gmy: gmy !== undefined ? (gmy || null) : undefined,
            internalControlAssessment: internalControlAssessment !== undefined ? (internalControlAssessment || null) : undefined,
            currentStatusDetail: currentStatusDetail !== undefined ? (currentStatusDetail || null) : undefined,
            testDate: testDate !== undefined ? (testDate ? new Date(testDate) : null) : undefined,
            sendEmail: sendEmail !== undefined ? (sendEmail === true || sendEmail === 'true') : undefined,
            assigneeId: assigneeId !== undefined ? (assigneeId || null) : undefined,
            iletisimKisisi: iletisimKisisi !== undefined ? (iletisimKisisi || null) : undefined,
        };

        // controlId / riskId / assigneeId doğrulaması: Prisma FK 500 yerine okunur 400
        if (findingData.controlId) {
            const controlExists = await this.prisma.control.findUnique({
                where: { id: findingData.controlId },
                select: { id: true },
            });
            if (!controlExists) {
                throw new BadRequestException('Geçersiz kontrol: seçilen kontrol bulunamadı');
            }
        }
        if (findingData.riskId) {
            const riskExists = await this.prisma.risk.findUnique({ where: { id: findingData.riskId }, select: { id: true } });
            if (!riskExists) throw new BadRequestException('Geçersiz risk: seçilen risk bulunamadı');
        }
        if (findingData.assigneeId) {
            const assigneeExists = await this.prisma.user.findUnique({ where: { id: findingData.assigneeId }, select: { id: true } });
            if (!assigneeExists) throw new BadRequestException('Geçersiz kullanıcı: seçilen sorumlu bulunamadı');
        }

        if (firstControllerId !== undefined || secondControllerId !== undefined) {
            const current = await this.prisma.finding.findUnique({ where: { id }, select: { firstControllerId: true, secondControllerId: true } });
            const pair = await this.resolveControllerPair(
                { first: firstControllerId !== undefined ? (firstControllerId || null) : current?.firstControllerId ?? null,
                  second: secondControllerId !== undefined ? (secondControllerId || null) : current?.secondControllerId ?? null },
                { first: null, second: null }, this.prisma, true,
            );
            findingData.firstControllerId = pair.first;
            findingData.secondControllerId = pair.second;
        }
        const finding = await this.prisma.finding.update({
            where: { id },
            data: findingData,
            include: {
                risk: { select: { id: true, riskId: true, name: true } },
                control: { select: { id: true, controlId: true, name: true } },
                linkedRisks: { select: { id: true, riskId: true, name: true } },
                
                _count: { select: { actions: true, followUps: true } },
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'Finding', entityId: id, newValue: finding },
        });

        return finding;
    }

    async getFinding(id: string) {
        const finding = await this.prisma.finding.findUnique({
            where: { id },
            include: {
                risk: true,
                control: true,
                controlTest: { select: { id: true, testNo: true, periodLabel: true, plannedDate: true } },
                referencingTests: { select: { id: true, testNo: true, periodLabel: true, plannedDate: true, status: true, referenceReason: true }, orderBy: [{ plannedDate: 'asc' }, { id: 'asc' }] },
                linkedRisks: {
                    select: {
                        id: true, riskId: true, name: true, status: true,
                        residualRiskScore: true, inherentRiskScore: true,
                        owner: { select: { id: true, firstName: true, lastName: true } },
                    }
                },
                firstController: { select: { id: true, firstName: true, lastName: true } },
                secondController: { select: { id: true, firstName: true, lastName: true } },
                actions: {
                    include: {
                        owner: { select: { id: true, firstName: true, lastName: true } },
                        firstController: { select: { id: true, firstName: true, lastName: true } },
                        secondController: { select: { id: true, firstName: true, lastName: true } },
                        attachments: { orderBy: { createdAt: 'desc' } },
                    },
                    orderBy: { createdAt: 'desc' },
                },
                followUps: {
                    include: {
                        attachments: { orderBy: { createdAt: 'desc' } },
                    },
                    orderBy: { createdAt: 'desc' },
                },
                attachments: { orderBy: { createdAt: 'desc' } },
                statusLogs: { orderBy: { entryDate: 'desc' } },
                auditExecution: true,
                _count: { select: { actions: true, followUps: true, linkedRisks: true, attachments: true } },
            },
        });
        if (!finding) throw new NotFoundException(`Finding with ID ${id} not found`);
        const currentStatusSummary = await this.buildFindingCurrentStatusSummary(finding);
        return {
            ...finding,
            currentStatusSummary,
            ...projectFindingStatus(finding.workflowStatus, finding.resolutionStatus, finding.actions),
            actions: finding.actions.map(action => ({ ...action, ...projectActionStatus(action.status, action.dueDate) })),
            followUps: finding.followUps.map(followUp => ({ ...followUp, ...projectFollowUpStatus(followUp.status, followUp.approvalStatus) })),
        };
    }

    private async buildFindingCurrentStatusSummary(finding: any) {
        const approved = finding.followUps
            .filter((item: any) => item.approvalStatus === 'ONAYLANDI' || item.status === 'ONAYLANDI')
            .sort((a: any, b: any) => {
                const aTime = new Date(a.approvedAt ?? a.evaluatedAt ?? 0).getTime();
                const bTime = new Date(b.approvedAt ?? b.evaluatedAt ?? 0).getTime();
                return bTime - aTime || a.id.localeCompare(b.id);
            });
        const pending = finding.followUps
            .filter((item: any) => item.status === 'TAMAMLANDI' && item.approvalStatus !== 'ONAYLANDI')
            .sort((a: any, b: any) => new Date(b.evaluatedAt ?? b.updatedAt).getTime() - new Date(a.evaluatedAt ?? a.updatedAt).getTime() || a.id.localeCompare(b.id))[0] ?? null;
        const latest = approved[0] ?? null;
        const userIds = [...new Set([latest?.evaluatorId, latest?.approvedBy].filter(Boolean))] as string[];
        const users = userIds.length ? await this.prisma.user.findMany({
            where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true },
        }) : [];
        const names = new Map(users.map(user => [user.id, `${user.firstName} ${user.lastName}`.trim()]));
        const openActions = finding.actions.filter((action: any) => !['KAPATILDI', 'CLOSED'].includes(action.status)).length;
        const closedActions = finding.actions.length - openActions;
        const upcomingDates = finding.followUps
            .filter((item: any) => !['ONAYLANDI', 'IPTAL'].includes(item.status))
            .map((item: any) => item.newFollowUpDate ?? item.plannedDate)
            .filter(Boolean)
            .map((value: any) => new Date(value))
            .filter((value: Date) => !Number.isNaN(value.getTime()))
            .sort((a: Date, b: Date) => a.getTime() - b.getTime());

        let systemSummary = 'Henüz takip çalışması bulunmuyor.';
        if (latest) {
            if (finding.status === 'CLOSED' || finding.resolutionStatus === 'KAPATILDI') {
                systemSummary = 'Bulgu kapatılmıştır. Son onaylı takip sonucu ve aksiyon kapanışları aşağıda gösterilmektedir.';
            } else if (latest.result === 'YETERLI') {
                systemSummary = openActions > 0
                    ? 'Son onaylı takipte ilgili aksiyon yeterli bulunmuştur; bulguyla ilişkili diğer açık aksiyonların takip çalışmaları devam etmektedir.'
                    : 'Son onaylı takipte alınan aksiyonların yeterli olduğu doğrulanmıştır; bulgunun güncel iş akışı durumu esas alınmaktadır.';
            } else if (latest.result === 'YETERSIZ') {
                const successor = finding.followUps.find((item: any) => item.previousFollowUpId === latest.id);
                systemSummary = successor
                    ? `Son onaylı takipte çalışma yetersiz bulunmuştur; aksiyon ${successor.followUpId} kodlu takip çalışması ile takip edilecektir.`
                    : 'Son onaylı takipte çalışma yetersiz bulunmuştur; ilgili aksiyon ve bulgu açık kalmaya devam etmektedir.';
            } else if (latest.result === 'YENI_AKSIYON_GEREKLI') {
                const successor = finding.followUps.find((item: any) => item.previousFollowUpId === latest.id);
                systemSummary = successor
                    ? `Son onaylı takipte yeni aksiyon gerekli bulunmuştur; yeni aksiyon ${successor.followUpId} kodlu takip çalışması ile takip edilecektir.`
                    : 'Son onaylı takipte yeni aksiyon gerekli bulunmuştur; yeni aksiyonun takip planlaması sürmektedir.';
            }
        }
        if (finding.workflowStatus === 'IPTAL') systemSummary = 'Bulgu iptal edilmiştir; eski takip sonuçları tarihsel kayıt olarak korunmaktadır.';

        return {
            status: finding.status,
            workflowStatus: finding.workflowStatus,
            resolutionStatus: finding.resolutionStatus,
            systemSummary,
            latestApproved: latest ? {
                id: latest.id, followUpId: latest.followUpId, result: latest.result,
                resolutionOutcome: latest.resolutionOutcome, evaluatedAt: latest.evaluatedAt,
                approvedAt: latest.approvedAt, explanation: latest.explanation,
                evaluatorName: names.get(latest.evaluatorId) ?? null,
                approverName: names.get(latest.approvedBy) ?? null,
            } : null,
            pending: pending ? { id: pending.id, followUpId: pending.followUpId, evaluatedAt: pending.evaluatedAt } : null,
            actionCounts: { open: openActions, closed: closedActions, total: finding.actions.length },
            nextFollowUpDate: upcomingDates[0] ?? null,
        };
    }

    async getFindingRelations(id: string) {
        const finding = await this.prisma.finding.findUnique({
            where: { id },
            include: {
                risk: { select: { id: true, riskId: true, name: true, status: true, residualRiskScore: true } },
                control: { select: { id: true, controlId: true, name: true, effectivenessStatus: true, type: true } },
                linkedRisks: { select: { id: true, riskId: true, name: true, status: true, residualRiskScore: true } },
            },
        });
        if (!finding) throw new NotFoundException(`Finding with ID ${id} not found`);

        const risks: any[] = [...(finding.linkedRisks || [])];
        if (finding.risk && !risks.find(r => r.id === finding.risk!.id)) {
            risks.push(finding.risk);
        }

        const controls = finding.control ? [finding.control] : [];
        const actions = await this.prisma.action.findMany({
            where: { findingId: id },
            select: { id: true, actionId: true, description: true, status: true, dueDate: true },
        });

        return {
            finding: { id: finding.id, findingId: finding.findingId, description: finding.description, status: finding.status, severity: finding.severity },
            risks,
            controls,
            actions,
        };
    }

    // Bulgu silme yalnızca henüz mutabakata girmemiş, ilerleme kaydedilmemiş TASLAK
    // bulgular için mümkündür. Süreç başlamışsa kayıt tarihseldir → iptal (iptalEt).
    //  - finding:delete     : her taslak (durum/bağımlılık kuralları yine geçerli)
    //  - finding:delete:own : yalnız createdById === oturum sahibi olan taslak
    // Yetki/sahiplik yoksa 403; durum/bağımlılık engeli 409. Silme + denetim izi tek transaction.
    async deleteFinding(id: string, userId: string, permissions: string[] = []) {
        const canDeleteAny = matchesPermission(permissions, 'finding:delete');
        const canDeleteOwn = matchesPermission(permissions, 'finding:delete:own');
        if (!canDeleteAny && !canDeleteOwn) throw new ForbiddenException('Bulgu silme yetkiniz yok.');
        return this.prisma.$transaction(async (tx) => {
            const finding = await tx.finding.findUnique({
                where: { id },
                select: {
                    id: true, findingId: true, description: true, workflowStatus: true, status: true, createdById: true,
                    resolutionStatus: true, controlTestId: true, controlId: true,
                    actions: { select: { id: true, actionId: true, status: true } },
                    followUps: { select: { id: true, followUpId: true, status: true, approvalStatus: true } },
                    _count: { select: { referencingTests: true, attachments: true } },
                },
            });
            if (!finding) throw new NotFoundException('Bulgu bulunamadı');
            const ownOnly = !canDeleteAny;
            if (ownOnly && finding.createdById !== userId) {
                throw new ForbiddenException('Yalnızca kendi oluşturduğunuz taslak bulguyu silebilirsiniz.');
            }

            const blockers = findingDeleteBlockers(finding);
            if (blockers.length > 0) {
                throw new ConflictException(
                    `Bulgu silinemez: ${blockers.join(' ')} Süreç başlamış bulgular için "İptal Et" işlemini kullanın.`,
                );
            }

            const followUpIds = finding.followUps.map(f => f.id);
            if (followUpIds.length > 0) {
                // FindingStatusHistory.followUpId cascade değil — bağı kopar (bkz. deleteFollowUp).
                await tx.findingStatusHistory.updateMany({ where: { followUpId: { in: followUpIds } }, data: { followUpId: null } });
                await tx.findingFollowUp.deleteMany({ where: { id: { in: followUpIds } } });
            }
            await tx.action.deleteMany({ where: { findingId: id } });
            // Koşullu silme: kontrol ile silme arasında bulgu mutabakata gönderildiyse silme olmaz.
            const deleted = await tx.finding.deleteMany({
                where: { id, workflowStatus: 'TASLAK', ...(ownOnly ? { createdById: userId } : {}) },
            });
            if (deleted.count !== 1) {
                throw new ConflictException('Bulgu bu sırada başka bir işlemle değiştirildi; silinmedi. Sayfayı yenileyip tekrar deneyin.');
            }

            await tx.auditLog.create({
                data: {
                    userId, action: 'DELETE', entityType: 'Finding', entityId: id,
                    oldValue: {
                        findingId: finding.findingId,
                        description: finding.description,
                        workflowStatus: finding.workflowStatus,
                        status: finding.status,
                        controlTestId: finding.controlTestId,
                        controlId: finding.controlId,
                        createdById: finding.createdById,
                        deletedVia: ownOnly ? 'finding:delete:own' : 'finding:delete',
                        deletedActions: finding.actions.map(a => a.actionId),
                        deletedFollowUps: finding.followUps.map(f => f.followUpId),
                        deletedAttachmentCount: finding._count.attachments,
                    },
                },
            });
            return { message: 'Bulgu silindi', findingId: finding.findingId };
        });
    }

    // ─── Mutabakat Workflow Geçişleri ─────────────────────────────────────────

    // Atomik geçiş: durum koşulu UPDATE'in WHERE'indedir (kontrol-sonra-yaz yarışı yok).
    // Geçişle birlikte yazılan alanlar, statü geçmişi ve denetim izi tek transaction'dadır.
    // Ön kontrol (çağıran metot) geçersiz durumda 400 döner; ön kontrolden sonra durum
    // eşzamanlı bir istekle değiştiyse 409 Conflict döner.
    private async transitionWorkflow(
        id: string,
        from: string,
        newStatus: string,
        userId: string,
        note?: string,
        extraData: Record<string, unknown> = {},
        db?: Prisma.TransactionClient,
    ) {
        const run = async (tx: Prisma.TransactionClient) => {
            const res = await tx.finding.updateMany({
                where: { id, workflowStatus: from as any },
                data: { ...extraData, workflowStatus: newStatus as any },
            });
            if (res.count !== 1) {
                const current = await tx.finding.findUnique({ where: { id }, select: { workflowStatus: true } });
                if (!current) throw new NotFoundException('Bulgu bulunamadı');
                throw new ConflictException(
                    `Bulgu durumu bu sırada değişti (beklenen: ${from}, mevcut: ${current.workflowStatus}). Sayfayı yenileyip tekrar deneyin.`,
                );
            }

            await tx.findingStatusHistory.create({
                data: {
                    findingId: id,
                    evaluator: userId,
                    changeType: 'WORKFLOW_CHANGE',
                    workflowStatus: newStatus as any,
                    previousWorkflowStatus: from as any,
                    explanation: note || `Statü: ${from} → ${newStatus}`,
                },
            });

            await tx.auditLog.create({
                data: {
                    userId,
                    action: 'UPDATE',
                    entityType: 'Finding',
                    entityId: id,
                    newValue: { workflowStatus: newStatus, previousWorkflowStatus: from, ...extraData } as Prisma.InputJsonValue,
                },
            });

            return tx.finding.findUniqueOrThrow({ where: { id } });
        };
        return db ? run(db) : this.prisma.$transaction(run);
    }

    // TASLAK → MUTABAKATA_GONDERILDI
    async mutabakataGonder(id: string, userId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id }, select: { workflowStatus: true } });
        if (!finding) throw new NotFoundException(`Finding ${id} not found`);
        if (finding.workflowStatus !== 'TASLAK') {
            throw new BadRequestException(`Bulgu TASLAK statüsünde değil: ${finding.workflowStatus}`);
        }
        return this.transitionWorkflow(id, 'TASLAK', 'MUTABAKATA_GONDERILDI', userId, 'Bulgu mutabakata gönderildi.');
    }

    // MUTABAKATA_GONDERILDI → IC_KONTROL_ONAYINA_GONDERILDI
    async icKontrolOnayinaGonder(id: string, birimCevabi: string, targetDate: string | undefined, userId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id }, select: { workflowStatus: true } });
        if (!finding) throw new NotFoundException(`Finding ${id} not found`);
        if (finding.workflowStatus !== 'MUTABAKATA_GONDERILDI') {
            throw new BadRequestException(`Beklenen statü MUTABAKATA_GONDERILDI, mevcut: ${finding.workflowStatus}`);
        }
        // Birim cevabı geçişle aynı atomik güncellemede yazılır.
        return this.transitionWorkflow(
            id, 'MUTABAKATA_GONDERILDI', 'IC_KONTROL_ONAYINA_GONDERILDI', userId,
            'Birim yanıtı alındı, İç Kontrol onayına gönderildi.',
            { birimCevabi, ...(targetDate ? { targetResolutionDate: new Date(targetDate) } : {}) },
        );
    }

    // IC_KONTROL_ONAYINA_GONDERILDI → MUTABAKAT_YAPILDI
    async mutabakatOnayla(id: string, data: { internalControlAssessment?: string; resolutionStatus?: string }, userId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id }, select: { workflowStatus: true } });
        if (!finding) throw new NotFoundException(`Finding ${id} not found`);
        if (finding.workflowStatus !== 'IC_KONTROL_ONAYINA_GONDERILDI') {
            throw new BadRequestException(`Beklenen statü IC_KONTROL_ONAYINA_GONDERILDI, mevcut: ${finding.workflowStatus}`);
        }
        // Maker/checker: mutabakatı İç Kontrol onayına GÖNDEREN kişi, aynı
        // mutabakatı onaylayamaz (kendi değerlendirmesini onaylama yasağı —
        // ControlTest.approveTest / FollowUp onayıyla aynı ilke).
        const lastSendToApproval = await this.prisma.findingStatusHistory.findFirst({
            where: { findingId: id, workflowStatus: 'IC_KONTROL_ONAYINA_GONDERILDI' },
            orderBy: { createdAt: 'desc' },
            select: { evaluator: true },
        });
        if (lastSendToApproval?.evaluator && lastSendToApproval.evaluator === userId) {
            throw new ForbiddenException('Kendi gönderdiğiniz mutabakatı onaylayamazsınız.');
        }
        const updateData: Record<string, unknown> = {};
        if (data.internalControlAssessment) updateData.internalControlAssessment = data.internalControlAssessment;
        if (data.resolutionStatus) {
            updateData.resolutionStatus = data.resolutionStatus;
            if (data.resolutionStatus === 'KAPATILDI') updateData.closedDate = new Date();
        }
        return this.transitionWorkflow(
            id, 'IC_KONTROL_ONAYINA_GONDERILDI', 'MUTABAKAT_YAPILDI', userId,
            'Mutabakat İKS tarafından onaylandı.', updateData,
        );
    }

    // IC_KONTROL_ONAYINA_GONDERILDI → MUTABAKATA_GONDERILDI (geri gönder)
    async mutabakatGeriGonder(id: string, reason: string, userId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id }, select: { workflowStatus: true } });
        if (!finding) throw new NotFoundException(`Finding ${id} not found`);
        if (finding.workflowStatus !== 'IC_KONTROL_ONAYINA_GONDERILDI') {
            throw new BadRequestException(`Beklenen statü IC_KONTROL_ONAYINA_GONDERILDI, mevcut: ${finding.workflowStatus}`);
        }
        return this.transitionWorkflow(id, 'IC_KONTROL_ONAYINA_GONDERILDI', 'MUTABAKATA_GONDERILDI', userId, `Yetersiz yanıt, birime geri gönderildi: ${reason}`);
    }

    // Herhangi → IPTAL (yalnızca Business Owner / Admin)
    async iptalEt(id: string, reason: string, userId: string) {
        if (!reason?.trim()) throw new BadRequestException('İptal gerekçesi zorunludur.');
        const finding = await this.prisma.finding.findUnique({ where: { id }, select: { workflowStatus: true } });
        if (!finding) throw new NotFoundException(`Finding ${id} not found`);
        if (finding.workflowStatus === 'IPTAL') {
            throw new BadRequestException('Bulgu zaten iptal edilmiş.');
        }

        return this.prisma.$transaction(async (tx) => {
            const [openActions, openFollowUps] = await Promise.all([
                tx.action.findMany({
                    where: { findingId: id, status: { notIn: ['KAPATILDI', 'CLOSED', 'IPTAL'] } },
                    select: { id: true, status: true },
                }),
                tx.findingFollowUp.findMany({
                    where: { findingId: id, status: { notIn: ['ONAYLANDI', 'IPTAL'] } },
                    select: { id: true, status: true },
                }),
            ]);

            const cancelled = await tx.finding.updateMany({
                where: { id, workflowStatus: finding.workflowStatus },
                data: { workflowStatus: 'IPTAL' },
            });
            if (cancelled.count !== 1) {
                throw new ConflictException('Bulgu durumu bu sırada değişti; iptal edilmedi. Sayfayı yenileyip tekrar deneyin.');
            }
            const updated = await tx.finding.findUniqueOrThrow({ where: { id } });
            if (openActions.length > 0) {
                await tx.action.updateMany({
                    where: { id: { in: openActions.map((action) => action.id) } },
                    data: { status: 'IPTAL' },
                });
            }
            if (openFollowUps.length > 0) {
                await tx.findingFollowUp.updateMany({
                    where: { id: { in: openFollowUps.map((followUp) => followUp.id) } },
                    data: { status: 'IPTAL' },
                });
            }

            await tx.findingStatusHistory.create({
                data: {
                    findingId: id,
                    evaluator: userId,
                    changeType: 'WORKFLOW_CHANGE',
                    workflowStatus: 'IPTAL',
                    previousWorkflowStatus: finding.workflowStatus,
                    explanation: `İptal gerekçesi: ${reason.trim()}`,
                },
            });
            for (const action of openActions) {
                await tx.auditLog.create({
                    data: {
                        userId, action: 'CANCEL', entityType: 'Action', entityId: action.id,
                        oldValue: { status: action.status }, newValue: { status: 'IPTAL', reason: reason.trim() },
                    },
                });
            }
            for (const followUp of openFollowUps) {
                await tx.auditLog.create({
                    data: {
                        userId, action: 'CANCEL', entityType: 'FindingFollowUp', entityId: followUp.id,
                        oldValue: { status: followUp.status }, newValue: { status: 'IPTAL', reason: reason.trim() },
                    },
                });
            }
            await tx.auditLog.create({
                data: {
                    userId,
                    action: 'CANCEL',
                    entityType: 'Finding',
                    entityId: id,
                    oldValue: { workflowStatus: finding.workflowStatus },
                    newValue: {
                        workflowStatus: 'IPTAL',
                        reason: reason.trim(),
                        cancelledActionCount: openActions.length,
                        cancelledFollowUpCount: openFollowUps.length,
                    },
                },
            });
            return updated;
        });
    }

    // ── Onaylı kapanış (Madde 3) ─────────────────────────────────────────────
    // Bulgu YALNIZCA buradan CLOSED olur. Koşullar:
    //  - En az bir düzeltici aksiyon var (sıfır aksiyonlu bulgu "açık aksiyon yok"
    //    diye otomatik kapanamaz).
    //  - TÜM aksiyonlar KAPATILDI (onaylı kapanış). Yalnızca TAMAMLANDI/COMPLETED
    //    yeterli değildir.
    //  - closedDate SUNUCU üretir, resolutionStatus=KAPATILDI, status=CLOSED.
    async closeFinding(id: string, reason: string, userId: string) {
        const finding = await this.prisma.finding.findUnique({
            where: { id },
            select: { id: true, status: true, actions: { select: { status: true } } },
        });
        if (!finding) throw new NotFoundException(`Finding ${id} not found`);
        if (finding.status === 'CLOSED') throw new BadRequestException('Bulgu zaten kapalı.');
        if (!reason?.trim()) throw new BadRequestException('Kapanış gerekçesi zorunludur.');
        if (finding.actions.length === 0) {
            throw new BadRequestException(
                'Düzeltici aksiyonu olmayan bulgu bu işlemden kapatılamaz — önce aksiyon tanımlayın.',
            );
        }
        const CLOSED_ACTION = new Set(['KAPATILDI', 'CLOSED']);
        const open = finding.actions.filter((a) => !CLOSED_ACTION.has(a.status));
        if (open.length > 0) {
            throw new BadRequestException(
                `Bulgu kapatılamaz: ${open.length} aksiyon henüz onaylı biçimde kapatılmadı (KAPATILDI).`,
            );
        }
        const closedDate = new Date();
        return this.prisma.$transaction(async (tx) => {
            // Koşul UPDATE içinde: arada yeni açık aksiyon eklendiyse veya bulgu
            // zaten kapandıysa kapanış yapılmaz.
            const res = await tx.finding.updateMany({
                where: {
                    id, status: { not: 'CLOSED' },
                    actions: { some: {}, every: { status: { in: ['KAPATILDI', 'CLOSED'] } } },
                },
                data: { status: 'CLOSED', resolutionStatus: 'KAPATILDI', closedDate },
            });
            if (res.count !== 1) {
                throw new ConflictException('Bulgu veya aksiyonları bu sırada değişti; kapatılmadı. Sayfayı yenileyip tekrar deneyin.');
            }
            await this.appendStatusHistory(id, { explanation: `Bulgu kapatıldı. Gerekçe: ${reason}`, evaluator: userId }, userId, tx);
            await tx.auditLog.create({
                data: { userId, action: 'CLOSE', entityType: 'Finding', entityId: id, newValue: { status: 'CLOSED', closedDate, reason } },
            });
            return tx.finding.findUniqueOrThrow({ where: { id } });
        });
    }

    // ── Yeniden açma (Madde 3) — gerekçeli, yetkili, loglanan ayrı işlem ──────
    async reopenFinding(id: string, reason: string, userId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id }, select: { id: true, status: true } });
        if (!finding) throw new NotFoundException(`Finding ${id} not found`);
        if (finding.status !== 'CLOSED') throw new BadRequestException('Yalnızca kapalı bulgu yeniden açılabilir.');
        if (!reason?.trim()) throw new BadRequestException('Yeniden açma gerekçesi zorunludur.');
        return this.prisma.$transaction(async (tx) => {
            const res = await tx.finding.updateMany({
                where: { id, status: 'CLOSED' },
                data: { status: 'IN_PROGRESS', resolutionStatus: 'DEVAM_EDIYOR', closedDate: null },
            });
            if (res.count !== 1) {
                throw new ConflictException('Bulgu bu sırada yeniden açıldı veya değişti. Sayfayı yenileyip tekrar deneyin.');
            }
            await this.appendStatusHistory(id, { explanation: `Bulgu yeniden açıldı. Gerekçe: ${reason}`, evaluator: userId }, userId, tx);
            await tx.auditLog.create({
                data: { userId, action: 'REOPEN', entityType: 'Finding', entityId: id, newValue: { status: 'IN_PROGRESS', reason } },
            });
            return tx.finding.findUniqueOrThrow({ where: { id } });
        });
    }

    // ─── Risk ↔ Finding Linking ───────────────────────────────────────────────

    async linkRiskToFinding(findingId: string, riskId: string, userId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id: findingId } });
        if (!finding) throw new NotFoundException(`Finding ${findingId} not found`);
        const risk = await this.prisma.risk.findUnique({ where: { id: riskId } });
        if (!risk) throw new NotFoundException(`Risk ${riskId} not found`);

        await this.prisma.finding.update({
            where: { id: findingId },
            data: { linkedRisks: { connect: { id: riskId } } },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'Finding', entityId: findingId, newValue: { linkedRiskId: riskId, action: 'link' } },
        });

        return { message: 'Risk linked to finding successfully' };
    }

    async unlinkRiskFromFinding(findingId: string, riskId: string, userId: string) {
        await this.prisma.finding.update({
            where: { id: findingId },
            data: { linkedRisks: { disconnect: { id: riskId } } },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'Finding', entityId: findingId, newValue: { linkedRiskId: riskId, action: 'unlink' } },
        });

        return { message: 'Risk unlinked from finding successfully' };
    }

    // ─── Finding Follow-Ups ───────────────────────────────────────────────────

    async getFollowUps(findingId: string, scope?: Prisma.FindingFollowUpWhereInput | null) {
        const finding = await this.prisma.finding.findUnique({ where: { id: findingId }, select: { id: true } });
        if (!finding) throw new NotFoundException(`Finding ${findingId} not found`);

        return this.prisma.findingFollowUp.findMany({
            where: scope ? { AND: [{ findingId }, scope] } : { findingId },
            orderBy: { createdAt: 'desc' },
        });
    }

    async createFollowUp(findingId: string, data: any, userId: string) {
        const finding = await this.prisma.finding.findUnique({
            where: { id: findingId },
            select: { id: true, findingId: true, findingType: true, status: true, workflowStatus: true },
        });
        if (!finding) throw new NotFoundException(`Finding ${findingId} not found`);
        if (finding.status === 'CLOSED' || finding.workflowStatus === 'IPTAL') {
            throw new BadRequestException('Kapalı veya iptal edilmiş bulguya yeni takip çalışması eklenemez.');
        }

        if (!data.actionId) throw new BadRequestException('Takip çalışması bir aksiyona bağlı olmalıdır (actionId zorunlu).');
        const action = await this.prisma.action.findFirst({
            where: { id: data.actionId, findingId }, select: { id: true, actionId: true, ownerId: true },
        });
        if (!action) throw new BadRequestException('Seçilen aksiyon bu bulguya ait değil veya bulunamadı.');
        const assignment = await this.resolveFollowUpAssignment(findingId, action.ownerId);

        const {
            birimCevabi, currentStatusDetail, internalControlAssessment,
            targetResolutionDate, testDate, attachment, secondControllerId, sprint, notes,
        } = data;

        // İstemcinin seçtiği ikinci kontrolcü de çıkmaz/maker-checker kurallarından geçer.
        const chosenSecond = secondControllerId || assignment.secondControllerId;
        if (secondControllerId) {
            if (secondControllerId === assignment.assigneeId) {
                throw new BadRequestException('Birinci kontrolcü aynı takibin ikinci kontrolcüsü olamaz.');
            }
            const sc = await this.prisma.user.findUnique({ where: { id: secondControllerId }, select: { isActive: true, role: { select: { name: true } } } });
            if (!sc || !sc.isActive || !FOLLOWUP_APPROVER_ROLES.has(normalizeRole(sc.role?.name))) {
                throw new BadRequestException('Seçilen ikinci kontrolcü aktif değil veya takip onayı verme yetkisine sahip değil.');
            }
        }

        // Takip ve denetim kaydı tek transaction'da; takip her zaman BEKLIYOR açılır
        // (istemci "ONAYLANDI"/"TAMAMLANDI" ile maker-checker'ı atlayamaz).
        return this.prisma.$transaction(async (tx) => {
        const followUp = await tx.findingFollowUp.create({
            data: {
                followUpId: await this.generateFollowUpId(action.id, action.actionId, tx),
                findingId,
                actionId: action.id,
                status: 'BEKLIYOR',
                birimCevabi: birimCevabi || null,
                currentStatusDetail: currentStatusDetail || null,
                internalControlAssessment: internalControlAssessment || null,
                targetResolutionDate: targetResolutionDate ? new Date(targetResolutionDate) : null,
                testDate: testDate ? new Date(testDate) : null,
                secondControllerId: chosenSecond,
                assigneeId: assignment.assigneeId,
                sprint: sprint || null,
                notes: notes || null,
            },
        });

        await tx.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'FindingFollowUp', entityId: followUp.id, newValue: followUp },
        });

        return followUp;
        });
    }

    /** Eski uç (DELETE): artık doğrudan silmez, ikinci kontrolcü onayına silme talebi açar. */
    async deleteFollowUp(findingId: string, followUpId: string, userId: string, reason?: string) {
        return this.requestFollowUpDeletion(findingId, followUpId, reason ?? '', userId);
    }

    /**
     * Takip çalışması güncelleme + değerlendirme + ONAY (Madde 1/3/5/6).
     *
     * Onay zinciri — okuma, önkoşullar, atomik sahiplenme, aksiyon kapatma / yeni
     * aksiyon, yeni takip, bulgu durum/tarih güncellemesi ve başarı audit'i — TEK
     * transaction içinde çalışır; tüm yardımcılar aynı tx istemcisini kullanır.
     * Zincir ortasında hata → tümü rollback; tekrar istek işlemi tamamlar.
     *
     * Onaylanmış kayıtta result/actionId/secondControllerId/status yeniden
     * değiştirilerek yan etki üretilemez. Tekrarlanan başarılı onay isteği mevcut
     * durumu döndürür (idempotent), ikinci kez yan etki üretmez.
     *
     * secondControllerId burada YAZILMAZ — ayrı `assignSecondController` işlemi.
     */
    async updateFollowUp(
        findingId: string,
        followUpId: string,
        data: any,
        userId: string,
        userRole?: string,
    ) {
        const followUp = await this.prisma.findingFollowUp.findFirst({
            where: { id: followUpId, findingId },
            include: {
                action: { select: { id: true, actionId: true, ownerId: true } },
                finding: {
                    select: {
                        assigneeId: true,
                        controlTest: { select: { assigneeId: true, secondControllerId: true } },
                    },
                },
                nextFollowUp: { select: { id: true, followUpId: true } },
            },
        });
        if (!followUp) throw new NotFoundException(`FollowUp ${followUpId} not found`);

        const {
            birimCevabi, currentStatusDetail, internalControlAssessment,
            targetResolutionDate, testDate, sprint, notes, status,
            result, explanation, approvalStatus,
            resolutionOutcome, newFollowUpDate, newAction,
        } = data;
        if (data.actionId !== undefined) {
            throw new BadRequestException('Takibin bağlı olduğu aksiyon oluşturulduktan sonra değiştirilemez.');
        }
        // evaluatorId / evaluatedAt / approvedBy / approvedAt / secondControllerId /
        // evidence / attachment: İSTEMCİDEN YAZILMAZ — sahte kimliği ve genel PUT ile
        // ikinci kontrolcü değişimini engeller (Madde 3/4). DTO whitelist zaten filtreler;
        // burada da yok sayarız.

        const recordingEvaluation = result !== undefined && result !== null && result !== '';
        const effectiveEvaluatorId = recordingEvaluation ? userId : followUp.evaluatorId;
        const effectiveResult = recordingEvaluation ? result : followUp.result;
        const alreadyApproved =
            followUp.approvalStatus === 'ONAYLANDI' || followUp.status === 'ONAYLANDI';
        const approvalRequestedNow = approvalStatus === 'ONAYLANDI' || status === 'ONAYLANDI';
        const rejectionRequestedNow = approvalStatus === 'REDDEDILDI';
        const pendingApproval = followUp.status === 'TAMAMLANDI' && followUp.approvalStatus === 'BEKLIYOR' && !!followUp.result;
        const assignedMakerId = followUp.assigneeId
            ?? followUp.finding?.controlTest?.assigneeId
            ?? followUp.finding?.assigneeId
            ?? followUp.action?.ownerId
            ?? null;
        const standaloneReschedule = newFollowUpDate !== undefined && !recordingEvaluation && !resolutionOutcome && !approvalRequestedNow;

        if ((followUp as any).deletedAt || followUp.status === 'IPTAL') {
            throw new ConflictException('Silinmiş veya iptal edilmiş takip çalışması düzenlenemez.');
        }
        if ((followUp as any).deletionRequestedAt) {
            throw new ConflictException('Silme onayı bekleyen takip çalışması düzenlenemez.');
        }
        if (pendingApproval && !approvalRequestedNow && !rejectionRequestedNow) {
            throw new ForbiddenException('Onay bekleyen takip çalışması düzenlenemez.');
        }
        if (!approvalRequestedNow && !rejectionRequestedNow && assignedMakerId && assignedMakerId !== userId) {
            throw new ForbiddenException('Bu takip çalışmasını yalnızca atanmış birinci kontrolcü düzenleyebilir.');
        }

        if (standaloneReschedule) {
            if (!newFollowUpDate || !isFutureIstanbulDate(newFollowUpDate)) throw new BadRequestException('Yeni takip tarihi Europe/Istanbul takvimine göre bugünden sonra olmalıdır.');
            if (!explanation?.trim()) throw new BadRequestException('Tarih değişikliği gerekçesi zorunludur.');
            const nextDate = new Date(`${newFollowUpDate.slice(0, 10)}T00:00:00+03:00`);
            if (alreadyApproved || ['TAMAMLANDI', 'ONAYLANDI'].includes(followUp.status)) {
                return this.prisma.$transaction(async tx => {
                    const existing = await tx.findingFollowUp.findFirst({ where: { findingId, actionId: followUp.actionId, plannedDate: nextDate, status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR'] } } });
                    if (!followUp.action) throw new BadRequestException('Legacy aksiyonsuz takip yeniden planlanamaz; önce bir aksiyon oluşturun.');
                    const next = existing || await tx.findingFollowUp.create({ data: { followUpId: await this.generateFollowUpId(followUp.action.id, followUp.action.actionId, tx), findingId, actionId: followUp.actionId, plannedDate: nextDate, status: 'BEKLIYOR', notes: explanation.trim() } });
                    await this.recordAuditTrail({ findingId, followUpId: next.id, actionId: followUp.actionId || undefined, operation: 'TEST_DATE_CHANGED', userId, explanation: explanation.trim(), oldValue: { sourceFollowUpId: followUp.id, plannedDate: followUp.plannedDate }, newValue: { plannedDate: nextDate } }, tx);
                    await tx.auditLog.create({ data: { userId, action: 'FOLLOWUP_RESCHEDULE', entityType: 'FindingFollowUp', entityId: next.id, oldValue: { sourceFollowUpId: followUp.id }, newValue: { plannedDate: nextDate, reason: explanation.trim() } } });
                    return { ...next, createdAction: null };
                });
            }
            return this.prisma.$transaction(async tx => {
                const updated = await tx.findingFollowUp.update({ where: { id: followUpId }, data: { plannedDate: nextDate, newFollowUpDate: nextDate, explanation: explanation.trim() } });
                await this.recordAuditTrail({ findingId, followUpId, actionId: followUp.actionId || undefined, operation: 'TEST_DATE_CHANGED', userId, explanation: explanation.trim(), oldValue: { plannedDate: followUp.plannedDate }, newValue: { plannedDate: nextDate } }, tx);
                await tx.auditLog.create({ data: { userId, action: 'FOLLOWUP_RESCHEDULE', entityType: 'FindingFollowUp', entityId: followUpId, oldValue: { plannedDate: followUp.plannedDate }, newValue: { plannedDate: nextDate, reason: explanation.trim() } } });
                return { ...updated, createdAction: null };
            });
        }

        if (resolutionOutcome && !effectiveResult) {
            throw new BadRequestException('Bulgu sonucu kaydetmek için değerlendirme sonucu zorunludur.');
        }

        if (result === 'YETERSIZ' && resolutionOutcome && !['DEVAM_EDIYOR', 'ERTELENDI'].includes(resolutionOutcome)) {
            throw new BadRequestException(
                `YETERSIZ değerlendirme yalnızca DEVAM_EDIYOR veya ERTELENDI sonucu ile kaydedilebilir: ${resolutionOutcome}`,
            );
        }
        if (result === 'YETERLI' && resolutionOutcome) {
            throw new BadRequestException(
                'YETERLI değerlendirmede bulgu sonucu kullanıcı tarafından seçilemez; açık aksiyonlara göre sistem belirler.',
            );
        }
        if (result === 'YENI_AKSIYON_GEREKLI' && resolutionOutcome !== 'YENI_AKSIYON_GEREKLI') {
            throw new BadRequestException(
                `YENI_AKSIYON_GEREKLI değerlendirme yalnızca YENI_AKSIYON_GEREKLI sonucu ile kaydedilebilir: ${resolutionOutcome || 'boş'}`,
            );
        }

        // ── Onaylı kayıt: kilitli ────────────────────────────────────────────────
        if (alreadyApproved) {
            if (approvalRequestedNow) {
                // Tekrarlanan başarılı onay → idempotent, yan etki yok.
                return { ...followUp, createdFollowUp: followUp.nextFollowUp ?? null };
            }
            throw new ForbiddenException('Onaylanmış takip çalışması tarihsel kayıttır ve değiştirilemez.');
        }

        // ── Önkoşullar (transaction DIŞINDA — ucuz okuma, net hata) ──────────────
        const wantsNewAction = effectiveResult === 'YENI_AKSIYON_GEREKLI';
        if (resolutionOutcome === 'ERTELENDI' && !newFollowUpDate) {
            throw new BadRequestException('ERTELENDI seçildiğinde newFollowUpDate zorunludur.');
        }
        if (resolutionOutcome === 'ERTELENDI' && newFollowUpDate && !isFutureIstanbulDate(newFollowUpDate)) {
            throw new BadRequestException('Erteleme tarihi Europe/Istanbul takvimine göre bugünden sonra olmalıdır.');
        }
        // Maker-checker: ikinci kontrolcü maker'ın gönderdiği yeni aksiyon taslağını onaylar;
        // onay isteğinde taslağı değiştiremez (düzeltme yolu: reddet → maker düzeltir → yeniden gönderir).
        if (approvalRequestedNow && newAction !== undefined) {
            throw new BadRequestException('Onay sırasında yeni aksiyon taslağı değiştirilemez; düzeltme gerekiyorsa değerlendirmeyi gerekçeyle reddedin.');
        }
        // YENI_AKSIYON_GEREKLI: yeni aksiyonun planı, sorumlu birimi ve hedef tarihi zorunludur
        // (placeholder üretilmez). Sorumlu kişi verilmezse mevcut aksiyonun sorumlusu kullanılır.
        const persistedNewAction = followUp.newActionDraft && typeof followUp.newActionDraft === 'object'
            ? followUp.newActionDraft as Record<string, unknown>
            : undefined;
        let effectiveNewAction: { description: string; directorateId: string; ownerId: string; dueDate: string; notes?: string } | undefined;
        // Ret, taslağın geçerliliğinden bağımsızdır: geçersizleşmiş taslak (ör. birimi kaldırılmış)
        // reddedilip maker'a düzeltmeye dönebilmelidir; aksi halde takip kilitli kalır.
        if (wantsNewAction && !rejectionRequestedNow) {
            const src = (newAction ?? persistedNewAction) as Record<string, unknown> | undefined;
            const description = typeof src?.description === 'string' ? src.description.trim() : '';
            const directorateId = typeof src?.directorateId === 'string' ? src.directorateId : '';
            const dueDateRaw = typeof src?.dueDate === 'string' ? src.dueDate : '';
            if (!description) throw new BadRequestException('Yeni aksiyon planı (açıklama) zorunludur.');
            if (!directorateId) throw new BadRequestException('Yeni aksiyon için sorumlu birim seçilmelidir.');
            if (!dueDateRaw || Number.isNaN(new Date(dueDateRaw).getTime()) || !isFutureIstanbulDate(new Date(dueDateRaw).toISOString())) {
                throw new BadRequestException('Yeni aksiyonun hedef tarihi bugünden sonra olmalıdır.');
            }
            const directorateExists = await this.prisma.directorate.findUnique({ where: { id: directorateId }, select: { id: true } });
            if (!directorateExists) throw new BadRequestException('Geçersiz birim: seçilen sorumlu birim bulunamadı');
            const ownerId = (typeof src?.ownerId === 'string' && src.ownerId) || followUp.action?.ownerId || '';
            if (!ownerId) throw new BadRequestException('Yeni aksiyon için sorumlu kişi belirlenemedi; bir sorumlu seçin.');
            const ownerExists = await this.prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
            if (!ownerExists) throw new BadRequestException('Geçersiz kullanıcı: yeni aksiyon sorumlusu bulunamadı');
            effectiveNewAction = {
                description, directorateId, ownerId, dueDate: dueDateRaw,
                notes: typeof src?.notes === 'string' && src.notes.trim() ? src.notes.trim() : undefined,
            };
        }
        if (status === 'TAMAMLANDI') {
            if (!effectiveResult) throw new BadRequestException('Onaya göndermek için takip sonucu zorunludur.');
            if (!followUp.secondControllerId) {
                throw new BadRequestException('Onaya göndermek için ikinci kontrolcü atanmış olmalıdır.');
            }
        }

        if (rejectionRequestedNow) {
            if (!pendingApproval) throw new BadRequestException('Yalnızca onay bekleyen takip çalışması reddedilebilir.');
            if (!explanation?.trim()) throw new BadRequestException('Ret gerekçesi zorunludur.');
            if (!followUp.result) throw new BadRequestException('Reddedilecek bir değerlendirme sonucu yoktur.');
            if (followUp.evaluatorId === userId) throw new ForbiddenException('Kendi değerlendirmenizi reddedemezsiniz');
            if (!FOLLOWUP_APPROVER_ROLES.has(normalizeRole(userRole))) {
                throw new ForbiddenException('Takip değerlendirmesini reddetme yetkiniz yok');
            }
            if (!followUp.secondControllerId || followUp.secondControllerId !== userId) {
                throw new ForbiddenException('Bu takibi yalnızca atanmış ikinci kontrolcü reddedebilir.');
            }

            return this.prisma.$transaction(async (tx) => {
                const updated = await tx.findingFollowUp.update({
                    where: { id: followUpId },
                    data: {
                        status: 'DEVAM_EDIYOR', approvalStatus: 'REDDEDILDI',
                        approvedBy: null, approvedAt: null, rejectionReason: explanation.trim(),
                    },
                });
                await this.recordAuditTrail({
                    findingId, followUpId, operation: 'FOLLOWUP_REJECTED', userId,
                    explanation: `Takip değerlendirmesi reddedildi: ${explanation.trim()}`,
                    newValue: { status: 'DEVAM_EDIYOR', approvalStatus: 'REDDEDILDI' },
                }, tx);
                await tx.auditLog.create({
                    data: { userId, action: 'REJECT', entityType: 'FindingFollowUp', entityId: followUpId, newValue: updated },
                });
                return { ...updated, createdAction: null };
            });
        }

        if (approvalRequestedNow) {
            if (!pendingApproval) {
                throw new BadRequestException('Yalnızca onay bekleyen takip çalışması onaylanabilir.');
            }
            const resultForApproval = recordingEvaluation ? result : followUp.result;
            if (!resultForApproval) throw new BadRequestException('Onaylanacak bir değerlendirme sonucu yok');
            if (!effectiveEvaluatorId) throw new BadRequestException('Onaylanacak takipte değerlendiren kullanıcı bulunamadı.');
            if (effectiveEvaluatorId && effectiveEvaluatorId === userId) {
                throw new ForbiddenException('Kendi değerlendirmenizi onaylayamazsınız');
            }
            if (!FOLLOWUP_APPROVER_ROLES.has(normalizeRole(userRole))) {
                throw new ForbiddenException('Takip değerlendirmesini onaylama yetkiniz yok');
            }
            if (!followUp.secondControllerId) {
                throw new ForbiddenException(
                    'Bu takip için ikinci kontrolcü atanmamış — onaydan önce yetkili yönetici ikinci kontrolcü atamalı.',
                );
            }
            if (followUp.secondControllerId !== userId) {
                throw new ForbiddenException('Bu takibi yalnızca atanmış ikinci kontrolcü onaylayabilir.');
            }
        }

        // ── TRANSACTION: onay/sonuç zinciri atomik ──────────────────────────────
        const txOut = await this.prisma.$transaction(async (tx) => {
            let wonApprovalRace = true;
            if (approvalRequestedNow) {
                // Atomik koşullu geçiş: yalnız durumu gerçekten çeviren istek devam eder.
                // Onay sırasında güncel secondControllerId de transaction içinde doğrulanır.
                const claim = await tx.findingFollowUp.updateMany({
                    where: {
                        id: followUpId,
                        secondControllerId: userId,
                        status: 'TAMAMLANDI',
                        approvalStatus: 'BEKLIYOR',
                    },
                    data: {
                        status: 'ONAYLANDI',
                        approvalStatus: 'ONAYLANDI',
                        approvedBy: userId,
                        approvedAt: new Date(),
                        ...(recordingEvaluation ? { evaluatorId: userId, evaluatedAt: new Date() } : {}),
                    },
                });
                wonApprovalRace = claim.count === 1;
                if (!wonApprovalRace) return { lostRace: true as const };
            }

            const updated = await tx.findingFollowUp.update({
                where: { id: followUpId },
                data: {
                    status: approvalRequestedNow ? undefined : (status || undefined),
                    birimCevabi: birimCevabi !== undefined ? (birimCevabi || null) : undefined,
                    currentStatusDetail: currentStatusDetail !== undefined ? (currentStatusDetail || null) : undefined,
                    internalControlAssessment: internalControlAssessment !== undefined ? (internalControlAssessment || null) : undefined,
                    targetResolutionDate: targetResolutionDate !== undefined ? (targetResolutionDate ? new Date(targetResolutionDate) : null) : undefined,
                    testDate: testDate !== undefined ? (testDate ? new Date(testDate) : null) : undefined,
                    sprint: sprint !== undefined ? (sprint || null) : undefined,
                    notes: notes !== undefined ? (notes || null) : undefined,
                    evaluatorId: (recordingEvaluation && !approvalRequestedNow) ? userId : undefined,
                    evaluatedAt: (recordingEvaluation && !approvalRequestedNow) ? new Date() : undefined,
                    approvalStatus: status === 'TAMAMLANDI'
                        ? 'BEKLIYOR'
                        : (recordingEvaluation && followUp.approvalStatus === 'REDDEDILDI' ? 'REDDEDILDI' : undefined),
                    result: result !== undefined ? (result || null) : undefined,
                    explanation: explanation !== undefined ? (explanation || null) : undefined,
                    resolutionOutcome: resolutionOutcome !== undefined ? (resolutionOutcome || null) : undefined,
                    newFollowUpDate: newFollowUpDate !== undefined ? (newFollowUpDate ? new Date(newFollowUpDate) : null) : undefined,
                    newActionRequired: !!wantsNewAction,
                    // Değerlendirme ile ikinci kontrolcü onayı arasında yeni aksiyon taslağı saklanır;
                    // aksiyon yalnız onayda oluşturulur.
                    newActionDraft: wantsNewAction && effectiveNewAction
                        ? (effectiveNewAction as unknown as Prisma.InputJsonValue)
                        : undefined,
                    rejectionReason: status === 'TAMAMLANDI' ? null : undefined,
                },
            });

            // Onayın yan etkilerinden önceki durum: ikinci kontrolcü onayı geri alırsa buna döner.
            const effectsBefore = approvalRequestedNow && wonApprovalRace
                ? await this.captureFollowUpEffectsBefore(findingId, updated, tx)
                : null;

            // Değerlendirmenin kaydedilmesi tek başına bulgu/aksiyon yan etkisi
            // üretmez. Çözüm durumu yalnız atanmış ikinci kontrolcünün onayıyla
            // yürürlüğe girer.
            const effectiveResolution = approvalRequestedNow && wonApprovalRace
                ? (updated.resolutionOutcome || (updated.result === 'YETERLI' ? 'KAPATILDI' : undefined))
                : undefined;

            if (effectiveResolution) {
                const findingUpdate: any = { resolutionStatus: effectiveResolution };
                if (effectiveResolution === 'KAPATILDI') findingUpdate.testDate = null;
                else if (effectiveResolution === 'ERTELENDI' && updated.newFollowUpDate) findingUpdate.testDate = updated.newFollowUpDate;
                else if (effectiveResolution === 'KISMEN_KAPATILDI') findingUpdate.status = 'PARTIALLY_CLOSED';
                else if (effectiveResolution === 'YENI_AKSIYON_GEREKLI') findingUpdate.status = 'IN_PROGRESS';

                await tx.finding.update({ where: { id: findingId }, data: findingUpdate });

                // Güncel Durum günlüğü maker'ın KAYITLI değerlendirme metninden yazılır;
                // onaylayan genelde yalnız status=ONAYLANDI gönderir (bu yüzden istek
                // gövdesindeki alan tek başına yeterli değildir).
                const statusText = currentStatusDetail || updated.currentStatusDetail;
                if (statusText) {
                    const logText = `${new Date().toLocaleDateString('tr-TR')} — ${statusText}`;
                    await this.appendStatusLog(findingId, logText, userId, undefined, updated.id, tx);
                }
                await this.recordAuditTrail({
                    findingId, followUpId: updated.id, operation: 'FOLLOWUP_COMPLETED', userId,
                    explanation: `Takip onaylandı: ${updated.followUpId} — ${effectiveResolution}. ${updated.currentStatusDetail || ''}`,
                    newValue: {
                        followUpId: updated.id,
                        followUpNo: updated.followUpId,
                        result: updated.result,
                        resolutionStatus: effectiveResolution,
                        maker: updated.evaluatorId,
                        checker: updated.approvedBy,
                        approvalDate: updated.approvedAt,
                        currentStatus: updated.currentStatusDetail,
                    },
                }, tx);
                if (effectiveResolution === 'ERTELENDI') {
                    await tx.auditLog.create({
                        data: {
                            userId, action: 'FOLLOWUP_POSTPONED', entityType: 'FindingFollowUp', entityId: updated.id,
                            oldValue: { status: followUp.status, resolutionOutcome: followUp.resolutionOutcome },
                            newValue: { status: 'ONAYLANDI', resolutionOutcome: 'ERTELENDI', approvedBy: userId, approvedAt: updated.approvedAt },
                        },
                    });
                }
            }

            let createdAction: { id: string; actionId: string } | null = null;
            if (updated.actionId && approvalRequestedNow && wonApprovalRace) {
                const resolvedResult = updated.result;
                if (resolvedResult === 'YETERLI') {
                    await tx.action.update({ where: { id: updated.actionId }, data: { status: 'KAPATILDI', completedAt: new Date() } });
                    await this.recordAuditTrail({ findingId, actionId: updated.actionId, operation: 'ACTION_CLOSED', userId, explanation: 'Takip sonucu yeterli — aksiyon kapatıldı.' }, tx);
                    await this.checkAndCloseFindinIfAllActionsClosed(findingId, userId, tx);
                } else if (resolvedResult === 'YETERSIZ') {
                    await tx.action.update({ where: { id: updated.actionId }, data: { status: 'YETERSIZ' } });
                    await this.recordAuditTrail({ findingId, actionId: updated.actionId, operation: 'ACTION_UPDATED', userId, explanation: 'Takip sonucu yetersiz — aksiyon durumu güncellendi.' }, tx);
                    if (updated.resolutionOutcome === 'ERTELENDI' && updated.newFollowUpDate) {
                        const existing = await tx.findingFollowUp.findFirst({ where: { findingId, actionId: updated.actionId, plannedDate: updated.newFollowUpDate, status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR'] } } });
                        const actionForNo = await tx.action.findUnique({ where: { id: updated.actionId }, select: { id: true, actionId: true } });
                        if (!actionForNo) throw new BadRequestException('Takibin bağlı olduğu aksiyon bulunamadı.');
                        // Yeni takip, onaylanan takibin birinci/ikinci kontrolcüsüyle açılır ve ona bağlanır.
                        const successor = existing || await tx.findingFollowUp.create({ data: {
                            followUpId: await this.generateFollowUpId(actionForNo.id, actionForNo.actionId, tx), findingId, actionId: updated.actionId,
                            plannedDate: updated.newFollowUpDate, status: 'BEKLIYOR', notes: updated.explanation,
                            assigneeId: updated.assigneeId, secondControllerId: updated.secondControllerId,
                        } });
                        await this.linkSuccessorFollowUp(findingId, updated, successor, null, userId, tx);
                    }
                } else if (resolvedResult === 'YENI_AKSIYON_GEREKLI') {
                    if (!effectiveNewAction) {
                        throw new BadRequestException('YENI_AKSIYON_GEREKLI takibinde onaylanacak yeni aksiyon taslağı bulunamadı.');
                    }
                    createdAction = await this.createAction(findingId, {
                        description: effectiveNewAction.description,
                        ownerId: effectiveNewAction.ownerId,
                        directorateId: effectiveNewAction.directorateId,
                        dueDate: effectiveNewAction.dueDate,
                        notes: effectiveNewAction.notes,
                        status: 'BEKLIYOR',
                        // Yeni aksiyonun kontrolcüleri onaylanan takibinkilerdir.
                        firstControllerId: updated.assigneeId ?? undefined,
                        secondControllerId: updated.secondControllerId ?? undefined,
                    }, userId, tx, { preApproved: true });
                    await this.recordAuditTrail({
                        findingId, followUpId: updated.id, actionId: createdAction.id,
                        operation: 'ACTION_CREATED', userId,
                        explanation: `${updated.followUpId} sonucunda yeni düzeltici aksiyon oluşturuldu: ${createdAction.actionId}.`,
                    }, tx);
                    // Yeni aksiyonun hedef tarihinde otomatik açılan takip, bu takibin devamıdır.
                    const successor = await tx.findingFollowUp.findFirst({
                        where: { actionId: createdAction.id, status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR'] } }, orderBy: { createdAt: 'desc' },
                    });
                    if (successor) await this.linkSuccessorFollowUp(findingId, updated, successor, createdAction, userId, tx);
                }
            }

            if (effectsBefore) await this.captureFollowUpEffectsAfter(effectsBefore, updated, createdAction?.id ?? null, tx);

            await tx.auditLog.create({
                data: { userId, action: 'UPDATE', entityType: 'FindingFollowUp', entityId: followUpId, newValue: updated },
            });

            return { updated, createdAction };
        }, { timeout: 20000 });

        if ('lostRace' in txOut) {
            // Paralel istek onayı gerçekleştirdi — mevcut durumu döndür (idempotent).
            const current = await this.prisma.findingFollowUp.findUnique({
                where: { id: followUpId },
                include: { nextFollowUp: { select: { id: true, followUpId: true } } },
            });
            return { ...current, createdAction: null, createdFollowUp: current?.nextFollowUp ?? null };
        }
        return {
            ...txOut.updated,
            createdAction: txOut.createdAction
                ? { id: txOut.createdAction.id, actionId: txOut.createdAction.actionId }
                : null,
            createdFollowUp: null,
        };
    }

    /**
     * İkinci kontrolcü ataması — genel takip güncellemesinden AYRI, korumalı işlem
     * (Madde 4). Yetkili yönetici + gerekçe + hedef kullanıcı aktif + değerlendiren
     * ikinci kontrolcü olamaz + onaylanmış kayıt değiştirilemez. Eski/yeni atama loglanır.
     */
    async assignSecondController(
        findingId: string,
        followUpId: string,
        body: { secondControllerId: string; reason: string },
        userId: string,
        userRole?: string,
    ) {
        if (!FOLLOWUP_APPROVER_ROLES.has(normalizeRole(userRole))) {
            throw new ForbiddenException('İkinci kontrolcü atama yetkiniz yok.');
        }
        if (!body?.secondControllerId) throw new BadRequestException('secondControllerId zorunludur.');
        if (!body?.reason?.trim()) throw new BadRequestException('Atama gerekçesi zorunludur.');

        const followUp = await this.prisma.findingFollowUp.findFirst({ where: { id: followUpId, findingId } });
        if (!followUp) throw new NotFoundException(`FollowUp ${followUpId} not found`);
        if (followUp.approvalStatus === 'ONAYLANDI' || followUp.status === 'ONAYLANDI') {
            throw new BadRequestException('Onaylanmış takip kaydının ikinci kontrolcüsü değiştirilemez.');
        }

        const target = await this.prisma.user.findUnique({
            where: { id: body.secondControllerId }, select: { id: true, isActive: true, role: { select: { name: true } } },
        });
        if (!target || !target.isActive) {
            throw new BadRequestException('Hedef kullanıcı bulunamadı veya aktif değil.');
        }
        // Onaylayamayacak biri atanırsa takip çıkmaza girer.
        if (!FOLLOWUP_APPROVER_ROLES.has(normalizeRole(target.role?.name))) {
            throw new BadRequestException('Seçilen kullanıcı takip onayı verme yetkisine sahip değil; ikinci kontrolcü olamaz.');
        }
        if (followUp.evaluatorId && followUp.evaluatorId === body.secondControllerId) {
            throw new BadRequestException('Değerlendirmeyi yapan kişi ikinci kontrolcü olarak atanamaz.');
        }
        if (followUp.assigneeId && followUp.assigneeId === body.secondControllerId) {
            throw new BadRequestException('Birinci kontrolcü aynı takibin ikinci kontrolcüsü olamaz.');
        }

        const previous = followUp.secondControllerId ?? null;
        const updated = await this.prisma.$transaction(async (tx) => {
            const u = await tx.findingFollowUp.update({
                where: { id: followUpId }, data: { secondControllerId: body.secondControllerId },
            });
            await this.recordAuditTrail({
                findingId, followUpId,
                operation: 'SECOND_CONTROLLER_ASSIGNED',
                userId,
                fieldName: 'secondControllerId',
                oldValue: previous,
                newValue: body.secondControllerId,
                explanation: `İkinci kontrolcü atandı/değiştirildi. Gerekçe: ${body.reason.trim()}`,
            }, tx);
            await tx.auditLog.create({
                data: {
                    userId, action: 'UPDATE', entityType: 'FindingFollowUp', entityId: followUpId,
                    oldValue: { secondControllerId: previous },
                    newValue: { secondControllerId: body.secondControllerId, reason: body.reason.trim() },
                },
            });
            return u;
        });
        return updated;
    }

    /**
     * Birinci kontrolcüyü (maker) yeniden atama — atanan kişi pasife alındığında/ayrıldığında
     * takip çıkmazda kalmasın. Kurallar:
     *  - yalnız takip onaylayabilen yetkili yönetici; gerekçe zorunlu; denetim kaydı
     *  - onaylanmış takip değişmez (tarihsel aktörler korunur); onay bekleyen takipte önce ret
     *  - yeni kişi aktif ve değerlendirme yapabilen rolde; ikinci kontrolcüyle aynı kişi olamaz
     *  - yönetici kendini maker atayamaz (yeniden atama ile maker/checker ayrılığı aşılmasın)
     *  - mevcut taslak değerlendirmenin sahipliği düşer (evaluatorId temizlenir); yeni maker
     *    kaydettiğinde değerlendiren o olur. İçerik silinmez.
     */
    /**
     * Yeniden atama adayları — reassignFollowUpAssignee ile AYNI kural: aktif, takip
     * değerlendirme rolüne sahip, takibin ikinci kontrolcüsü olmayan kullanıcılar.
     * Seçim listesi için asgari alan döner.
     */
    async getFollowUpAssigneeCandidates(findingId: string, followUpId: string) {
        const followUp = await this.prisma.findingFollowUp.findFirst({ where: { id: followUpId, findingId }, select: { secondControllerId: true } });
        if (!followUp) throw new NotFoundException('Takip çalışması bulunamadı');
        const users = await this.prisma.user.findMany({
            where: { isActive: true, role: { name: { in: [...FOLLOWUP_EVALUATOR_ROLES] } }, ...(followUp.secondControllerId ? { id: { not: followUp.secondControllerId } } : {}) },
            select: { id: true, firstName: true, lastName: true, department: true },
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        });
        return users;
    }

    async reassignFollowUpAssignee(
        findingId: string,
        followUpId: string,
        body: { assigneeId: string; reason: string },
        userId: string,
        userRole?: string,
    ) {
        if (!FOLLOWUP_APPROVER_ROLES.has(normalizeRole(userRole))) {
            throw new ForbiddenException('Birinci kontrolcüyü yeniden atama yetkiniz yok.');
        }
        if (!body?.reason?.trim()) throw new BadRequestException('Yeniden atama gerekçesi zorunludur.');
        if (body.assigneeId === userId) {
            throw new BadRequestException('Kendinizi birinci kontrolcü olarak atayamazsınız; değerlendirme atanan kişi tarafından yapılır.');
        }
        const followUp = await this.prisma.findingFollowUp.findFirst({ where: { id: followUpId, findingId } });
        if (!followUp) throw new NotFoundException('Takip çalışması bulunamadı');
        if (followUp.status === 'ONAYLANDI' || followUp.approvalStatus === 'ONAYLANDI') {
            throw new ConflictException('Onaylanmış takip tarihsel kayıttır; birinci kontrolcüsü değiştirilemez.');
        }
        if (followUp.status === 'TAMAMLANDI' && followUp.approvalStatus === 'BEKLIYOR') {
            throw new ConflictException('Onay bekleyen takipte birinci kontrolcü değiştirilemez; önce değerlendirmeyi gerekçeyle reddedin.');
        }
        if (followUp.secondControllerId && followUp.secondControllerId === body.assigneeId) {
            throw new BadRequestException('İkinci kontrolcü aynı takibin birinci kontrolcüsü olamaz.');
        }
        const target = await this.prisma.user.findUnique({
            where: { id: body.assigneeId }, select: { isActive: true, role: { select: { name: true } } },
        });
        if (!target || !target.isActive) throw new BadRequestException('Hedef kullanıcı bulunamadı veya aktif değil.');
        if (!FOLLOWUP_EVALUATOR_ROLES.has(normalizeRole(target.role?.name))) {
            throw new BadRequestException('Seçilen kullanıcı takip değerlendirmesi yapma yetkisine sahip değil.');
        }

        const previous = { assigneeId: followUp.assigneeId ?? null, evaluatorId: followUp.evaluatorId ?? null };
        return this.prisma.$transaction(async (tx) => {
            // Koşullu: bu arada onaya gönderildiyse/onaylandıysa yeniden atama yapılmaz.
            const res = await tx.findingFollowUp.updateMany({
                where: {
                    id: followUpId,
                    status: { not: 'ONAYLANDI' },
                    NOT: [{ status: 'TAMAMLANDI', approvalStatus: 'BEKLIYOR' }, { approvalStatus: 'ONAYLANDI' }],
                },
                data: { assigneeId: body.assigneeId, evaluatorId: null, evaluatedAt: null },
            });
            if (res.count !== 1) throw new ConflictException('Takip bu sırada değişti; yeniden atama yapılmadı.');
            await this.recordAuditTrail({
                findingId, followUpId, operation: 'FIRST_CONTROLLER_REASSIGNED', userId,
                fieldName: 'assigneeId', oldValue: previous.assigneeId, newValue: body.assigneeId,
                explanation: `Birinci kontrolcü yeniden atandı. Gerekçe: ${body.reason.trim()}`,
            }, tx);
            await tx.auditLog.create({
                data: {
                    userId, action: 'FOLLOWUP_REASSIGN', entityType: 'FindingFollowUp', entityId: followUpId,
                    oldValue: previous,
                    newValue: { assigneeId: body.assigneeId, evaluatorId: null, reason: body.reason.trim() },
                },
            });
            return tx.findingFollowUp.findUniqueOrThrow({ where: { id: followUpId } });
        });
    }

    // ─── Actions Finding-Scoped CRUD ──────────────────────────────────────────

    // Atomik sayaç — yarış-koşulu güvenli, retry gerektirmez, transaction içinde güvenli.
    async generateActionId(finding: { id: string; findingId: string }, db: PrismaLike = this.prisma): Promise<string> {
        return nextActionNo(db, finding.id, finding.findingId);
    }

    private async generateFollowUpId(actionInternalId: string, actionNo: string, db: PrismaLike = this.prisma): Promise<string> {
        return nextFollowUpNo(db, actionInternalId, actionNo);
    }

    private async resolveFollowUpAssignment(
        findingId: string,
        actionOwnerId: string | null,
        db: PrismaLike = this.prisma,
    ): Promise<{ assigneeId: string | null; secondControllerId: string | null }> {
        const finding = await db.finding.findUnique({
            where: { id: findingId },
            select: {
                assigneeId: true,
                controlTest: { select: { assigneeId: true, secondControllerId: true } },
            },
        });
        return {
            // ControlTest bu bulgu zincirindeki gerçek görevdir. Legacy kayıtlarda
            // bulgu/aksiyon ataması geriye uyumlu fallback olarak korunur.
            assigneeId: finding?.controlTest?.assigneeId ?? finding?.assigneeId ?? actionOwnerId ?? null,
            secondControllerId: finding?.controlTest?.secondControllerId ?? null,
        };
    }

    async getActions(findingId: string, scope?: Prisma.ActionWhereInput | null) {
        const finding = await this.prisma.finding.findUnique({ where: { id: findingId }, select: { id: true } });
        if (!finding) throw new NotFoundException(`Finding ${findingId} not found`);

        return this.prisma.action.findMany({
            where: scope ? { AND: [{ findingId }, scope] } : { findingId },
            include: {
                owner: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Bulguya bağlı aksiyon oluşturma — ORTAK DOMAIN KURALI (Madde 2). Aksiyon +
     * otomatik takip + bulgu hedef tarihi + audit; hepsi tek transaction'da.
     * `db` verilirse (dış transaction) o istemci kullanılır, yeni transaction açılmaz.
     */
    /**
     * Onaylanan takibin devamı olan yeni takip çalışmasını ona bağlar ve eski takibin Güncel
     * Durum alanına + bulgunun Güncel Durum günlüğüne "Aksiyon, {tarih} tarihli {kod} kodlu
     * Bulgu Takip Çalışması ile takip edilecek." notunu yazar. Onay transaction'ı içinde çalışır.
     */
    private async linkSuccessorFollowUp(
        findingId: string,
        source: { id: string; followUpId: string; currentStatusDetail: string | null; actionId: string | null },
        successor: { id: string; followUpId: string; plannedDate: Date | null; previousFollowUpId: string | null },
        newAction: { id: string; actionId: string } | null,
        userId: string,
        tx: PrismaLike,
    ) {
        if (!successor.previousFollowUpId) {
            const taken = await tx.findingFollowUp.findFirst({ where: { previousFollowUpId: source.id }, select: { id: true } });
            if (!taken) await tx.findingFollowUp.update({ where: { id: successor.id }, data: { previousFollowUpId: source.id } });
        }
        const date = successor.plannedDate
            ? successor.plannedDate.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })
            : 'tarihi belirlenecek';
        const note = newAction
            ? `Yeni aksiyon ${newAction.actionId} oluşturuldu. Aksiyon, ${date} tarihli ${successor.followUpId} kodlu Bulgu Takip Çalışması ile takip edilecek.`
            : `Aksiyon, ${date} tarihli ${successor.followUpId} kodlu Bulgu Takip Çalışması ile takip edilecek.`;
        const detail = source.currentStatusDetail?.trim() ? `${source.currentStatusDetail.trim()}\n\n${note}` : note;
        await tx.findingFollowUp.update({
            where: { id: source.id },
            data: { currentStatusDetail: detail, ...(newAction ? { newActionId: newAction.id } : {}) },
        });
        await this.appendStatusLog(findingId, `${new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })} — ${source.followUpId}: ${note}`, userId, undefined, source.id, tx);
        await this.recordAuditTrail({
            findingId, followUpId: successor.id, actionId: (newAction?.id ?? source.actionId) || undefined,
            operation: 'FOLLOWUP_SUCCESSOR_CREATED', userId, explanation: `${source.followUpId} → ${successor.followUpId}. ${note}`,
            oldValue: { sourceFollowUpId: source.id, sourceFollowUpNo: source.followUpId },
            newValue: { followUpId: successor.id, followUpNo: successor.followUpId, plannedDate: successor.plannedDate, newActionId: newAction?.id ?? null },
        }, tx);
        await tx.auditLog.create({
            data: {
                userId, action: 'FOLLOWUP_SUCCESSOR_CREATED', entityType: 'FindingFollowUp', entityId: successor.id,
                oldValue: { sourceFollowUpId: source.id }, newValue: { followUpNo: successor.followUpId, plannedDate: successor.plannedDate, note },
            },
        });
    }

    /**
     * Aksiyon oluşturma. Normal yol: birinci kontrolcünün TASLAK aksiyonu — takip çalışması
     * yalnız ikinci kontrolcü onayında oluşur. `preApproved`: ikinci kontrolcünün onayladığı
     * bir takip sonucunda doğan aksiyon (onay zaten verildi) — onaylı oluşur ve takibi açılır.
     */
    async createAction(findingId: string, data: any, userId: string, db?: PrismaLike, opts: { preApproved?: boolean; actorRole?: string } = {}) {
        const run = async (tx: PrismaLike) => {
            const finding = await tx.finding.findUnique({ where: { id: findingId }, include: { controlTest: { select: { assigneeId: true, secondControllerId: true } } } });
            if (!finding) throw new NotFoundException(`Finding ${findingId} not found`);
            if (finding.status === 'CLOSED' || finding.workflowStatus === 'IPTAL') {
                throw new BadRequestException('Kapalı veya iptal edilmiş bulguya yeni aksiyon eklenemez.');
            }
            const findingFirst = finding.firstControllerId ?? finding.controlTest?.assigneeId ?? finding.assigneeId ?? null;
            // Aksiyon girişi bulgunun birinci kontrolcüsünündür (kontrolcüsü olmayan eski bulgularda rol yeterli).
            if (!opts.preApproved && findingFirst && findingFirst !== userId && opts.actorRole !== undefined) {
                throw new ForbiddenException('Bu bulguya aksiyonu yalnızca bulgunun birinci kontrolcüsü girebilir.');
            }
            const controllers = await this.resolveControllerPair(
                { first: data.firstControllerId, second: data.secondControllerId },
                { first: findingFirst ?? userId, second: finding.secondControllerId ?? finding.controlTest?.secondControllerId ?? null },
                tx,
            );

            if (data.ownerId) {
                const ownerExists = await tx.user.findUnique({ where: { id: data.ownerId }, select: { id: true } });
                if (!ownerExists) throw new BadRequestException('Geçersiz kullanıcı: aksiyon sorumlusu bulunamadı');
            }
            let directorateName: string | null = null;
            if (data.directorateId) {
                const dir = await tx.directorate.findUnique({ where: { id: data.directorateId }, select: { id: true, name: true } });
                if (!dir) throw new BadRequestException('Geçersiz birim: seçilen sorumlu birim bulunamadı');
                directorateName = dir.name;
            }
            if (!data.dueDate || isNaN(new Date(data.dueDate).getTime())) {
                throw new BadRequestException('Geçerli bir termin (dueDate) zorunludur.');
            }
            const dueDate = new Date(data.dueDate);

            const action = await tx.action.create({
                data: {
                    actionId: await this.generateActionId(finding, tx),
                    findingId,
                    description: data.description,
                    ownerId: data.ownerId,
                    responsibleDepartment: data.responsibleDepartment || directorateName,
                    directorateId: data.directorateId || null,
                    dueDate,
                    notes: data.notes || null,
                    status: data.status || 'BEKLIYOR',
                    controlId: finding.controlId,
                    riskId: finding.riskId,
                    firstControllerId: controllers.first,
                    secondControllerId: controllers.second,
                    ...(opts.preApproved ? { approvalState: 'ONAYLANDI' as const, approvedById: userId, approvedAt: new Date() } : { approvalState: 'TASLAK' as const }),
                },
                include: { owner: { select: { id: true, firstName: true, lastName: true } } },
            });

            if (opts.preApproved) {
                const fu = await this.autoCreateFollowUpForAction(action.id, action.actionId, findingId, dueDate, finding, userId, tx);
                await tx.action.update({ where: { id: action.id }, data: { approvalEffects: { followUpId: fu.id, followUpCreated: fu.created } } });
            }
            await this.recalculateFindingTargetDate(findingId, tx);
            await tx.auditLog.create({
                data: { userId, action: 'CREATE', entityType: 'Action', entityId: action.id, newValue: action },
            });
            return action;
        };
        return db ? run(db) : this.prisma.$transaction((tx) => run(tx));
    }

    // dueDate değiştiğinde takip çalışmasını yeniden üret
    private async autoCreateFollowUpForAction(
        actionId: string,
        actionNo: string,
        findingId: string,
        dueDate: Date,
        finding: any,
        userId: string,
        db: PrismaLike = this.prisma,
    ) {
        const action = await db.action.findUnique({ where: { id: actionId }, select: { ownerId: true, firstControllerId: true, secondControllerId: true } });
        const resolved = await this.resolveFollowUpAssignment(findingId, action?.ownerId ?? null, db);
        // Takip çalışması varsayılan olarak aksiyonun kontrolcülerini devralır (zincir: kontrol → bulgu → aksiyon → takip).
        const assignment = {
            assigneeId: action?.firstControllerId ?? resolved.assigneeId,
            secondControllerId: action?.secondControllerId ?? resolved.secondControllerId,
        };
        // Eğer bu aksiyon için zaten BEKLIYOR/DEVAM_EDIYOR durumunda bir takip var → güncelle
        const existing = await db.findingFollowUp.findFirst({
            where: { actionId, status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR'] } },
        });

        let result: { id: string; created: boolean };
        if (existing) {
            await db.findingFollowUp.update({
                where: { id: existing.id },
                data: { plannedDate: dueDate },
            });
            result = { id: existing.id, created: false };
        } else {
            const createdFu = await db.findingFollowUp.create({
                data: {
                    followUpId: await this.generateFollowUpId(actionId, actionNo, db),
                    findingId,
                    actionId,
                    status: 'BEKLIYOR',
                    plannedDate: dueDate,
                    assigneeId: assignment.assigneeId,
                    secondControllerId: assignment.secondControllerId,
                },
            });
            result = { id: createdFu.id, created: true };
        }

        await db.findingStatusHistory.create({
            data: {
                findingId,
                evaluator: userId,
                changeType: 'ACTION_CREATED',
                explanation: `Aksiyon oluşturuldu. Takip tarihi: ${dueDate.toLocaleDateString('tr-TR')}`,
            },
        });
        return result;
    }

    /**
     * Bulguya bağlı aksiyon güncelleme — ORTAK DOMAIN KURALI (Madde 2). `/actions`
     * ve `/findings/:id/actions` giriş noktalarının ikisi de buraya gelir.
     * dueDate değişiminde takip planı ve bulgu hedef tarihi güncellenir; hepsi tek
     * transaction içinde + audit. Onaylı biçimde kapatılmış aksiyon (KAPATILDI)
     * içerik/tarih/durum değişimine kapalıdır.
     */
    async updateAction(findingId: string, actionId: string, data: any, userId: string, opts: { extension?: boolean; progress?: boolean } = {}) {
        const action = await this.prisma.action.findFirst({ where: { id: actionId, findingId } });
        if (!action) throw new NotFoundException(`Action ${actionId} not found under finding ${findingId}`);
        // Tanım değişikliği (açıklama, sorumlu, termin, kontrolcüler) maker-checker'a tabidir: yalnız
        // birinci kontrolcü, taslak/reddedilmiş aksiyonda. İlerleme notu/durumu onaylı aksiyonda da
        // güncellenebilir (yetki çağıran uçta). Süre uzatma (extension) ayrı, gerekçeli akıştır.
        const definitionChange =
            (data.description !== undefined && data.description !== action.description) ||
            (data.ownerId !== undefined && data.ownerId !== action.ownerId) ||
            (data.responsibleDepartment !== undefined && (data.responsibleDepartment || null) !== action.responsibleDepartment) ||
            (data.dueDate !== undefined && !opts.extension && new Date(data.dueDate).getTime() !== action.dueDate.getTime()) ||
            data.firstControllerId !== undefined || data.secondControllerId !== undefined;
        if (action.deletedAt || action.status === 'IPTAL') throw new ConflictException('Silinmiş veya iptal edilmiş aksiyon düzenlenemez.');
        if (action.deletionRequestedAt) throw new ConflictException('Silme onayı bekleyen aksiyon düzenlenemez.');
        // Bulgu ekranındaki düzenleme (birinci kontrolcü) her zaman maker-checker'a tabidir; aksiyon
        // sorumlusunun ilerleme güncellemesi (progress) yalnız tanım değiştirirse.
        if (definitionChange || (!opts.progress && !opts.extension)) this.assertActionEditable(action, userId);
        let controllerData: { firstControllerId?: string | null; secondControllerId?: string | null } = {};
        if (data.firstControllerId !== undefined || data.secondControllerId !== undefined) {
            const pair = await this.resolveControllerPair(
                { first: data.firstControllerId !== undefined ? (data.firstControllerId || null) : action.firstControllerId,
                  second: data.secondControllerId !== undefined ? (data.secondControllerId || null) : action.secondControllerId },
                { first: null, second: null }, this.prisma, true,
            );
            controllerData = { firstControllerId: pair.first, secondControllerId: pair.second };
        }

        if (action.status === 'KAPATILDI' || action.status === 'CLOSED') {
            const changesCore =
                (data.description !== undefined && data.description !== action.description) ||
                (data.dueDate !== undefined) ||
                (data.status !== undefined && data.status !== action.status);
            if (changesCore) {
                throw new BadRequestException(
                    'Onaylı biçimde kapatılmış aksiyonun içeriği/tarihi/durumu değiştirilemez.',
                );
            }
        }
        if (data.ownerId) {
            const ownerExists = await this.prisma.user.findUnique({ where: { id: data.ownerId }, select: { id: true } });
            if (!ownerExists) throw new BadRequestException('Geçersiz kullanıcı: aksiyon sorumlusu bulunamadı');
        }

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.action.update({
                where: { id: actionId },
                data: {
                    description: data.description || undefined,
                    ownerId: data.ownerId || undefined,
                    responsibleDepartment: data.responsibleDepartment !== undefined ? (data.responsibleDepartment || null) : undefined,
                    dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
                    notes: data.notes !== undefined ? (data.notes || null) : undefined,
                    extensionReason: data.extensionReason !== undefined ? (data.extensionReason || null) : undefined,
                    extensionApproved: data.extensionApproved !== undefined ? !!data.extensionApproved : undefined,
                    status: data.status || undefined,
                    ...controllerData,
                },
                include: { owner: { select: { id: true, firstName: true, lastName: true } } },
            });
            // Takip çalışması burada üretilmez: taslak aksiyon ikinci kontrolcü onayında takibini açar.
            // Onaylı aksiyonda süre uzatma: açık takibin planlanan tarihi yeni termine taşınır.
            if (opts.extension && data.dueDate && action.approvalState === 'ONAYLANDI') {
                const finding = await tx.finding.findUnique({ where: { id: findingId }, select: { id: true, findingId: true, findingType: true } });
                await this.autoCreateFollowUpForAction(actionId, action.actionId, findingId, new Date(data.dueDate), finding, userId, tx);
            }
            await this.recalculateFindingTargetDate(findingId, tx);
            await tx.auditLog.create({
                data: { userId, action: 'UPDATE', entityType: 'Action', entityId: actionId, oldValue: action, newValue: updated },
            });
            return updated;
        });
    }

    /** Eski uç (DELETE): artık doğrudan silmez, ikinci kontrolcü onayına silme talebi açar. */
    async deleteAction(findingId: string, actionId: string, userId: string, reason?: string) {
        return this.requestActionDeletion(findingId, actionId, reason ?? '', userId);
    }

    // ═══ Kontrolcü zinciri ve maker-checker (aksiyon / takip çalışması) ═══════════════════════
    //
    // Zincir: kontrol noktası (Yıllık Plan dönem kontrolü → kontrol testi) → bulgu → aksiyon →
    // takip çalışması. Her seviye bir üsttekini varsayılan alır, değiştirilebilir.
    // Birinci kontrolcü (maker) taslağı girer/düzenler ve onaya gönderir; ikinci kontrolcü
    // (checker) onaylar, gerekçeyle reddeder, onayı gerekçeyle geri alır ve silme taleplerini
    // sonuçlandırır. Silme "Silindi" işaretidir (status=IPTAL + deletedAt), kayıt korunur.

    /**
     * Birinci/ikinci kontrolcü çiftini çözer ve doğrular. Açıkça seçilen değerler hatalıysa
     * 400 döner; varsayılandan gelen ikinci kontrolcü birinciyle aynıysa sessizce boşaltılır.
     */
    private async resolveControllerPair(
        explicit: { first?: string | null; second?: string | null },
        defaults: { first: string | null; second: string | null },
        db: PrismaLike,
        strict = false,
    ): Promise<{ first: string | null; second: string | null }> {
        const firstGiven = explicit.first !== undefined && explicit.first !== null && explicit.first !== '';
        const secondGiven = explicit.second !== undefined && explicit.second !== null && explicit.second !== '';
        let first = firstGiven ? explicit.first as string : (strict && explicit.first === null ? null : defaults.first);
        let second = secondGiven ? explicit.second as string : (strict && explicit.second === null ? null : defaults.second);
        if (first) {
            const u = await db.user.findUnique({ where: { id: first }, select: { isActive: true } });
            if (!u || !u.isActive) {
                if (firstGiven || strict) throw new BadRequestException('Geçersiz birinci kontrolcü: kullanıcı bulunamadı veya aktif değil.');
                first = null;
            }
        }
        if (second) {
            const u = await db.user.findUnique({ where: { id: second }, select: { isActive: true, role: { select: { name: true } } } });
            const eligible = !!u && u.isActive && FOLLOWUP_APPROVER_ROLES.has(normalizeRole(u.role?.name));
            if (!eligible) {
                if (secondGiven || strict) throw new BadRequestException('Geçersiz ikinci kontrolcü: kullanıcı aktif değil veya onay yetkisine sahip değil.');
                second = null;
            }
        }
        if (first && second && first === second) {
            if (firstGiven || secondGiven || strict) throw new BadRequestException('Birinci ve ikinci kontrolcü aynı kişi olamaz.');
            second = null;
        }
        return { first, second };
    }

    private assertActionEditable(action: any, userId: string) {
        if (action.deletedAt || action.status === 'IPTAL') throw new ConflictException('Silinmiş veya iptal edilmiş aksiyon düzenlenemez.');
        if (action.deletionRequestedAt) throw new ConflictException('Silme onayı bekleyen aksiyon düzenlenemez.');
        if (action.approvalState === 'ONAY_BEKLIYOR') throw new ConflictException('İkinci kontrolcü onayında bekleyen aksiyon düzenlenemez.');
        if (action.approvalState === 'ONAYLANDI') throw new ConflictException('Onaylanmış aksiyon düzenlenemez; düzenlemek için ikinci kontrolcünün onayı geri alması gerekir.');
        if (action.firstControllerId && action.firstControllerId !== userId) throw new ForbiddenException('Aksiyonu yalnızca birinci kontrolcüsü düzenleyebilir.');
    }

    private async loadAction(findingId: string, actionId: string, db: PrismaLike = this.prisma) {
        const action = await db.action.findFirst({ where: { id: actionId, findingId } });
        if (!action) throw new NotFoundException('Aksiyon bulunamadı');
        return action;
    }

    private requireSecondController(record: { secondControllerId: string | null }, userId: string, what: string) {
        if (!record.secondControllerId) throw new BadRequestException(`Bu ${what} için ikinci kontrolcü atanmamış.`);
        if (record.secondControllerId !== userId) throw new ForbiddenException(`Bu işlemi yalnızca ${what} ikinci kontrolcüsü yapabilir.`);
    }

    async submitAction(findingId: string, actionId: string, userId: string) {
        const action = await this.loadAction(findingId, actionId);
        if (!['TASLAK', 'REDDEDILDI'].includes(action.approvalState)) throw new ConflictException('Yalnızca taslak veya reddedilmiş aksiyon onaya gönderilebilir.');
        this.assertActionEditable(action, userId);
        if (!action.secondControllerId) throw new BadRequestException('Onaya göndermek için aksiyonun ikinci kontrolcüsü seçilmelidir.');
        if (action.secondControllerId === userId) throw new BadRequestException('Birinci ve ikinci kontrolcü aynı kişi olamaz.');
        return this.prisma.$transaction(async (tx) => {
            const claim = await tx.action.updateMany({
                where: { id: actionId, approvalState: { in: ['TASLAK', 'REDDEDILDI'] }, deletionRequestedAt: null },
                data: { approvalState: 'ONAY_BEKLIYOR', submittedAt: new Date(), rejectionReason: null },
            });
            if (claim.count !== 1) throw new ConflictException('Aksiyon bu sırada değişti; tekrar deneyin.');
            await this.recordAuditTrail({ findingId, actionId, operation: 'ACTION_SUBMITTED', userId, explanation: `${action.actionId} ikinci kontrolcü onayına gönderildi.` }, tx);
            await tx.auditLog.create({ data: { userId, action: 'ACTION_SUBMIT', entityType: 'Action', entityId: actionId, newValue: { approvalState: 'ONAY_BEKLIYOR' } } });
            return tx.action.findUnique({ where: { id: actionId } });
        });
    }

    async approveAction(findingId: string, actionId: string, userId: string) {
        const action = await this.loadAction(findingId, actionId);
        if (action.approvalState !== 'ONAY_BEKLIYOR') throw new ConflictException('Yalnızca onay bekleyen aksiyon onaylanabilir.');
        this.requireSecondController(action, userId, 'aksiyonun');
        return this.prisma.$transaction(async (tx) => {
            const claim = await tx.action.updateMany({
                where: { id: actionId, approvalState: 'ONAY_BEKLIYOR', secondControllerId: userId },
                data: { approvalState: 'ONAYLANDI', approvedById: userId, approvedAt: new Date(), rejectionReason: null, revertReason: null, revertedAt: null },
            });
            if (claim.count !== 1) throw new ConflictException('Aksiyon bu sırada değişti; tekrar deneyin.');
            const finding = await tx.finding.findUnique({ where: { id: findingId }, select: { id: true, findingId: true, findingType: true } });
            // Onayla birlikte aksiyonun takip çalışması açılır (hedef tarihte).
            const fu = await this.autoCreateFollowUpForAction(actionId, action.actionId, findingId, action.dueDate, finding, userId, tx);
            await tx.action.update({ where: { id: actionId }, data: { approvalEffects: { followUpId: fu.id, followUpCreated: fu.created } } });
            await this.recalculateFindingTargetDate(findingId, tx);
            const fuRow = await tx.findingFollowUp.findUnique({ where: { id: fu.id }, select: { followUpId: true } });
            await this.recordAuditTrail({ findingId, actionId, followUpId: fu.id, operation: 'ACTION_APPROVED', userId, explanation: `${action.actionId} onaylandı; takip çalışması ${fuRow?.followUpId ?? ''} oluşturuldu.` }, tx);
            await tx.auditLog.create({ data: { userId, action: 'ACTION_APPROVE', entityType: 'Action', entityId: actionId, newValue: { approvalState: 'ONAYLANDI', followUpId: fu.id } } });
            return { ...(await tx.action.findUnique({ where: { id: actionId } })), createdFollowUp: fuRow ? { id: fu.id, followUpId: fuRow.followUpId } : null };
        });
    }

    async rejectAction(findingId: string, actionId: string, reason: string, userId: string) {
        if (!reason?.trim()) throw new BadRequestException('Ret gerekçesi zorunludur.');
        const action = await this.loadAction(findingId, actionId);
        if (action.approvalState !== 'ONAY_BEKLIYOR') throw new ConflictException('Yalnızca onay bekleyen aksiyon reddedilebilir.');
        this.requireSecondController(action, userId, 'aksiyonun');
        return this.prisma.$transaction(async (tx) => {
            const claim = await tx.action.updateMany({ where: { id: actionId, approvalState: 'ONAY_BEKLIYOR' }, data: { approvalState: 'REDDEDILDI', rejectionReason: reason.trim() } });
            if (claim.count !== 1) throw new ConflictException('Aksiyon bu sırada değişti; tekrar deneyin.');
            await this.recordAuditTrail({ findingId, actionId, operation: 'ACTION_REJECTED', userId, explanation: `${action.actionId} reddedildi: ${reason.trim()}` }, tx);
            await tx.auditLog.create({ data: { userId, action: 'ACTION_REJECT', entityType: 'Action', entityId: actionId, newValue: { approvalState: 'REDDEDILDI', reason: reason.trim() } } });
            return tx.action.findUnique({ where: { id: actionId } });
        });
    }

    /** Onaylı aksiyonun onayını geri alır: takibinde işlem başlamadıysa takip iptal edilir, aksiyon taslağa döner. */
    async revertAction(findingId: string, actionId: string, reason: string, userId: string) {
        if (!reason?.trim()) throw new BadRequestException('Onayı geri alma gerekçesi zorunludur.');
        const action = await this.loadAction(findingId, actionId);
        if (action.approvalState !== 'ONAYLANDI') throw new ConflictException('Yalnızca onaylanmış aksiyonun onayı geri alınabilir.');
        if (action.deletedAt || action.status === 'IPTAL') throw new ConflictException('Silinmiş aksiyonun onayı geri alınamaz.');
        this.requireSecondController(action, userId, 'aksiyonun');
        const followUps = await this.prisma.findingFollowUp.findMany({ where: { actionId, status: { not: 'IPTAL' } } });
        const started = followUps.filter(f => f.status !== 'BEKLIYOR' || f.result || f.evaluatorId);
        if (started.length) {
            throw new ConflictException(`Aksiyonun takip çalışmasında işlem yapılmış (${started.map(f => f.followUpId).join(', ')}); önce takip çalışmasının onayını geri alın veya takibi silin.`);
        }
        return this.prisma.$transaction(async (tx) => {
            const claim = await tx.action.updateMany({
                where: { id: actionId, approvalState: 'ONAYLANDI', secondControllerId: userId },
                data: { approvalState: 'TASLAK', approvedById: null, approvedAt: null, revertedAt: new Date(), revertReason: reason.trim(), submittedAt: null },
            });
            if (claim.count !== 1) throw new ConflictException('Aksiyon bu sırada değişti; tekrar deneyin.');
            if (followUps.length) {
                await tx.findingFollowUp.updateMany({
                    where: { id: { in: followUps.map(f => f.id) }, status: 'BEKLIYOR', result: null },
                    data: { status: 'IPTAL', notes: `Aksiyon onayı geri alındı: ${reason.trim()}` },
                });
            }
            await this.recalculateFindingTargetDate(findingId, tx);
            await this.recordAuditTrail({
                findingId, actionId, operation: 'ACTION_APPROVAL_REVERTED', userId,
                explanation: `${action.actionId} onayı geri alındı: ${reason.trim()}${followUps.length ? ` — iptal edilen takip: ${followUps.map(f => f.followUpId).join(', ')}` : ''}`,
            }, tx);
            await tx.auditLog.create({ data: { userId, action: 'ACTION_REVERT', entityType: 'Action', entityId: actionId, oldValue: { approvalState: 'ONAYLANDI' }, newValue: { approvalState: 'TASLAK', reason: reason.trim(), cancelledFollowUps: followUps.map(f => f.id) } } });
            return tx.action.findUnique({ where: { id: actionId } });
        });
    }

    async requestActionDeletion(findingId: string, actionId: string, reason: string, userId: string) {
        if (!reason?.trim()) throw new BadRequestException('Silme gerekçesi zorunludur.');
        const action = await this.loadAction(findingId, actionId);
        if (action.deletedAt || action.status === 'IPTAL') throw new ConflictException('Aksiyon zaten silinmiş veya iptal edilmiş.');
        if (action.deletionRequestedAt) throw new ConflictException('Bu aksiyon için zaten bekleyen bir silme talebi var.');
        if (action.approvalState === 'ONAY_BEKLIYOR') throw new ConflictException('Onay bekleyen aksiyon için silme talebi açılamaz.');
        if (action.firstControllerId && action.firstControllerId !== userId) throw new ForbiddenException('Silme talebini yalnızca aksiyonun birinci kontrolcüsü açabilir.');
        if (!action.secondControllerId) throw new BadRequestException('Silme talebi için aksiyonun ikinci kontrolcüsü atanmış olmalıdır.');
        await this.prisma.action.update({ where: { id: actionId }, data: { deletionRequestedById: userId, deletionRequestedAt: new Date(), deletionReason: reason.trim(), deletionRejectionReason: null } });
        await this.recordAuditTrail({ findingId, actionId, operation: 'ACTION_DELETE_REQUESTED', userId, explanation: `${action.actionId} için silme talebi: ${reason.trim()}` });
        await this.prisma.auditLog.create({ data: { userId, action: 'ACTION_DELETE_REQUEST', entityType: 'Action', entityId: actionId, newValue: { reason: reason.trim() } } });
        return this.prisma.action.findUnique({ where: { id: actionId } });
    }

    async decideActionDeletion(findingId: string, actionId: string, approve: boolean, reason: string | undefined, userId: string) {
        const action = await this.loadAction(findingId, actionId);
        if (!action.deletionRequestedAt || action.deletedAt) throw new ConflictException('Bu aksiyon için bekleyen silme talebi yok.');
        this.requireSecondController(action, userId, 'aksiyonun');
        if (!approve) {
            if (!reason?.trim()) throw new BadRequestException('Silme talebini reddetme gerekçesi zorunludur.');
            await this.prisma.action.update({ where: { id: actionId }, data: { deletionRequestedAt: null, deletionRequestedById: null, deletionRejectionReason: reason.trim() } });
            await this.recordAuditTrail({ findingId, actionId, operation: 'ACTION_DELETE_REJECTED', userId, explanation: `${action.actionId} silme talebi reddedildi: ${reason.trim()}` });
            await this.prisma.auditLog.create({ data: { userId, action: 'ACTION_DELETE_REJECT', entityType: 'Action', entityId: actionId, newValue: { reason: reason.trim() } } });
            return this.prisma.action.findUnique({ where: { id: actionId } });
        }
        return this.prisma.$transaction(async (tx) => {
            const now = new Date();
            const claim = await tx.action.updateMany({ where: { id: actionId, deletedAt: null, deletionRequestedAt: { not: null } }, data: { status: 'IPTAL', deletedAt: now, deletedById: userId } });
            if (claim.count !== 1) throw new ConflictException('Aksiyon bu sırada değişti; tekrar deneyin.');
            // Aksiyona bağlı takip çalışmaları da silinir (kayıt korunur).
            const fus = await tx.findingFollowUp.findMany({ where: { actionId, deletedAt: null }, select: { id: true, followUpId: true } });
            if (fus.length) await tx.findingFollowUp.updateMany({ where: { id: { in: fus.map(f => f.id) } }, data: { status: 'IPTAL', deletedAt: now, deletedById: userId, deletionReason: `Aksiyon silindi: ${action.deletionReason ?? ''}`.trim() } });
            await this.recalculateFindingTargetDate(findingId, tx);
            await this.recordAuditTrail({ findingId, actionId, operation: 'ACTION_DELETED', userId, explanation: `${action.actionId} silindi (talep: ${action.deletionReason ?? '—'})${fus.length ? ` — silinen takip: ${fus.map(f => f.followUpId).join(', ')}` : ''}` }, tx);
            await tx.auditLog.create({ data: { userId, action: 'DELETE', entityType: 'Action', entityId: actionId, oldValue: action as any, newValue: { deletedAt: now, followUps: fus.map(f => f.id) } } });
            return tx.action.findUnique({ where: { id: actionId } });
        });
    }

    // ── Takip çalışması: onayı geri alma ve onaylı silme ──

    /** Onay yan etkilerinin "önce" durumu (onay transaction'ı içinde, yan etkilerden önce). */
    private async captureFollowUpEffectsBefore(findingId: string, followUp: any, tx: PrismaLike) {
        const [action, finding, openFus] = await Promise.all([
            followUp.actionId ? tx.action.findUnique({ where: { id: followUp.actionId }, select: { id: true, status: true, completedAt: true } }) : null,
            tx.finding.findUnique({ where: { id: findingId }, select: { status: true, resolutionStatus: true, testDate: true, closedDate: true } }),
            tx.findingFollowUp.findMany({ where: { findingId, id: { not: followUp.id }, status: { not: 'IPTAL' } }, select: { id: true, status: true } }),
        ]);
        return {
            action: action ? { id: action.id, status: action.status, completedAt: action.completedAt } : null,
            finding,
            openFollowUps: openFus,
            prevCurrentStatusDetail: followUp.currentStatusDetail ?? null,
            prevNewActionId: followUp.newActionId ?? null,
        };
    }

    private async captureFollowUpEffectsAfter(before: any, followUp: any, createdActionId: string | null, tx: PrismaLike) {
        const nowStatuses = await tx.findingFollowUp.findMany({ where: { id: { in: before.openFollowUps.map((f: any) => f.id) } }, select: { id: true, status: true } });
        const cancelled = before.openFollowUps.filter((f: any) => nowStatuses.find(n => n.id === f.id)?.status === 'IPTAL');
        const successor = await tx.findingFollowUp.findFirst({ where: { previousFollowUpId: followUp.id }, select: { id: true } });
        const successorExisted = !!successor && before.openFollowUps.some((f: any) => f.id === successor.id);
        const effects = {
            version: 1,
            action: before.action, finding: before.finding,
            cancelledFollowUps: cancelled,
            successor: successor ? { id: successor.id, created: !successorExisted } : null,
            createdActionId,
            prevCurrentStatusDetail: before.prevCurrentStatusDetail, prevNewActionId: before.prevNewActionId,
        };
        await tx.findingFollowUp.update({ where: { id: followUp.id }, data: { approvalEffects: effects as unknown as Prisma.InputJsonValue } });
    }

    /** Onaylı takibin onayını geri alır; onayın tüm sonuçları geri çevrilir. */
    async revertFollowUp(findingId: string, followUpId: string, reason: string, userId: string) {
        if (!reason?.trim()) throw new BadRequestException('Onayı geri alma gerekçesi zorunludur.');
        const fu = await this.prisma.findingFollowUp.findFirst({ where: { id: followUpId, findingId } });
        if (!fu) throw new NotFoundException('Takip çalışması bulunamadı');
        if (fu.status !== 'ONAYLANDI') throw new ConflictException('Yalnızca onaylanmış takip çalışmasının onayı geri alınabilir.');
        if (fu.deletedAt) throw new ConflictException('Silinmiş takip çalışmasının onayı geri alınamaz.');
        this.requireSecondController(fu, userId, 'takip çalışmasının');
        const effects = fu.approvalEffects as any;
        if (!effects?.version) throw new ConflictException('Bu takip çalışması önceki akışta onaylandığı için onayın sonuçları bilinmiyor; onay geri alınamaz.');
        // Onayla doğan kayıtlarda işlem başladıysa geri alma engellenir.
        const blockers: string[] = [];
        if (effects.successor?.id) {
            const succ = await this.prisma.findingFollowUp.findUnique({ where: { id: effects.successor.id } });
            if (succ && succ.status !== 'IPTAL' && (succ.status !== 'BEKLIYOR' || succ.result || succ.evaluatorId)) blockers.push(`devam takibi ${succ.followUpId} üzerinde işlem yapılmış`);
        }
        if (effects.createdActionId) {
            const started = await this.prisma.findingFollowUp.findFirst({ where: { actionId: effects.createdActionId, status: { notIn: ['BEKLIYOR', 'IPTAL'] } }, select: { followUpId: true } });
            if (started) blockers.push(`yeni aksiyonun takibi ${started.followUpId} üzerinde işlem yapılmış`);
        }
        if (blockers.length) throw new ConflictException(`Onay geri alınamaz: ${blockers.join('; ')}. Önce o kayıtların onayını geri alın.`);

        return this.prisma.$transaction(async (tx) => {
            const claim = await tx.findingFollowUp.updateMany({
                where: { id: followUpId, status: 'ONAYLANDI', secondControllerId: userId },
                data: {
                    status: 'DEVAM_EDIYOR', approvalStatus: null, approvedBy: null, approvedAt: null,
                    currentStatusDetail: effects.prevCurrentStatusDetail, newActionId: effects.prevNewActionId,
                    revertedAt: new Date(), revertedById: userId, revertReason: reason.trim(), approvalEffects: Prisma.DbNull,
                },
            });
            if (claim.count !== 1) throw new ConflictException('Takip çalışması bu sırada değişti; tekrar deneyin.');
            const now = new Date();
            if (effects.action) await tx.action.update({ where: { id: effects.action.id }, data: { status: effects.action.status, completedAt: effects.action.completedAt ? new Date(effects.action.completedAt) : null } });
            if (effects.finding) {
                await tx.finding.update({
                    where: { id: findingId },
                    data: {
                        status: effects.finding.status, resolutionStatus: effects.finding.resolutionStatus,
                        testDate: effects.finding.testDate ? new Date(effects.finding.testDate) : null,
                        closedDate: effects.finding.closedDate ? new Date(effects.finding.closedDate) : null,
                    },
                });
            }
            for (const c of effects.cancelledFollowUps ?? []) {
                await tx.findingFollowUp.updateMany({ where: { id: c.id, status: 'IPTAL', deletedAt: null }, data: { status: c.status } });
            }
            if (effects.successor?.id) {
                if (effects.successor.created) {
                    await tx.findingFollowUp.update({ where: { id: effects.successor.id }, data: { status: 'IPTAL', deletedAt: now, deletedById: userId, deletionReason: `Önceki takip onayı geri alındı: ${reason.trim()}`, previousFollowUpId: null } });
                } else {
                    await tx.findingFollowUp.update({ where: { id: effects.successor.id }, data: { previousFollowUpId: null } });
                }
            }
            if (effects.createdActionId) {
                await tx.action.update({ where: { id: effects.createdActionId }, data: { status: 'IPTAL', deletedAt: now, deletedById: userId, deletionReason: `Oluşturan takip onayı geri alındı: ${reason.trim()}` } });
                await tx.findingFollowUp.updateMany({ where: { actionId: effects.createdActionId, deletedAt: null }, data: { status: 'IPTAL', deletedAt: now, deletedById: userId } });
            }
            await this.recalculateFindingTargetDate(findingId, tx);
            await this.appendStatusLog(findingId, `${now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })} — ${fu.followUpId} onayı geri alındı: ${reason.trim()}`, userId, undefined, fu.id, tx);
            await this.recordAuditTrail({ findingId, followUpId, actionId: fu.actionId || undefined, operation: 'FOLLOWUP_APPROVAL_REVERTED', userId, explanation: `${fu.followUpId} onayı geri alındı: ${reason.trim()}`, oldValue: effects, newValue: { status: 'DEVAM_EDIYOR' } }, tx);
            await tx.auditLog.create({ data: { userId, action: 'FOLLOWUP_REVERT', entityType: 'FindingFollowUp', entityId: followUpId, oldValue: effects, newValue: { status: 'DEVAM_EDIYOR', reason: reason.trim() } } });
            return tx.findingFollowUp.findUnique({ where: { id: followUpId } });
        }, { timeout: 20000 });
    }

    async requestFollowUpDeletion(findingId: string, followUpId: string, reason: string, userId: string) {
        if (!reason?.trim()) throw new BadRequestException('Silme gerekçesi zorunludur.');
        const fu = await this.prisma.findingFollowUp.findFirst({ where: { id: followUpId, findingId } });
        if (!fu) throw new NotFoundException('Takip çalışması bulunamadı');
        if (fu.deletedAt || fu.status === 'IPTAL') throw new ConflictException('Takip çalışması zaten silinmiş veya iptal edilmiş.');
        if (fu.deletionRequestedAt) throw new ConflictException('Bu takip için zaten bekleyen bir silme talebi var.');
        if (fu.status === 'TAMAMLANDI') throw new ConflictException('Onay bekleyen takip çalışması için silme talebi açılamaz.');
        if (fu.status === 'ONAYLANDI') throw new ConflictException('Onaylanmış takip çalışması silinemez; önce ikinci kontrolcünün onayı geri alması gerekir.');
        if (fu.assigneeId && fu.assigneeId !== userId) throw new ForbiddenException('Silme talebini yalnızca takibin birinci kontrolcüsü açabilir.');
        if (!fu.secondControllerId) throw new BadRequestException('Silme talebi için takibin ikinci kontrolcüsü atanmış olmalıdır.');
        await this.prisma.findingFollowUp.update({ where: { id: followUpId }, data: { deletionRequestedById: userId, deletionRequestedAt: new Date(), deletionReason: reason.trim(), deletionRejectionReason: null } });
        await this.recordAuditTrail({ findingId, followUpId, operation: 'FOLLOWUP_DELETE_REQUESTED', userId, explanation: `${fu.followUpId} için silme talebi: ${reason.trim()}` });
        await this.prisma.auditLog.create({ data: { userId, action: 'FOLLOWUP_DELETE_REQUEST', entityType: 'FindingFollowUp', entityId: followUpId, newValue: { reason: reason.trim() } } });
        return this.prisma.findingFollowUp.findUnique({ where: { id: followUpId } });
    }

    async decideFollowUpDeletion(findingId: string, followUpId: string, approve: boolean, reason: string | undefined, userId: string) {
        const fu = await this.prisma.findingFollowUp.findFirst({ where: { id: followUpId, findingId } });
        if (!fu) throw new NotFoundException('Takip çalışması bulunamadı');
        if (!fu.deletionRequestedAt || fu.deletedAt) throw new ConflictException('Bu takip için bekleyen silme talebi yok.');
        this.requireSecondController(fu, userId, 'takip çalışmasının');
        if (!approve) {
            if (!reason?.trim()) throw new BadRequestException('Silme talebini reddetme gerekçesi zorunludur.');
            await this.prisma.findingFollowUp.update({ where: { id: followUpId }, data: { deletionRequestedAt: null, deletionRequestedById: null, deletionRejectionReason: reason.trim() } });
            await this.recordAuditTrail({ findingId, followUpId, operation: 'FOLLOWUP_DELETE_REJECTED', userId, explanation: `${fu.followUpId} silme talebi reddedildi: ${reason.trim()}` });
            await this.prisma.auditLog.create({ data: { userId, action: 'FOLLOWUP_DELETE_REJECT', entityType: 'FindingFollowUp', entityId: followUpId, newValue: { reason: reason.trim() } } });
            return this.prisma.findingFollowUp.findUnique({ where: { id: followUpId } });
        }
        const now = new Date();
        const claim = await this.prisma.findingFollowUp.updateMany({
            where: { id: followUpId, deletedAt: null, deletionRequestedAt: { not: null }, status: { notIn: ['ONAYLANDI', 'TAMAMLANDI'] } },
            data: { status: 'IPTAL', deletedAt: now, deletedById: userId },
        });
        if (claim.count !== 1) throw new ConflictException('Takip çalışması bu sırada değişti; silinmedi.');
        await this.recordAuditTrail({ findingId, followUpId, actionId: fu.actionId || undefined, operation: 'FOLLOWUP_DELETED', userId, explanation: `${fu.followUpId} silindi (talep: ${fu.deletionReason ?? '—'})` });
        await this.prisma.auditLog.create({ data: { userId, action: 'DELETE', entityType: 'FindingFollowUp', entityId: followUpId, oldValue: fu as any, newValue: { deletedAt: now } } });
        return this.prisma.findingFollowUp.findUnique({ where: { id: followUpId } });
    }

    async recalculateFindingTargetDate(findingId: string, db: PrismaLike = this.prisma) {
        // Silinmiş/iptal aksiyonlar (IPTAL) hedef tarihe katılmaz.
        const actions = await db.action.findMany({
            where: { findingId, status: { notIn: ['KAPATILDI', 'IPTAL'] } },
            select: { dueDate: true },
        });

        if (actions.length > 0) {
            const maxDate = new Date(Math.max(...actions.map(a => new Date(a.dueDate).getTime())));
            await db.finding.update({
                where: { id: findingId },
                data: { targetResolutionDate: maxDate },
            });
        } else {
            const allActions = await db.action.findMany({
                where: { findingId, status: { not: 'IPTAL' } },
                select: { dueDate: true },
            });
            if (allActions.length > 0) {
                const maxDate = new Date(Math.max(...allActions.map(a => new Date(a.dueDate).getTime())));
                await db.finding.update({
                    where: { id: findingId },
                    data: { targetResolutionDate: maxDate },
                });
            } else {
                await db.finding.update({
                    where: { id: findingId },
                    data: { targetResolutionDate: null },
                });
            }
        }
    }

    async checkAndCloseFindinIfAllActionsClosed(findingId: string, userId: string, db: PrismaLike = this.prisma) {
        const actions = await db.action.findMany({
            where: { findingId, status: { not: 'IPTAL' } }, // silinmiş/iptal aksiyonlar kapanışı engellemez
            select: { status: true },
        });

        // Onaylı kapanış = KAPATILDI (veya legacy CLOSED). Yalnız TAMAMLANDI yeterli değil.
        const CLOSED = new Set(['KAPATILDI', 'CLOSED']);
        if (actions.length > 0 && actions.every(a => CLOSED.has(a.status))) {
            await db.finding.update({
                where: { id: findingId },
                data: { status: 'CLOSED', resolutionStatus: 'KAPATILDI', closedDate: new Date() },
            });
            // Aksiyondan bağımsız eski/genel takipler de açık bırakılmamalı;
            // kapalı bulgu yeni çalışma kabul etmediği için bunlar artık uygulanamaz.
            await db.findingFollowUp.updateMany({
                where: { findingId, status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR', 'TAMAMLANDI'] } },
                data: { status: 'IPTAL' },
            });

            await this.appendStatusHistory(findingId, {
                explanation: 'Tüm düzeltici aksiyonlar başarıyla kapatıldığı için bulgu otomatik olarak kapatıldı.',
                evaluator: 'Sistem',
            }, userId, db);
        } else if (actions.some(a => CLOSED.has(a.status))) {
            await db.finding.update({
                where: { id: findingId },
                data: { status: 'PARTIALLY_CLOSED', resolutionStatus: 'KISMEN_KAPATILDI', closedDate: null },
            });

            await this.appendStatusHistory(findingId, {
                explanation: 'En az bir düzeltici aksiyon kapatıldı; açık aksiyonlar nedeniyle bulgu kısmen kapatıldı.',
                evaluator: 'Sistem',
            }, userId, db);
        }
    }

    // ─── Actions Scoped FollowUps ─────────────────────────────────────────────

    async createFollowUpForAction(findingId: string, actionId: string, data: { notes?: string }, userId: string) {
        const action = await this.prisma.action.findFirst({
            where: { id: actionId, findingId },
            include: { finding: true },
        });
        if (!action) throw new NotFoundException('Aksiyon bu bulguya ait değil veya bulunamadı');
        // createFollowUp ile aynı kural: kapalı/iptal bulgu veya aksiyona yeni takip açılmaz.
        if (action.finding.status === 'CLOSED' || action.finding.workflowStatus === 'IPTAL') {
            throw new ConflictException('Kapalı veya iptal edilmiş bulguya yeni takip çalışması eklenemez.');
        }
        if (['KAPATILDI', 'CLOSED', 'IPTAL'].includes(action.status)) {
            throw new ConflictException('Kapalı veya iptal edilmiş aksiyona yeni takip çalışması eklenemez.');
        }
        const followUpId = await this.generateFollowUpId(action.id, action.actionId);
        const assignment = await this.resolveFollowUpAssignment(findingId, action.ownerId);

        const followUp = await this.prisma.findingFollowUp.create({
            data: {
                followUpId,
                findingId,
                actionId,
                status: 'BEKLIYOR',
                plannedDate: action.dueDate,
                assigneeId: assignment.assigneeId,
                secondControllerId: assignment.secondControllerId,
                notes: data.notes || null,
            }
        });

        // Tamamlanmış aksiyon doğrulama beklerken geriye "devam ediyor" durumuna
        // çekilmez. Yalnız henüz tamamlanmamış aksiyonlar başlatılır.
        if (!['TAMAMLANDI', 'COMPLETED', 'KAPATILDI', 'CLOSED'].includes(action.status)) {
            await this.prisma.action.update({
                where: { id: actionId },
                data: { status: 'DEVAM_EDIYOR' },
            });
        }

        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'FindingFollowUp', entityId: followUp.id, newValue: followUp },
        });

        return followUp;
    }

    /**
     * Süresi geçmiş, açık takip kaydı olmayan aksiyonlar için otomatik takip üretir.
     * Cron ve manuel endpoint AYNI bu metodu çağırır (tek domain kuralı).
     *
     * Eşzamanlılık (Madde 6): PostgreSQL advisory lock ile aynı anda YALNIZCA BİR
     * çalıştırıcı işi yürütür — çoklu instance veya cron/manuel çakışmasında mükerrer
     * takip üretilmez. Kilit alınamazsa iş atlanır (bir sonraki çalışmada yakalanır).
     */
    async generateDueFollowUps(triggeredBy: 'cron' | 'manual' = 'manual', triggeredByUserId?: string) {
        // TRANSACTION advisory lock (pg_try_advisory_xact_lock): kilit alma, tüm iş
        // ve kilit bırakma AYNI fiziksel bağlantıda ($transaction tek bağlantı kullanır)
        // ve transaction bitince PostgreSQL kilidi OTOMATİK bırakır — pool üzerinden
        // ayrı unlock sorgusuna güvenilmez; hata/bağlantı kopması sonrası kilit kalmaz.
        const LOCK_KEY = 748120345;
        const startedAt = Date.now();

        const result = await this.prisma.$transaction(async (tx) => {
            const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
                SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked
            `;
            if (!locked) {
                // eslint-disable-next-line no-console
                console.log(`[generateDueFollowUps:${triggeredBy}] atlandı — başka bir çalıştırıcı sürüyor`);
                return { generatedCount: 0, skipped: true as const, errorCount: 0 };
            }

            const now = new Date();
            const actionsDue = await tx.action.findMany({
                where: {
                    dueDate: { lte: now },
                    status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR', 'YETERSIZ', 'TAMAMLANDI', 'COMPLETED'] },
                    finding: {
                        status: { not: 'CLOSED' },
                        workflowStatus: { not: 'IPTAL' },
                    },
                    followUps: { none: { status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR'] } } },
                },
                select: { id: true, actionId: true, findingId: true, dueDate: true, status: true },
            });

            // Numara üretimi atomik sayaçtan (P2002 riski yok); herhangi bir kayıt
            // hatası TÜM turu rollback eder — kısmi kayıt kalmaz, sonraki tur yakalar.
            let count = 0;
            for (const action of actionsDue) {
                const existing = await tx.findingFollowUp.findFirst({
                    where: { actionId: action.id, status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR'] } },
                    select: { id: true },
                });
                if (existing) continue;
                const created = await tx.findingFollowUp.create({
                    data: {
                        followUpId: await this.generateFollowUpId(action.id, action.actionId, tx),
                        findingId: action.findingId,
                        actionId: action.id,
                        status: 'BEKLIYOR',
                        plannedDate: action.dueDate,
                    },
                    select: { id: true, followUpId: true },
                });
                // Otomatik üretim de denetim izine girer: cron → actorType=SYSTEM (IP yoktur),
                // manuel tetik → tetikleyen kullanıcı (HTTP bağlamı). Aynı transaction'da.
                await tx.auditLog.create({
                    data: {
                        userId: triggeredByUserId ?? null,
                        action: 'AUTO_GENERATE',
                        entityType: 'FindingFollowUp',
                        entityId: created.id,
                        newValue: { followUpId: created.followUpId, actionId: action.actionId, trigger: triggeredBy },
                    },
                });
                if (!['TAMAMLANDI', 'COMPLETED'].includes(action.status)) {
                    await tx.action.update({ where: { id: action.id }, data: { status: 'DEVAM_EDIYOR' } });
                }
                count++;
            }
            return { generatedCount: count, errorCount: 0, errors: [] as string[], skipped: false as const };
        }, { timeout: 60000 });

        // eslint-disable-next-line no-console
        console.log(
            `[generateDueFollowUps:${triggeredBy}] ${'skipped' in result && result.skipped ? 'atlandı' : 'tamamlandı'} — ` +
            `${result.generatedCount} takip üretildi, ${result.errorCount} hata, ${Date.now() - startedAt}ms` +
            (('errors' in result && result.errors?.length) ? ` :: ${result.errors.join('; ')}` : ''),
        );
        return { generatedCount: result.generatedCount, errorCount: result.errorCount, skipped: result.skipped };
    }

    // ─── Finding Status History & Audit Trail ────────────────────────────────

    async appendStatusHistory(findingId: string, data: any, userId: string, db: PrismaLike = this.prisma) {
        const finding = await db.finding.findUnique({ where: { id: findingId }, select: { id: true } });
        if (!finding) throw new NotFoundException(`Finding ${findingId} not found`);

        const history = await db.findingStatusHistory.create({
            data: {
                findingId,
                followUpId: data.followUpId || null,
                actionId: data.actionId || null,
                evaluator: data.evaluator || userId || null,
                result: data.result || null,
                explanation: data.explanation || null,
                evidenceLinks: data.evidenceLinks || null,
                // Audit trail fields
                operation: data.operation || data.changeType || null,
                changeType: data.changeType || data.operation || null,
                userId: userId || null,
                fieldName: data.fieldName || null,
                oldValue: data.oldValue || null,
                newValue: data.newValue || null,
                workflowStatus: data.workflowStatus || null,
                previousWorkflowStatus: data.previousWorkflowStatus || null,
                resolutionStatus: data.resolutionStatus || null,
            }
        });

        return history;
    }

    // Zengin audit trail kaydı — her kritik işlem için
    async recordAuditTrail(params: {
        findingId: string;
        operation: string;
        userId: string;
        explanation?: string;
        fieldName?: string;
        oldValue?: any;
        newValue?: any;
        followUpId?: string;
        actionId?: string;
    }, db: PrismaLike = this.prisma) {
        return db.findingStatusHistory.create({
            data: {
                findingId: params.findingId,
                operation: params.operation,
                changeType: params.operation,
                userId: params.userId,
                evaluator: params.userId,
                explanation: params.explanation || null,
                fieldName: params.fieldName || null,
                oldValue: params.oldValue != null ? params.oldValue : null,
                newValue: params.newValue != null ? params.newValue : null,
                followUpId: params.followUpId || null,
                actionId: params.actionId || null,
            },
        });
    }

    async getStatusHistory(findingId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id: findingId }, select: { id: true } });
        if (!finding) throw new NotFoundException(`Finding ${findingId} not found`);

        return this.prisma.findingStatusHistory.findMany({
            where: { findingId },
            orderBy: { entryDate: 'desc' },
        });
    }

    // ─── FindingStatusLog (Append-only Güncel Durum) ──────────────────────────

    async appendStatusLog(findingId: string, text: string, authorId: string, authorName?: string, followUpId?: string, db: PrismaLike = this.prisma) {
        return db.findingStatusLog.create({
            data: {
                findingId,
                text,
                authorId,
                authorName: authorName || authorId,
                followUpId: followUpId || null,
            },
        });
    }

    async getStatusLogs(findingId: string) {
        return this.prisma.findingStatusLog.findMany({
            where: { findingId },
            orderBy: { entryDate: 'desc' },
        });
    }

    // ─── Attachment CRUD (metadata-only) ─────────────────────────────────────

    private async claimUploadedFile(meta: any, userId: string, db: PrismaLike) {
        const ticket = await db.uploadTicket.findFirst({ where: { id: meta.uploadId, uploadedById: userId, claimedAt: null, expiresAt: { gt: new Date() } } });
        if (!ticket || ticket.fileName !== meta.fileName || ticket.originalName !== meta.originalName || ticket.mimeType !== meta.mimeType || ticket.sizeBytes !== meta.sizeBytes) {
            throw new BadRequestException('Yükleme kaydı geçersiz, süresi dolmuş veya bu kullanıcıya ait değil.');
        }
        const claim = await db.uploadTicket.updateMany({ where: { id: ticket.id, claimedAt: null }, data: { claimedAt: new Date() } });
        if (claim.count !== 1) throw new BadRequestException('Bu yükleme daha önce kullanılmış.');
    }

    async addFindingAttachment(findingId: string, meta: { fileName: string; originalName: string; mimeType: string; sizeBytes: number }, userId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id: findingId }, select: { id: true } });
        if (!finding) throw new NotFoundException(`Finding ${findingId} not found`);

        return this.prisma.$transaction(async tx => {
            await this.claimUploadedFile(meta, userId, tx);
            const { uploadId: _uploadId, ...safeMeta } = meta as any;
            const att = await tx.findingAttachment.create({ data: { findingId, ...safeMeta, displayName: safeMeta.displayName?.trim() || meta.originalName, description: safeMeta.description?.trim() || null, uploadedBy: userId, url: null } });
            await this.recordAuditTrail({ findingId, operation: 'FILE_UPLOADED', userId, explanation: `Dosya yüklendi: ${meta.originalName}`, newValue: { fileName: meta.originalName, mimeType: meta.mimeType } }, tx);
            return att;
        });
    }

    async removeFindingAttachment(findingId: string, attachmentId: string, userId: string) {
        const att = await this.prisma.findingAttachment.findFirst({ where: { id: attachmentId, findingId } });
        if (!att) throw new NotFoundException(`Attachment ${attachmentId} not found`);
        await this.prisma.findingAttachment.delete({ where: { id: attachmentId } });
        await this.recordAuditTrail({ findingId, operation: 'FILE_DELETED', userId, explanation: `Dosya silindi: ${att.originalName}`, oldValue: { fileName: att.originalName } });
        return { message: 'Dosya silindi' };
    }

    async addActionAttachment(findingId: string, actionId: string, meta: { fileName: string; originalName: string; mimeType: string; sizeBytes: number }, userId: string) {
        const action = await this.prisma.action.findFirst({ where: { id: actionId, findingId } });
        if (!action) throw new NotFoundException(`Action ${actionId} not found`);

        return this.prisma.$transaction(async tx => {
            await this.claimUploadedFile(meta, userId, tx);
            const { uploadId: _uploadId, ...safeMeta } = meta as any;
            const att = await tx.actionAttachment.create({ data: { actionId, ...safeMeta, displayName: safeMeta.displayName?.trim() || meta.originalName, description: safeMeta.description?.trim() || null, uploadedBy: userId, url: null } });
            await this.recordAuditTrail({ findingId, actionId, operation: 'FILE_UPLOADED', userId, explanation: `Aksiyon dosyası yüklendi: ${meta.originalName}` }, tx);
            return att;
        });
    }

    async removeActionAttachment(findingId: string, actionId: string, attachmentId: string, userId: string) {
        const att = await this.prisma.actionAttachment.findFirst({ where: { id: attachmentId, actionId } });
        if (!att) throw new NotFoundException(`Attachment ${attachmentId} not found`);
        await this.prisma.actionAttachment.delete({ where: { id: attachmentId } });
        await this.recordAuditTrail({ findingId, actionId, operation: 'FILE_DELETED', userId, explanation: `Aksiyon dosyası silindi: ${att.originalName}` });
        return { message: 'Dosya silindi' };
    }

    async addFollowUpAttachment(findingId: string, followUpId: string, meta: { fileName: string; originalName: string; mimeType: string; sizeBytes: number }, userId: string) {
        const fu = await this.prisma.findingFollowUp.findFirst({ where: { id: followUpId, findingId } });
        if (!fu) throw new NotFoundException(`FollowUp ${followUpId} not found`);
        if (fu.status === 'ONAYLANDI' || fu.approvalStatus === 'ONAYLANDI' || (fu.status === 'TAMAMLANDI' && fu.approvalStatus === 'BEKLIYOR')) {
            throw new ForbiddenException('Onay bekleyen veya onaylanmış takip çalışmasının kanıtları değiştirilemez.');
        }

        return this.prisma.$transaction(async tx => {
            await this.claimUploadedFile(meta, userId, tx);
            const { uploadId: _uploadId, ...safeMeta } = meta as any;
            const att = await tx.followUpAttachment.create({ data: { followUpId, ...safeMeta, displayName: safeMeta.displayName?.trim() || meta.originalName, description: safeMeta.description?.trim() || null, uploadedBy: userId, url: null } });
            await this.recordAuditTrail({ findingId, followUpId, operation: 'FILE_UPLOADED', userId, explanation: `Takip dosyası yüklendi: ${meta.originalName}` }, tx);
            return att;
        });
    }

    async removeFollowUpAttachment(findingId: string, followUpId: string, attachmentId: string, userId: string) {
        const followUp = await this.prisma.findingFollowUp.findFirst({ where: { id: followUpId, findingId }, select: { status: true, approvalStatus: true } });
        if (!followUp) throw new NotFoundException(`FollowUp ${followUpId} not found`);
        if (followUp.status === 'ONAYLANDI' || followUp.approvalStatus === 'ONAYLANDI' || (followUp.status === 'TAMAMLANDI' && followUp.approvalStatus === 'BEKLIYOR')) {
            throw new ForbiddenException('Onay bekleyen veya onaylanmış takip çalışmasının kanıtları değiştirilemez.');
        }
        const att = await this.prisma.followUpAttachment.findFirst({ where: { id: attachmentId, followUpId } });
        if (!att) throw new NotFoundException(`Attachment ${attachmentId} not found`);
        await this.prisma.followUpAttachment.delete({ where: { id: attachmentId } });
        await this.recordAuditTrail({ findingId, followUpId, operation: 'FILE_DELETED', userId, explanation: `Takip dosyası silindi: ${att.originalName}` });
        return { message: 'Dosya silindi' };
    }

    async updateAttachmentMetadata(kind: 'finding' | 'action' | 'follow-up', findingId: string, attachmentId: string, dto: { displayName?: string; description?: string }, userId: string, parentId?: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id: findingId }, select: { id: true } });
        if (!finding) throw new NotFoundException(`Finding ${findingId} not found`);
        const repo: any = kind === 'finding' ? this.prisma.findingAttachment : kind === 'action' ? this.prisma.actionAttachment : this.prisma.followUpAttachment;
        const parentField = kind === 'finding' ? 'findingId' : kind === 'action' ? 'actionId' : 'followUpId';
        const parentValue = kind === 'finding' ? findingId : parentId;
        const old = await repo.findFirst({ where: { id: attachmentId, [parentField]: parentValue } });
        if (!old) throw new NotFoundException('Kanıt bulunamadı');
        if (kind === 'follow-up') {
            const followUp = await this.prisma.findingFollowUp.findFirst({ where: { id: parentId, findingId }, select: { status: true, approvalStatus: true } });
            if (!followUp) throw new NotFoundException('Takip çalışması bulunamadı');
            if (followUp.status === 'ONAYLANDI' || followUp.approvalStatus === 'ONAYLANDI' || (followUp.status === 'TAMAMLANDI' && followUp.approvalStatus === 'BEKLIYOR')) {
                throw new BadRequestException('Onay bekleyen veya onaylanmış takip çalışmasının kanıtları değiştirilemez.');
            }
        }
        const updated = await repo.update({ where: { id: attachmentId }, data: {
            displayName: dto.displayName !== undefined ? (dto.displayName.trim() || old.originalName) : undefined,
            description: dto.description !== undefined ? (dto.description.trim() || null) : undefined,
        } });
        await this.recordAuditTrail({ findingId, actionId: kind === 'action' ? parentId : undefined, followUpId: kind === 'follow-up' ? parentId : undefined, operation: 'FILE_METADATA_UPDATED', userId, fieldName: 'attachmentMetadata', oldValue: { displayName: old.displayName, description: old.description }, newValue: { displayName: updated.displayName, description: updated.description } });
        return updated;
    }

    // ─── Bağımsız Follow-Ups Listesi ─────────────────────────────────────────

    async findAllFollowUps(query: any, currentUserId?: string, scope?: Prisma.FindingFollowUpWhereInput | null) {
        const {
            search, status, findingType, relatedDepartment,
            ownerId, ownerIds, evaluatorIds, secondControllerIds, month, year, severity, resolutionOutcome, overdue, newActionRequired,
        } = query;
        const { page, limit, skip } = parsePaging(query, 50);

        const where: any = {};

        if (status && status !== 'all') where.status = status;
        if (resolutionOutcome) where.resolutionOutcome = resolutionOutcome;
        if (newActionRequired === 'true') where.newActionRequired = true;
        if (overdue === 'true') {
            where.AND = [...(where.AND || []), { plannedDate: { lt: new Date() } }];
            where.status = { in: ['BEKLIYOR', 'DEVAM_EDIYOR'] };
        }

        if (relatedDepartment) {
            where.finding = { relatedDepartment: { contains: relatedDepartment, mode: 'insensitive' } };
        }
        if (severity) {
            where.finding = { ...(where.finding || {}), severity };
        }
        if (findingType) {
            where.finding = { ...(where.finding || {}), findingType };
        }
        const ownerField = personFieldWhere('ownerId', ownerIds || ownerId, currentUserId);
        if (ownerField) where.action = ownerField;
        const followUpPeople = [personFieldWhere('evaluatorId', evaluatorIds, currentUserId), personFieldWhere('secondControllerId', secondControllerIds, currentUserId)].filter(Boolean);
        if (followUpPeople.length) where.AND = [...(where.AND || []), ...followUpPeople];
        if (month && year) {
            const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
            const endDate   = new Date(parseInt(year), parseInt(month), 1);
            where.plannedDate = { gte: startDate, lt: endDate };
        } else if (year) {
            const startDate = new Date(parseInt(year), 0, 1);
            const endDate   = new Date(parseInt(year) + 1, 0, 1);
            where.plannedDate = { gte: startDate, lt: endDate };
        }
        if (search) {
            where.OR = [
                { followUpId: { contains: search, mode: 'insensitive' } },
                { finding: { findingId: { contains: search, mode: 'insensitive' } } },
                { finding: { summary: { contains: search, mode: 'insensitive' } } },
            ];
        }

        if (scope) where.AND = [...(where.AND || []), scope];
        const [followUps, total] = await Promise.all([
            this.prisma.findingFollowUp.findMany({
                where,
                include: {
                    finding: {
                        select: {
                            id: true, findingId: true, summary: true, description: true,
                            severity: true, relatedDepartment: true, resolutionStatus: true,
                        },
                    },
                    action: {
                        select: {
                            id: true, actionId: true, description: true, dueDate: true,
                            owner: { select: { id: true, firstName: true, lastName: true, department: true } },
                        },
                    },
                    attachments: { select: { id: true, fileName: true, originalName: true, displayName: true, description: true, mimeType: true, sizeBytes: true } },
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.findingFollowUp.count({ where }),
        ]);

        return { data: followUps, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }
}

type FindingDeleteCandidate = {
    workflowStatus: string;
    status: string;
    resolutionStatus: string | null;
    actions: { status: string }[];
    followUps: { status: string; approvalStatus: string | null }[];
    _count: { referencingTests: number };
};

/** deleteFinding için engel listesi (boşsa silinebilir). Saf fonksiyon — test edilir. */
export function findingDeleteBlockers(f: FindingDeleteCandidate): string[] {
    const blockers: string[] = [];
    if (f.workflowStatus !== 'TASLAK') blockers.push(`Bulgu TASLAK değil (${f.workflowStatus}).`);
    if (f.status === 'CLOSED' || f.resolutionStatus === 'KAPATILDI') blockers.push('Bulgu kapalı.');
    const progressedActions = f.actions.filter(a => a.status !== 'BEKLIYOR').length;
    if (progressedActions > 0) blockers.push(`${progressedActions} aksiyonda ilerleme kaydedilmiş.`);
    const progressedFollowUps = f.followUps.filter(fu => fu.status !== 'BEKLIYOR' || (fu.approvalStatus && fu.approvalStatus !== 'BEKLIYOR')).length;
    if (progressedFollowUps > 0) blockers.push(`${progressedFollowUps} takip çalışması başlamış veya onay sürecinde.`);
    if (f._count.referencingTests > 0) blockers.push(`${f._count.referencingTests} kontrol testi bu bulguya referans veriyor.`);
    return blockers;
}
