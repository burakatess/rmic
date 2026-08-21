import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class AuditsService {
    constructor(private prisma: PrismaService) { }

    // ─── Audit Plans ─────────────────────────────────────────────────────────

    async findAllPlans(query: any) {
        const { year, status } = query;
        const page = parseInt(query.page, 10) || 1;
        const limit = parseInt(query.limit, 10) || 20;
        const skip = (page - 1) * limit;
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
        const page = parseInt(query.page, 10) || 1;
        const limit = parseInt(query.limit, 10) || 50;
        const skip = (page - 1) * limit;
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

    async findAllFindings(query: any) {
        const { search, riskId, controlId, severity, status, findingType, auditPlanId, sortBy, sortOrder } = query;
        const page = parseInt(query.page, 10) || 1;
        const limit = parseInt(query.limit, 10) || 50;
        const skip = (page - 1) * limit;
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
        if (auditPlanId) where.auditExecution = { auditPlanId };

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
                orderBy: { [sortBy || 'createdAt']: sortOrder || 'desc' },
            }),
            this.prisma.finding.count({ where }),
        ]);

        return { data: findings, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async createFinding(data: any, userId: string) {
        const {
            risk, control, riskId, controlId, testRecordId, controlTestId, directorateId,
            source, affectedSystem, recommendation, managementResponse,
            targetResolutionDate, closedDate, relatedDepartment, responsiblePerson,
            findingType, summary, gmy, internalControlAssessment, currentStatusDetail,
            testDate, attachment, sendEmail, birimCevabi, assigneeId, actions,
            iletisimKisisi, workflowStatus, resolutionStatus,
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

        // Generate new-format findingId: B-YYYY-NNNN
        const year = new Date().getFullYear();
        const prefix = `B-${year}-`;

        const lastFinding = await this.prisma.finding.findFirst({
            where: { findingId: { startsWith: prefix } },
            orderBy: { findingId: 'desc' },
        });

        let nextNum = 1;
        if (lastFinding) {
            const parts = lastFinding.findingId.split('-');
            const lastNum = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(lastNum)) nextNum = lastNum + 1;
        }
        const findingId = `${prefix}${nextNum.toString().padStart(4, '0')}`;

        const finding = await this.prisma.finding.create({
            data: { ...findingData, findingId },
            include: {
                risk: { select: { id: true, riskId: true, name: true } },
                control: { select: { id: true, controlId: true, name: true } },
                linkedRisks: { select: { id: true, riskId: true, name: true } },
                
                _count: { select: { actions: true, followUps: true } },
            },
        });

        // Create actions if passed
        if (actions && Array.isArray(actions) && actions.length > 0) {
            for (const act of actions) {
                const createdAction = await this.prisma.action.create({
                    data: {
                        actionId: await this.generateActionId(),
                        findingId: finding.id,
                        description: act.description,
                        ownerId: act.ownerId,
                        responsibleDepartment: act.responsibleDepartment || null,
                        dueDate: new Date(act.dueDate),
                        notes: act.notes || null,

                        status: act.status || 'BEKLIYOR',
                        controlId: finding.controlId,

                        riskId: finding.riskId,
                    }
                });

                // Aksiyona yüklenen dosya eklerini bağla
                if (Array.isArray(act.attachments) && act.attachments.length > 0) {
                    await this.prisma.actionAttachment.createMany({
                        data: act.attachments
                            .filter((a: any) => a?.fileName)
                            .map((a: any) => ({
                                actionId: createdAction.id,
                                fileName: a.fileName,
                                originalName: a.originalName,
                                mimeType: a.mimeType,
                                sizeBytes: a.sizeBytes,
                                uploadedBy: userId,
                            })),
                    });
                }
            }
            await this.recalculateFindingTargetDate(finding.id);
        }

        // Madde 7: testDate'in bulunduğu ay için otomatik bir FollowUp oluştur
        // (aksiyona bağlı olmak zorunda değil — actionId nullable).
        if (finding.testDate) {
            await this.autoCreateMonthlyFollowUp(finding.id, finding.testDate, userId);
        }

        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'Finding', entityId: finding.id, newValue: finding },
        });

        return finding;
    }

    /** Ayın son gününü döner (basit kural — repo'da hazır "son iş günü" helper'ı bu modülde yok). */
    private lastDayOfMonth(year: number, month: number): Date {
        return new Date(year, month + 1, 0);
    }

    /**
     * Madde 7: Bulgunun testDate'inin bulunduğu ay için otomatik bir FindingFollowUp
     * oluşturur — aynı ay için zaten bir FollowUp varsa duplicate üretmez.
     */
    private async autoCreateMonthlyFollowUp(findingId: string, testDate: Date, userId: string) {
        const year = testDate.getFullYear();
        const month = testDate.getMonth();
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 1);

        const existing = await this.prisma.findingFollowUp.findFirst({
            where: { findingId, plannedDate: { gte: monthStart, lt: monthEnd } },
        });
        if (existing) return existing;

        const plannedDate = this.lastDayOfMonth(year, month);
        const followUpId = await this.generateFollowUpId();

        const followUp = await this.prisma.findingFollowUp.create({
            data: { followUpId, findingId, status: 'BEKLIYOR', plannedDate },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'FindingFollowUp', entityId: followUp.id, newValue: { auto: true, reason: 'testDate ayı için otomatik takip' } },
        });

        return followUp;
    }

    async updateFinding(id: string, data: any, userId: string) {
        const {
            risk, control, riskId, controlId, testRecordId, directorateId,
            source, affectedSystem, recommendation, managementResponse,
            targetResolutionDate, closedDate, relatedDepartment, responsiblePerson,
            findingType, summary, gmy, internalControlAssessment, currentStatusDetail,
            testDate, attachment, sendEmail, birimCevabi, assigneeId,
            iletisimKisisi, workflowStatus, resolutionStatus,
            ...rest
        } = data;

        // targetResolutionDate İSTEMCİDEN ASLA yazılmaz — tek otorite bağlı aksiyonların
        // dueDate'lerinden hesaplanan recalculateFindingTargetDate()'tir (Madde 4).
        void targetResolutionDate;

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
            workflowStatus: workflowStatus || undefined,
            resolutionStatus: resolutionStatus || undefined,
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

        // Auto-set closedDate when resolution becomes KAPATILDI
        if (findingData.resolutionStatus === 'KAPATILDI') {
            const current = await this.prisma.finding.findUnique({ where: { id }, select: { closedDate: true } });
            if (!current?.closedDate) findingData.closedDate = new Date();
        }
        // Legacy compat
        if (findingData.status === 'CLOSED') {
            const current = await this.prisma.finding.findUnique({ where: { id }, select: { closedDate: true } });
            if (!current?.closedDate) {
                findingData.closedDate = new Date();
            }
        } else if (closedDate !== undefined) {
            findingData.closedDate = closedDate ? new Date(closedDate) : null;
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
                linkedRisks: {
                    select: {
                        id: true, riskId: true, name: true, status: true,
                        residualRiskScore: true, inherentRiskScore: true,
                        owner: { select: { id: true, firstName: true, lastName: true } },
                    }
                },
                actions: {
                    include: {
                        owner: { select: { id: true, firstName: true, lastName: true } },
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
        return finding;
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

    async deleteFinding(id: string, userId: string) {
        const finding = await this.getFinding(id);
        await this.prisma.auditLog.create({
            data: { userId, action: 'DELETE', entityType: 'Finding', entityId: id, oldValue: finding },
        });
        await this.prisma.action.deleteMany({ where: { findingId: id } });
        await this.prisma.findingFollowUp.deleteMany({ where: { findingId: id } });
        await this.prisma.finding.delete({ where: { id } });
        return { message: 'Finding deleted successfully' };
    }

    // ─── Mutabakat Workflow Geçişleri ─────────────────────────────────────────

    private async transitionWorkflow(
        id: string,
        newStatus: string,
        userId: string,
        note?: string,
    ) {
        const finding = await this.prisma.finding.findUnique({
            where: { id },
            select: { id: true, workflowStatus: true },
        });
        if (!finding) throw new NotFoundException(`Finding ${id} not found`);

        const previousWorkflowStatus = finding.workflowStatus;

        const updated = await this.prisma.finding.update({
            where: { id },
            data: { workflowStatus: newStatus as any },
        });

        await this.prisma.findingStatusHistory.create({
            data: {
                findingId: id,
                evaluator: userId,
                changeType: 'WORKFLOW_CHANGE',
                workflowStatus: newStatus as any,
                previousWorkflowStatus: previousWorkflowStatus as any,
                explanation: note || `Statü: ${previousWorkflowStatus} → ${newStatus}`,
            },
        });

        await this.prisma.auditLog.create({
            data: {
                userId,
                action: 'UPDATE',
                entityType: 'Finding',
                entityId: id,
                newValue: { workflowStatus: newStatus, previousWorkflowStatus },
            },
        });

        return updated;
    }

    // TASLAK → MUTABAKATA_GONDERILDI
    async mutabakataGonder(id: string, userId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id }, select: { workflowStatus: true } });
        if (!finding) throw new NotFoundException(`Finding ${id} not found`);
        if (finding.workflowStatus !== 'TASLAK') {
            throw new BadRequestException(`Bulgu TASLAK statüsünde değil: ${finding.workflowStatus}`);
        }
        return this.transitionWorkflow(id, 'MUTABAKATA_GONDERILDI', userId, 'Bulgu mutabakata gönderildi.');
    }

    // MUTABAKATA_GONDERILDI → IC_KONTROL_ONAYINA_GONDERILDI
    async icKontrolOnayinaGonder(id: string, birimCevabi: string, targetDate: string | undefined, userId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id }, select: { workflowStatus: true } });
        if (!finding) throw new NotFoundException(`Finding ${id} not found`);
        if (finding.workflowStatus !== 'MUTABAKATA_GONDERILDI') {
            throw new BadRequestException(`Beklenen statü MUTABAKATA_GONDERILDI, mevcut: ${finding.workflowStatus}`);
        }
        // Birim cevabını kaydet
        await this.prisma.finding.update({
            where: { id },
            data: {
                birimCevabi,
                ...(targetDate ? { targetResolutionDate: new Date(targetDate) } : {}),
            },
        });
        return this.transitionWorkflow(id, 'IC_KONTROL_ONAYINA_GONDERILDI', userId, 'Birim yanıtı alındı, İç Kontrol onayına gönderildi.');
    }

    // IC_KONTROL_ONAYINA_GONDERILDI → MUTABAKAT_YAPILDI
    async mutabakatOnayla(id: string, data: { internalControlAssessment?: string; resolutionStatus?: string }, userId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id }, select: { workflowStatus: true } });
        if (!finding) throw new NotFoundException(`Finding ${id} not found`);
        if (finding.workflowStatus !== 'IC_KONTROL_ONAYINA_GONDERILDI') {
            throw new BadRequestException(`Beklenen statü IC_KONTROL_ONAYINA_GONDERILDI, mevcut: ${finding.workflowStatus}`);
        }
        const updateData: any = {};
        if (data.internalControlAssessment) updateData.internalControlAssessment = data.internalControlAssessment;
        if (data.resolutionStatus) {
            updateData.resolutionStatus = data.resolutionStatus;
            if (data.resolutionStatus === 'KAPATILDI') updateData.closedDate = new Date();
        }
        if (Object.keys(updateData).length > 0) {
            await this.prisma.finding.update({ where: { id }, data: updateData });
        }
        return this.transitionWorkflow(id, 'MUTABAKAT_YAPILDI', userId, 'Mutabakat İKS tarafından onaylandı.');
    }

    // IC_KONTROL_ONAYINA_GONDERILDI → MUTABAKATA_GONDERILDI (geri gönder)
    async mutabakatGeriGonder(id: string, reason: string, userId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id }, select: { workflowStatus: true } });
        if (!finding) throw new NotFoundException(`Finding ${id} not found`);
        if (finding.workflowStatus !== 'IC_KONTROL_ONAYINA_GONDERILDI') {
            throw new BadRequestException(`Beklenen statü IC_KONTROL_ONAYINA_GONDERILDI, mevcut: ${finding.workflowStatus}`);
        }
        return this.transitionWorkflow(id, 'MUTABAKATA_GONDERILDI', userId, `Yetersiz yanıt, birime geri gönderildi: ${reason}`);
    }

    // Herhangi → IPTAL (yalnızca Business Owner / Admin)
    async iptalEt(id: string, reason: string, userId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id }, select: { workflowStatus: true } });
        if (!finding) throw new NotFoundException(`Finding ${id} not found`);
        if (finding.workflowStatus === 'IPTAL') {
            throw new BadRequestException('Bulgu zaten iptal edilmiş.');
        }
        return this.transitionWorkflow(id, 'IPTAL', userId, `İptal gerekçesi: ${reason}`);
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

    async getFollowUps(findingId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id: findingId }, select: { id: true } });
        if (!finding) throw new NotFoundException(`Finding ${findingId} not found`);

        return this.prisma.findingFollowUp.findMany({
            where: { findingId },
            orderBy: { createdAt: 'desc' },
        });
    }

    async createFollowUp(findingId: string, data: any, userId: string) {
        const finding = await this.prisma.finding.findUnique({
            where: { id: findingId },
            select: { id: true, findingId: true, findingType: true },
        });
        if (!finding) throw new NotFoundException(`Finding ${findingId} not found`);

        const followUpId = await this.generateFollowUpId();

        const {
            birimCevabi, currentStatusDetail, internalControlAssessment,
            targetResolutionDate, testDate, attachment, secondControllerId, sprint, notes,
        } = data;

        const followUp = await this.prisma.findingFollowUp.create({
            data: {
                followUpId,
                findingId,
                status: data.status || 'BEKLIYOR',
                birimCevabi: birimCevabi || null,
                currentStatusDetail: currentStatusDetail || null,
                internalControlAssessment: internalControlAssessment || null,
                targetResolutionDate: targetResolutionDate ? new Date(targetResolutionDate) : null,
                testDate: testDate ? new Date(testDate) : null,
                secondControllerId: secondControllerId || null,
                sprint: sprint || null,
                notes: notes || null,
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'FindingFollowUp', entityId: followUp.id, newValue: followUp },
        });

        return followUp;
    }

    async deleteFollowUp(findingId: string, followUpId: string, userId: string) {
        const followUp = await this.prisma.findingFollowUp.findFirst({
            where: { id: followUpId, findingId },
        });
        if (!followUp) throw new NotFoundException('Takip çalışması bulunamadı');

        await this.prisma.auditLog.create({
            data: { userId, action: 'DELETE', entityType: 'FindingFollowUp', entityId: followUpId, oldValue: followUp },
        });

        // FindingStatusHistory.followUpId cascade değil — silmeden önce bağı koparılmalı,
        // yoksa FK constraint hatası (500) alınır. Geçmiş kaydı kendisi korunur.
        await this.prisma.findingStatusHistory.updateMany({
            where: { followUpId },
            data: { followUpId: null },
        });
        // FollowUpAttachment onDelete: Cascade — otomatik silinir.
        await this.prisma.findingFollowUp.delete({ where: { id: followUpId } });

        return { message: 'Takip çalışması silindi' };
    }

    async updateFollowUp(findingId: string, followUpId: string, data: any, userId: string) {
        const followUp = await this.prisma.findingFollowUp.findFirst({
            where: { id: followUpId, findingId },
        });
        if (!followUp) throw new NotFoundException(`FollowUp ${followUpId} not found`);

        const {
            birimCevabi, currentStatusDetail, internalControlAssessment,
            targetResolutionDate, testDate, attachment, secondControllerId, sprint, notes, status,
            actionId, evaluatorId, evaluatedAt, result, explanation, evidence, approvalStatus, approvedBy, approvedAt,
            resolutionOutcome, newFollowUpDate, newAction,
        } = data;

        // İş kuralı: YENI_AKSIYON_GEREKLI seçildiğinde yeni aksiyon bilgisi zorunlu —
        // placeholder/otomatik-türetilmiş değerlerle Action üretilmez. Yazmadan önce doğrula.
        const wantsNewAction = result === 'YENI_AKSIYON_GEREKLI' || resolutionOutcome === 'YENI_AKSIYON_GEREKLI';
        if (wantsNewAction) {
            if (!newAction || !newAction.description || !newAction.ownerId || !newAction.dueDate) {
                throw new BadRequestException(
                    'YENI_AKSIYON_GEREKLI seçildiğinde newAction.description, newAction.ownerId ve newAction.dueDate zorunludur.',
                );
            }
            const ownerExists = await this.prisma.user.findUnique({ where: { id: newAction.ownerId }, select: { id: true } });
            if (!ownerExists) throw new BadRequestException('Geçersiz kullanıcı: yeni aksiyon sorumlusu bulunamadı');
        }

        // İş kuralı: ERTELENDI seçildiğinde yeni takip tarihi zorunlu.
        if (resolutionOutcome === 'ERTELENDI' && !newFollowUpDate) {
            throw new BadRequestException('ERTELENDI seçildiğinde newFollowUpDate zorunludur.');
        }

        const updated = await this.prisma.findingFollowUp.update({
            where: { id: followUpId },
            data: {
                status: status || undefined,
                birimCevabi: birimCevabi !== undefined ? (birimCevabi || null) : undefined,
                currentStatusDetail: currentStatusDetail !== undefined ? (currentStatusDetail || null) : undefined,
                internalControlAssessment: internalControlAssessment !== undefined ? (internalControlAssessment || null) : undefined,
                targetResolutionDate: targetResolutionDate !== undefined ? (targetResolutionDate ? new Date(targetResolutionDate) : null) : undefined,
                testDate: testDate !== undefined ? (testDate ? new Date(testDate) : null) : undefined,
                secondControllerId: secondControllerId !== undefined ? (secondControllerId || null) : undefined,
                sprint: sprint !== undefined ? (sprint || null) : undefined,
                notes: notes !== undefined ? (notes || null) : undefined,
                actionId: actionId !== undefined ? (actionId || null) : undefined,
                evaluatorId: evaluatorId !== undefined ? (evaluatorId || null) : undefined,
                evaluatedAt: evaluatedAt ? new Date(evaluatedAt) : undefined,
                result: result !== undefined ? (result || null) : undefined,
                explanation: explanation !== undefined ? (explanation || null) : undefined,
                approvalStatus: approvalStatus || undefined,
                approvedBy: approvedBy !== undefined ? (approvedBy || null) : undefined,
                approvedAt: approvedAt ? new Date(approvedAt) : undefined,
                resolutionOutcome: resolutionOutcome !== undefined ? (resolutionOutcome || null) : undefined,
                newFollowUpDate: newFollowUpDate !== undefined ? (newFollowUpDate ? new Date(newFollowUpDate) : null) : undefined,
                newActionRequired: result === 'YENI_AKSIYON_GEREKLI' || resolutionOutcome === 'YENI_AKSIYON_GEREKLI',
            },
        });

        // ─── Bulgu durumunu takip sonucuna göre güncelle ──────────────────────
        const effectiveResolution = resolutionOutcome || (result === 'YETERLI' ? 'KAPATILDI' : undefined);

        if (effectiveResolution) {
            const findingUpdate: any = { resolutionStatus: effectiveResolution };

            if (effectiveResolution === 'KAPATILDI') {
                // status/closedDate burada KOŞULSUZ set edilmez — bulguya bağlı birden fazla
                // aksiyon olabilir, hepsi kapanmadan bulgu tam kapanmamalı (bkz. aşağıdaki
                // checkAndCloseFindinIfAllActionsClosed çağrısı, iş kuralı: "tüm aksiyonlar
                // kapanmadan bulgu kapanmasın").
                findingUpdate.testDate = null;
            } else if (effectiveResolution === 'ERTELENDI' && newFollowUpDate) {
                findingUpdate.testDate = new Date(newFollowUpDate);
            } else if (effectiveResolution === 'KISMEN_KAPATILDI') {
                findingUpdate.status = 'PARTIALLY_CLOSED';
            } else if (effectiveResolution === 'YENI_AKSIYON_GEREKLI') {
                findingUpdate.status = 'IN_PROGRESS';
            }

            await this.prisma.finding.update({ where: { id: findingId }, data: findingUpdate });

            // StatusLog'a güncel durumu append et (üzerine yazmadan)
            if (currentStatusDetail) {
                const now = new Date().toLocaleDateString('tr-TR');
                const logText = `${now} — ${currentStatusDetail}`;
                await this.appendStatusLog(findingId, logText, userId, undefined, updated.id);
            }

            // Audit trail
            await this.recordAuditTrail({
                findingId, followUpId: updated.id,
                operation: 'FOLLOWUP_COMPLETED',
                userId,
                explanation: `Takip tamamlandı: ${effectiveResolution}. ${currentStatusDetail || ''}`,
                newValue: { resolutionStatus: effectiveResolution },
            });
        }

        // Action status senkronizasyonu
        if (updated.actionId && (status === 'ONAYLANDI' || approvalStatus === 'ONAYLANDI')) {
            const resolvedResult = updated.result;

            if (resolvedResult === 'YETERLI') {
                await this.prisma.action.update({
                    where: { id: updated.actionId },
                    data: { status: 'KAPATILDI', completedAt: new Date() },
                });
                await this.recordAuditTrail({ findingId, actionId: updated.actionId, operation: 'ACTION_CLOSED', userId, explanation: 'Takip sonucu yeterli — aksiyon kapatıldı.' });
                await this.checkAndCloseFindinIfAllActionsClosed(findingId, userId);
            } else if (resolvedResult === 'YETERSIZ') {
                await this.prisma.action.update({
                    where: { id: updated.actionId },
                    data: { status: 'YETERSIZ' },
                });
                await this.recordAuditTrail({ findingId, actionId: updated.actionId, operation: 'ACTION_UPDATED', userId, explanation: 'Takip sonucu yetersiz — aksiyon durumu güncellendi.' });
            } else if (resolvedResult === 'YENI_AKSIYON_GEREKLI') {
                // newAction zorunluluğu metodun başında doğrulandı — placeholder/fallback
                // değer üretilmez, yalnızca kullanıcının sağladığı gerçek veri kullanılır.
                // createAction() reuse edildiği için yeni aksiyon için otomatik FollowUp de kurulur.
                await this.createAction(findingId, {
                    description: newAction.description,
                    ownerId: newAction.ownerId,
                    responsibleDepartment: newAction.responsibleDepartment,
                    dueDate: newAction.dueDate,
                    notes: newAction.notes,
                    status: 'BEKLIYOR',
                }, userId);

                await this.recordAuditTrail({ findingId, followUpId: updated.id, operation: 'FOLLOWUP_COMPLETED', userId, explanation: 'Yeni düzeltici aksiyon otomatik oluşturuldu.' });
            }
        }

        // "Tüm aksiyonlar kapanmadan bulgu kapanmasın" — resolutionOutcome=KAPATILDI
        // ile açıkça bildirilse bile, bulgunun status/closedDate alanları yalnızca
        // TÜM aksiyonlar KAPATILDI olduğunda set edilir (bkz. checkAndCloseFindinIfAllActionsClosed).
        if (effectiveResolution === 'KAPATILDI') {
            await this.checkAndCloseFindinIfAllActionsClosed(findingId, userId);
        }

        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'FindingFollowUp', entityId: followUpId, newValue: updated },
        });

        return updated;
    }

    // ─── Actions Finding-Scoped CRUD ──────────────────────────────────────────

    async generateActionId(): Promise<string> {
        const year = new Date().getFullYear();
        const prefix = `A-${year}-`;
        const last = await this.prisma.action.findFirst({
            where: { actionId: { startsWith: prefix } },
            orderBy: { actionId: 'desc' },
        });
        let next = 1;
        if (last) {
            const parts = last.actionId.split('-');
            const n = parseInt(parts[2], 10);
            if (!isNaN(n)) next = n + 1;
        }
        return `${prefix}${next.toString().padStart(4, '0')}`;
    }

    private async generateFollowUpId(): Promise<string> {
        const year = new Date().getFullYear();
        const prefix = `T-${year}-`;
        const last = await this.prisma.findingFollowUp.findFirst({
            where: { followUpId: { startsWith: prefix } },
            orderBy: { followUpId: 'desc' },
        });
        let next = 1;
        if (last) {
            const parts = last.followUpId.split('-');
            const n = parseInt(parts[2], 10);
            if (!isNaN(n)) next = n + 1;
        }
        return `${prefix}${next.toString().padStart(4, '0')}`;
    }

    async getActions(findingId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id: findingId }, select: { id: true } });
        if (!finding) throw new NotFoundException(`Finding ${findingId} not found`);

        return this.prisma.action.findMany({
            where: { findingId },
            include: {
                owner: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async createAction(findingId: string, data: any, userId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id: findingId } });
        if (!finding) throw new NotFoundException(`Finding ${findingId} not found`);

        if (data.ownerId) {
            const ownerExists = await this.prisma.user.findUnique({ where: { id: data.ownerId }, select: { id: true } });
            if (!ownerExists) throw new BadRequestException('Geçersiz kullanıcı: aksiyon sorumlusu bulunamadı');
        }

        const dueDate = new Date(data.dueDate);

        const action = await this.prisma.action.create({
            data: {
                actionId: await this.generateActionId(),
                findingId,
                description: data.description,
                ownerId: data.ownerId,
                responsibleDepartment: data.responsibleDepartment || null,
                dueDate,
                notes: data.notes || null,
                
                status: data.status || 'BEKLIYOR',
                controlId: finding.controlId,
                
                riskId: finding.riskId,
            },
            include: {
                owner: { select: { id: true, firstName: true, lastName: true } }
            }
        });

        // Aksiyon tamamlanma tarihine göre takip çalışması otomatik oluştur
        await this.autoCreateFollowUpForAction(action.id, findingId, dueDate, finding, userId);

        await this.recalculateFindingTargetDate(findingId);

        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'Action', entityId: action.id, newValue: action },
        });

        return action;
    }

    // dueDate değiştiğinde takip çalışmasını yeniden üret
    private async autoCreateFollowUpForAction(
        actionId: string,
        findingId: string,
        dueDate: Date,
        finding: any,
        userId: string,
    ) {
        // Eğer bu aksiyon için zaten BEKLIYOR/DEVAM_EDIYOR durumunda bir takip var → güncelle
        const existing = await this.prisma.findingFollowUp.findFirst({
            where: { actionId, status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR'] } },
        });

        const followUpId = await this.generateFollowUpId();

        if (existing) {
            await this.prisma.findingFollowUp.update({
                where: { id: existing.id },
                data: { plannedDate: dueDate, followUpId },
            });
        } else {
            await this.prisma.findingFollowUp.create({
                data: {
                    followUpId,
                    findingId,
                    actionId,
                    status: 'BEKLIYOR',
                    plannedDate: dueDate,
                },
            });
        }

        await this.prisma.findingStatusHistory.create({
            data: {
                findingId,
                evaluator: userId,
                changeType: 'ACTION_CREATED',
                explanation: `Aksiyon oluşturuldu. Takip tarihi: ${dueDate.toLocaleDateString('tr-TR')}`,
            },
        });
    }

    async updateAction(findingId: string, actionId: string, data: any, userId: string) {
        const action = await this.prisma.action.findFirst({
            where: { id: actionId, findingId },
        });
        if (!action) throw new NotFoundException(`Action ${actionId} not found under finding ${findingId}`);

        if (data.ownerId) {
            const ownerExists = await this.prisma.user.findUnique({ where: { id: data.ownerId }, select: { id: true } });
            if (!ownerExists) throw new BadRequestException('Geçersiz kullanıcı: aksiyon sorumlusu bulunamadı');
        }

        const updated = await this.prisma.action.update({
            where: { id: actionId },
            data: {
                description: data.description || undefined,
                ownerId: data.ownerId || undefined,
                responsibleDepartment: data.responsibleDepartment !== undefined ? (data.responsibleDepartment || null) : undefined,
                dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
                notes: data.notes !== undefined ? (data.notes || null) : undefined,
                
                status: data.status || undefined,
            },
            include: {
                owner: { select: { id: true, firstName: true, lastName: true } }
            }
        });

        // dueDate değiştiyse follow-up'ı güncelle
        if (data.dueDate) {
            const finding = await this.prisma.finding.findUnique({
                where: { id: findingId },
                select: { id: true, findingId: true, findingType: true },
            });
            if (finding) {
                await this.autoCreateFollowUpForAction(actionId, findingId, new Date(data.dueDate), finding, userId);
            }
        }

        await this.recalculateFindingTargetDate(findingId);

        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'Action', entityId: actionId, newValue: updated },
        });

        return updated;
    }

    async deleteAction(findingId: string, actionId: string, userId: string) {
        const action = await this.prisma.action.findFirst({
            where: { id: actionId, findingId },
        });
        if (!action) throw new NotFoundException(`Action ${actionId} not found under finding ${findingId}`);

        await this.prisma.action.delete({ where: { id: actionId } });

        await this.recalculateFindingTargetDate(findingId);

        await this.prisma.auditLog.create({
            data: { userId, action: 'DELETE', entityType: 'Action', entityId: actionId, oldValue: action },
        });

        return { message: 'Action deleted successfully' };
    }

    async recalculateFindingTargetDate(findingId: string) {
        const actions = await this.prisma.action.findMany({
            where: { findingId, status: { not: 'KAPATILDI' } },
            select: { dueDate: true },
        });

        if (actions.length > 0) {
            const maxDate = new Date(Math.max(...actions.map(a => new Date(a.dueDate).getTime())));
            await this.prisma.finding.update({
                where: { id: findingId },
                data: { targetResolutionDate: maxDate },
            });
        } else {
            const allActions = await this.prisma.action.findMany({
                where: { findingId },
                select: { dueDate: true },
            });
            if (allActions.length > 0) {
                const maxDate = new Date(Math.max(...allActions.map(a => new Date(a.dueDate).getTime())));
                await this.prisma.finding.update({
                    where: { id: findingId },
                    data: { targetResolutionDate: maxDate },
                });
            }
        }
    }

    async checkAndCloseFindinIfAllActionsClosed(findingId: string, userId: string) {
        const actions = await this.prisma.action.findMany({
            where: { findingId },
            select: { status: true },
        });

        if (actions.length > 0 && actions.every(a => a.status === 'KAPATILDI')) {
            await this.prisma.finding.update({
                where: { id: findingId },
                data: { status: 'CLOSED', closedDate: new Date() },
            });

            await this.appendStatusHistory(findingId, {
                explanation: 'Tüm düzeltici aksiyonlar başarıyla kapatıldığı için bulgu otomatik olarak kapatıldı.',
                evaluator: 'Sistem',
            }, userId);
        }
    }

    // ─── Actions Scoped FollowUps ─────────────────────────────────────────────

    async createFollowUpForAction(findingId: string, actionId: string, data: any, userId: string) {
        const action = await this.prisma.action.findFirst({
            where: { id: actionId, findingId },
            include: { finding: true },
        });
        if (!action) throw new NotFoundException(`Action ${actionId} not found under finding ${findingId}`);
        const followUpId = await this.generateFollowUpId();

        const followUp = await this.prisma.findingFollowUp.create({
            data: {
                followUpId,
                findingId,
                actionId,
                status: data.status || 'BEKLIYOR',
                plannedDate: action.dueDate,
                notes: data.notes || null,
            }
        });

        // Move action status to DEVAM_EDIYOR
        await this.prisma.action.update({
            where: { id: actionId },
            data: { status: 'DEVAM_EDIYOR' },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'FindingFollowUp', entityId: followUp.id, newValue: followUp },
        });

        return followUp;
    }

    async generateDueFollowUps() {
        const now = new Date();
        const actionsDue = await this.prisma.action.findMany({
            where: {
                dueDate: { lte: now },
                status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR', 'YETERSIZ'] },
                followUps: {
                    none: {
                        status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR'] }
                    }
                }
            },
            include: { finding: true },
        });

        let count = 0;
        for (const action of actionsDue) {
            const followUpId = await this.generateFollowUpId();

            await this.prisma.findingFollowUp.create({
                data: {
                    followUpId,
                    findingId: action.findingId,
                    actionId: action.id,
                    status: 'BEKLIYOR',
                    plannedDate: action.dueDate,
                }
            });

            await this.prisma.action.update({
                where: { id: action.id },
                data: { status: 'DEVAM_EDIYOR' }
            });

            count++;
        }

        return { generatedCount: count };
    }

    // ─── Finding Status History & Audit Trail ────────────────────────────────

    async appendStatusHistory(findingId: string, data: any, userId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id: findingId }, select: { id: true } });
        if (!finding) throw new NotFoundException(`Finding ${findingId} not found`);

        const history = await this.prisma.findingStatusHistory.create({
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
    }) {
        return this.prisma.findingStatusHistory.create({
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

    async appendStatusLog(findingId: string, text: string, authorId: string, authorName?: string, followUpId?: string) {
        return this.prisma.findingStatusLog.create({
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

    async addFindingAttachment(findingId: string, meta: { fileName: string; originalName: string; mimeType: string; sizeBytes: number }, userId: string) {
        const finding = await this.prisma.finding.findUnique({ where: { id: findingId }, select: { id: true } });
        if (!finding) throw new NotFoundException(`Finding ${findingId} not found`);

        const att = await this.prisma.findingAttachment.create({
            data: { findingId, ...meta, uploadedBy: userId, url: null },
        });
        await this.recordAuditTrail({ findingId, operation: 'FILE_UPLOADED', userId, explanation: `Dosya yüklendi: ${meta.originalName}`, newValue: { fileName: meta.originalName, mimeType: meta.mimeType } });
        return att;
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

        const att = await this.prisma.actionAttachment.create({
            data: { actionId, ...meta, uploadedBy: userId, url: null },
        });
        await this.recordAuditTrail({ findingId, actionId, operation: 'FILE_UPLOADED', userId, explanation: `Aksiyon dosyası yüklendi: ${meta.originalName}` });
        return att;
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

        const att = await this.prisma.followUpAttachment.create({
            data: { followUpId, ...meta, uploadedBy: userId, url: null },
        });
        await this.recordAuditTrail({ findingId, followUpId, operation: 'FILE_UPLOADED', userId, explanation: `Takip dosyası yüklendi: ${meta.originalName}` });
        return att;
    }

    async removeFollowUpAttachment(findingId: string, followUpId: string, attachmentId: string, userId: string) {
        const att = await this.prisma.followUpAttachment.findFirst({ where: { id: attachmentId, followUpId } });
        if (!att) throw new NotFoundException(`Attachment ${attachmentId} not found`);
        await this.prisma.followUpAttachment.delete({ where: { id: attachmentId } });
        await this.recordAuditTrail({ findingId, followUpId, operation: 'FILE_DELETED', userId, explanation: `Takip dosyası silindi: ${att.originalName}` });
        return { message: 'Dosya silindi' };
    }

    // ─── Bağımsız Follow-Ups Listesi ─────────────────────────────────────────

    async findAllFollowUps(query: any) {
        const {
            search, status, findingType, relatedDepartment,
            ownerId, month, year, severity,
        } = query;
        const page = parseInt(query.page, 10) || 1;
        const limit = parseInt(query.limit, 10) || 50;
        const skip = (page - 1) * limit;

        const where: any = {};

        if (status && status !== 'all') where.status = status;

        if (relatedDepartment) {
            where.finding = { relatedDepartment: { contains: relatedDepartment, mode: 'insensitive' } };
        }
        if (severity) {
            where.finding = { ...(where.finding || {}), severity };
        }
        if (findingType) {
            where.finding = { ...(where.finding || {}), findingType };
        }
        if (ownerId) {
            where.action = { ownerId };
        }
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
                    attachments: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
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
