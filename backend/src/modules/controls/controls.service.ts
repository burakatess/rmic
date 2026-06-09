import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class ControlsService {
    constructor(private prisma: PrismaService) { }

    // ─── ID Generators ────────────────────────────────────────────────────────

    private async generateControlId(): Promise<string> {
        const year = new Date().getFullYear();
        const prefix = `C-${year}-`;
        const last = await this.prisma.control.findFirst({
            where: { controlId: { startsWith: prefix } },
            orderBy: { controlId: 'desc' },
        });
        let next = 1;
        if (last) {
            const parts = last.controlId.split('-');
            const n = parseInt(parts[2], 10);
            if (!isNaN(n)) next = n + 1;
        }
        return `${prefix}${next.toString().padStart(4, '0')}`;
    }

    private async generateTestNo(): Promise<string> {
        const year = new Date().getFullYear();
        const prefix = `T-${year}-`;
        const last = await this.prisma.controlTest.findFirst({
            where: { testNo: { startsWith: prefix } },
            orderBy: { testNo: 'desc' },
        });
        let next = 1;
        if (last) {
            const parts = last.testNo.split('-');
            const n = parseInt(parts[2], 10);
            if (!isNaN(n)) next = n + 1;
        }
        return `${prefix}${next.toString().padStart(4, '0')}`;
    }

    // ─── Controls CRUD ────────────────────────────────────────────────────────

    async findAll(query: any) {
        const { search, type, nature, ownerId, status, directorateId, sortBy, sortOrder } = query;
        const page = parseInt(query.page, 10) || 1;
        const limit = parseInt(query.limit, 10) || 20;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { controlId: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (type) where.type = type;
        if (nature) where.nature = nature;
        if (ownerId) where.ownerId = ownerId;
        if (status) where.status = status;
        if (directorateId) where.directorateId = directorateId;

        const [controls, total] = await Promise.all([
            this.prisma.control.findMany({
                where,
                include: {
                    owner: { select: { id: true, firstName: true, lastName: true, email: true, department: true } },
                    directorateRel: { select: { id: true, name: true, code: true } },
                    risks: { include: { risk: { select: { id: true, riskId: true, name: true } } } },
                    _count: { select: { risks: true, tests: true, findings: true } },
                },
                skip,
                take: limit,
                orderBy: { [sortBy || 'createdAt']: sortOrder || 'desc' },
            }),
            this.prisma.control.count({ where }),
        ]);

        return { data: controls, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async findOne(id: string) {
        const control = await this.prisma.control.findUnique({
            where: { id },
            include: {
                owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                testPerformer: { select: { id: true, firstName: true, lastName: true, email: true } },
                reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
                directorateRel: { select: { id: true, name: true, code: true, gmy: true } },
                risks: { include: { risk: true } },
                tests: {
                    orderBy: { plannedDate: 'desc' },
                    take: 10,
                    include: {
                        findings: { select: { id: true, findingId: true, severity: true, resolutionStatus: true } },
                    },
                },
                findings: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    include: {
                        actions: { include: { owner: { select: { firstName: true, lastName: true } } } },
                    },
                },
                regulations: { include: { article: { include: { regulation: true } } } },
            },
        });
        if (!control) throw new NotFoundException(`Control with ID ${id} not found`);
        return control;
    }

    async create(data: any, userId: string) {
        const { months, status, isActive, ...rest } = data;
        let controlStatus: 'ACTIVE' | 'PASSIVE' = 'ACTIVE';
        if (isActive === false || status === 'PASSIVE') controlStatus = 'PASSIVE';

        const controlId = data.controlId || await this.generateControlId();

        const control = await this.prisma.control.create({
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
                ownerId: data.ownerId || userId,
                directorateId: data.directorateId || null,
            },
            include: {
                owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                directorateRel: { select: { id: true, name: true, code: true } },
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'Control', entityId: control.id, newValue: control },
        });

        if (control.status === 'ACTIVE') {
            await this.generateTestsForControl(control.id);
        }

        return control;
    }

    async update(id: string, data: any, userId: string) {
        const existing = await this.findOne(id);
        const { months, status, isActive, ...rest } = data;

        let controlStatus: 'ACTIVE' | 'PASSIVE' | undefined;
        if (isActive !== undefined) {
            controlStatus = isActive ? 'ACTIVE' : 'PASSIVE';
        } else if (status !== undefined) {
            controlStatus = status === 'ACTIVE' ? 'ACTIVE' : 'PASSIVE';
        }

        const control = await this.prisma.control.update({
            where: { id },
            data: {
                ...rest,
                name: data.name || existing.name,
                selectedMonths: months !== undefined ? months : existing.selectedMonths,
                status: controlStatus !== undefined ? controlStatus : existing.status,
                directorateId: data.directorateId !== undefined ? (data.directorateId || null) : undefined,
            },
            include: {
                owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                directorateRel: { select: { id: true, name: true, code: true } },
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'Control', entityId: id, oldValue: existing, newValue: control },
        });

        if (control.status === 'ACTIVE') {
            await this.generateTestsForControl(control.id);
        }

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
        await this.generateTestsForControl(id);
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

    async delete(id: string, userId: string) {
        const control = await this.findOne(id);
        await this.prisma.auditLog.create({
            data: { userId, action: 'DELETE', entityType: 'Control', entityId: id, oldValue: control },
        });
        await this.prisma.controlTest.deleteMany({ where: { controlId: id } });
        await this.prisma.controlRiskMapping.deleteMany({ where: { controlId: id } });
        await this.prisma.control.delete({ where: { id } });
        return { message: 'Control deleted successfully' };
    }

    async getRelations(id: string) {
        const control = await this.prisma.control.findUnique({
            where: { id },
            include: { owner: { select: { id: true, firstName: true, lastName: true } } },
        });
        if (!control) throw new NotFoundException(`Control ${id} not found`);

        const riskMappings = await this.prisma.controlRiskMapping.findMany({
            where: { controlId: id },
            include: { risk: { select: { id: true, riskId: true, name: true, status: true, residualRiskScore: true } } },
        });

        const findings = await this.prisma.finding.findMany({
            where: { controlId: id },
            select: { id: true, findingId: true, description: true, status: true, severity: true },
        });

        const actions = await this.prisma.action.findMany({
            where: { findingId: { in: findings.map(f => f.id) } },
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

    async getAllTests(query: any) {
        const { status, controlId, directorateId, assigneeId, findingStatus, sortBy, sortOrder } = query;
        const page = parseInt(query.page, 10) || 1;
        const limit = parseInt(query.limit, 10) || 50;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (status) where.status = status;
        if (controlId) where.controlId = controlId;
        if (directorateId) where.directorateId = directorateId;
        if (assigneeId) where.assigneeId = assigneeId;
        if (findingStatus) where.findingStatus = findingStatus;

        const [tests, total] = await Promise.all([
            this.prisma.controlTest.findMany({
                where,
                include: {
                    control: { select: { id: true, controlId: true, name: true, type: true, frequency: true, gmy: true } },
                    directorate: { select: { id: true, name: true, code: true } },
                    findings: { select: { id: true, findingId: true, severity: true, resolutionStatus: true } },
                },
                skip,
                take: limit,
                orderBy: { [sortBy || 'plannedDate']: sortOrder || 'asc' },
            }),
            this.prisma.controlTest.count({ where }),
        ]);

        return { data: tests, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async getTests(controlId: string) {
        return this.prisma.controlTest.findMany({
            where: { controlId },
            include: {
                findings: { select: { id: true, findingId: true, severity: true, resolutionStatus: true } },
                directorate: { select: { id: true, name: true } },
            },
            orderBy: { plannedDate: 'desc' },
        });
    }

    async createTest(controlId: string, data: any, userId: string) {
        const testNo = await this.generateTestNo();
        const test = await this.prisma.controlTest.create({
            data: {
                testNo,
                controlId,
                plannedDate: data.plannedDate ? new Date(data.plannedDate) : new Date(),
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

    async startTest(testId: string, userId: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);
        if (test.status !== 'BEKLIYOR') throw new BadRequestException('Test başlatmak için BEKLIYOR statüsünde olmalı.');

        const updated = await this.prisma.controlTest.update({
            where: { id: testId },
            data: { status: 'DEVAM_EDIYOR' },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'START_TEST', entityType: 'ControlTest', entityId: testId },
        });

        return updated;
    }

    async completeTest(testId: string, data: any, userId: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);

        const updated = await this.prisma.controlTest.update({
            where: { id: testId },
            data: {
                status: 'TAMAMLANDI',
                completedAt: new Date(),
                findingStatus: data.findingStatus || 'BULGUSU_YOK',
                resultText: data.resultText || null,
                evidenceSummary: data.evidenceSummary || null,
                evidenceUrls: data.evidenceUrls || [],
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'COMPLETE_TEST', entityType: 'ControlTest', entityId: testId, newValue: updated },
        });

        return updated;
    }

    async approveTest(testId: string, userId: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);
        if (test.status !== 'TAMAMLANDI') throw new BadRequestException('Onaylamak için test TAMAMLANDI statüsünde olmalı.');

        const updated = await this.prisma.controlTest.update({
            where: { id: testId },
            data: { status: 'ONAYLANDI', approvedAt: new Date(), approvedById: userId },
        });

        // Kontrol etkinlik durumunu güncelle
        const effectivenessMap: Record<string, 'EFFECTIVE' | 'INEFFECTIVE' | 'PARTIALLY_EFFECTIVE'> = {
            BULGUSU_YOK: 'EFFECTIVE',
            BULGUSU_VAR: 'INEFFECTIVE',
        };
        const effectiveness = test.findingStatus ? (effectivenessMap[test.findingStatus] || 'NOT_TESTED') : 'NOT_TESTED';

        await this.prisma.control.update({
            where: { id: test.controlId },
            data: {
                lastTestDate: test.completedAt || new Date(),
                effectivenessStatus: effectiveness as any,
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'APPROVE_TEST', entityType: 'ControlTest', entityId: testId },
        });

        return updated;
    }

    async returnTest(testId: string, reason: string, userId: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);

        const updated = await this.prisma.controlTest.update({
            where: { id: testId },
            data: { status: 'DEVAM_EDIYOR', rejectionReason: reason },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'RETURN_TEST', entityType: 'ControlTest', entityId: testId, newValue: { reason } },
        });

        return updated;
    }

    // ─── Test Auto-Generation (Frekansa göre yıllık testler) ─────────────────

    async generateTestsForControl(controlId: string) {
        const control = await this.prisma.control.findUnique({ where: { id: controlId } });
        if (!control || control.status !== 'ACTIVE') return { generated: 0 };

        // Mevcut otomatik test varsa atla
        const existing = await this.prisma.controlTest.count({
            where: { controlId, isAutoGenerated: true },
        });
        if (existing > 0) return { generated: 0, message: 'Auto-generated tests already exist' };

        const currentYear = new Date().getFullYear();
        const now = new Date();

        const turkishMonths: Record<string, number> = {
            'Ocak': 0, 'Şubat': 1, 'Mart': 2, 'Nisan': 3, 'Mayıs': 4, 'Haziran': 5,
            'Temmuz': 6, 'Ağustos': 7, 'Eylül': 8, 'Ekim': 9, 'Kasım': 10, 'Aralık': 11,
        };

        const dates: Date[] = [];

        if (control.frequency === 'DAILY') {
            for (let i = 1; i <= 20; i++) {
                const d = new Date(); d.setDate(now.getDate() + i);
                if (d.getDay() !== 0 && d.getDay() !== 6) dates.push(d);
            }
        } else if (control.frequency === 'WEEKLY') {
            for (let i = 1; i <= 8; i++) {
                const d = new Date(); d.setDate(now.getDate() + i * 7);
                dates.push(d);
            }
        } else if (control.frequency === 'MONTHLY') {
            for (let i = 0; i < 12; i++) {
                const d = new Date(currentYear, now.getMonth() + i + 1, 0);
                dates.push(d);
            }
        } else {
            const months = control.selectedMonths || [];
            for (const monthName of months) {
                const mi = turkishMonths[monthName];
                if (mi === undefined) continue;
                const yr = mi < now.getMonth() ? currentYear + 1 : currentYear;
                dates.push(new Date(yr, mi + 1, 0));
            }
        }

        let generated = 0;
        for (const plannedDate of dates) {
            const testNo = await this.generateTestNo();
            await this.prisma.controlTest.create({
                data: {
                    testNo,
                    controlId,
                    plannedDate,
                    isAutoGenerated: true,
                    status: 'BEKLIYOR',
                    assigneeId: control.ownerId,
                    directorateId: control.directorateId,
                },
            });
            generated++;
        }

        return { generated };
    }
}
