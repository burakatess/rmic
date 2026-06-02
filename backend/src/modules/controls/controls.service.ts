import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class ControlsService {
    constructor(private prisma: PrismaService) { }

    private async generateControlId(): Promise<string> {
        const year = new Date().getFullYear();
        const prefix = `C-${year}-`;
        const lastControl = await this.prisma.control.findFirst({
            where: {
                controlId: {
                    startsWith: prefix,
                },
            },
            orderBy: {
                controlId: 'desc',
            },
        });

        let nextNum = 1;
        if (lastControl) {
            const parts = lastControl.controlId.split('-');
            const lastNum = parseInt(parts[2], 10);
            if (!isNaN(lastNum)) {
                nextNum = lastNum + 1;
            }
        }
        return `${prefix}${nextNum.toString().padStart(4, '0')}`;
    }

    async findAll(query: any) {
        const { search, type, nature, ownerId, effectivenessStatus, sortBy, sortOrder } = query;
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
        if (effectivenessStatus) where.effectivenessStatus = effectivenessStatus;

        const [controls, total] = await Promise.all([
            this.prisma.control.findMany({
                where,
                include: {
                    owner: { select: { id: true, firstName: true, lastName: true, email: true, department: true } },
                    risks: {
                        include: {
                            risk: {
                                select: { id: true, riskId: true, name: true }
                            }
                        }
                    },
                    findings: {
                        select: {
                            id: true,
                            findingId: true,
                            actions: {
                                select: { id: true, actionId: true }
                            }
                        }
                    },
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
                risks: { include: { risk: true } },
                tests: { orderBy: { testDate: 'desc' }, take: 10 },
                testRecords: { orderBy: { dueDate: 'desc' }, take: 10 },
                findings: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    include: {
                        actions: {
                            include: {
                                owner: { select: { firstName: true, lastName: true } }
                            }
                        }
                    }
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
        if (isActive === false || status === 'PASSIVE' || status === 'INACTIVE' || status === 'DRAFT') {
            controlStatus = 'PASSIVE';
        }

        const controlId = data.controlId || await this.generateControlId();

        const control = await this.prisma.control.create({
            data: {
                ...rest,
                controlId,
                name: data.name || controlId || 'Yeni Kontrol',
                description: data.description || '',
                type: data.type || 'IT_GENERAL',
                nature: data.nature || 'PREVENTIVE',
                automation: data.automation || 'MANUAL',
                selectedMonths: months || [],
                status: controlStatus,
                ownerId: data.ownerId || userId,
            },
            include: { owner: { select: { id: true, firstName: true, lastName: true, email: true } } },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'Control', entityId: control.id, newValue: control },
        });

        // Trigger automatic planned test records generation
        if (control.status === 'ACTIVE') {
            await this.generateTestRecordsForControl(control.id);
        }

        return control;
    }

    async update(id: string, data: any, userId: string) {
        console.log('Updating control:', id, data);
        const existing = await this.findOne(id);
        const { months, status, isActive, ...rest } = data;

        let controlStatus: 'ACTIVE' | 'PASSIVE' | undefined = undefined;
        if (isActive !== undefined) {
            controlStatus = isActive ? 'ACTIVE' : 'PASSIVE';
        } else if (status !== undefined) {
            controlStatus = (status === 'ACTIVE') ? 'ACTIVE' : 'PASSIVE';
        }

        const control = await this.prisma.control.update({
            where: { id },
            data: {
                ...rest,
                name: data.name || data.controlId || existing.name,
                selectedMonths: months !== undefined ? months : existing.selectedMonths,
                status: controlStatus !== undefined ? controlStatus : existing.status,
            },
            include: { owner: { select: { id: true, firstName: true, lastName: true, email: true } } },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'Control', entityId: id, oldValue: existing, newValue: control },
        });

        // Trigger automatic planned test records generation if status is ACTIVE
        if (control.status === 'ACTIVE') {
            await this.generateTestRecordsForControl(control.id);
        }

        return control;
    }

    async mapRisk(controlId: string, riskId: string, mappingType: string = 'PRIMARY') {
        // Use upsert to handle case where mapping already exists
        return this.prisma.controlRiskMapping.upsert({
            where: {
                controlId_riskId: { controlId, riskId }
            },
            update: { mappingType },
            create: { controlId, riskId, mappingType },
            include: { control: true, risk: true },
        });
    }

    async unmapRisk(controlId: string, riskId: string) {
        return this.prisma.controlRiskMapping.deleteMany({
            where: { controlId, riskId },
        });
    }

    async createTest(controlId: string, data: any, userId: string) {
        const test = await this.prisma.controlTest.create({
            data: { ...data, controlId },
        });

        // Update control effectiveness status
        await this.prisma.control.update({
            where: { id: controlId },
            data: {
                effectivenessStatus: data.result,
                lastTestDate: data.testDate,
                lastTestResult: data.result,
            },
        });

        // If ineffective, increase residual risk of related risks
        if (data.result === 'INEFFECTIVE') {
            const mappings = await this.prisma.controlRiskMapping.findMany({
                where: { controlId },
                include: { risk: true },
            });

            for (const mapping of mappings) {
                if (mapping.risk.residualRiskScore) {
                    await this.prisma.risk.update({
                        where: { id: mapping.riskId },
                        data: { isAboveAppetite: true },
                    });
                }
            }
        }

        await this.prisma.auditLog.create({
            data: { userId, action: 'TEST', entityType: 'Control', entityId: controlId, newValue: test },
        });

        return test;
    }

    async getTests(controlId: string) {
        return this.prisma.controlTest.findMany({
            where: { controlId },
            orderBy: { testDate: 'desc' },
        });
    }

    // Approval Workflow Methods
    async submitForApproval(testId: string, userId: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test with ID ${testId} not found`);

        const updatedTest = await this.prisma.controlTest.update({
            where: { id: testId },
            data: { approvalStatus: 'PENDING_APPROVAL' },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'SUBMIT_FOR_APPROVAL', entityType: 'ControlTest', entityId: testId, newValue: updatedTest },
        });

        return updatedTest;
    }

    async approveTest(testId: string, userId: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test with ID ${testId} not found`);

        const updatedTest = await this.prisma.controlTest.update({
            where: { id: testId },
            data: {
                approvalStatus: 'APPROVED',
                approvedBy: userId,
                approvedAt: new Date(),
            },
        });

        // Update control's lastTestDate when approved
        await this.prisma.control.update({
            where: { id: test.controlId },
            data: {
                lastTestDate: test.testDate,
                lastTestResult: test.result,
                effectivenessStatus: test.result,
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'APPROVE', entityType: 'ControlTest', entityId: testId, newValue: updatedTest },
        });

        return updatedTest;
    }

    async rejectTest(testId: string, userId: string, reason: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test with ID ${testId} not found`);

        const updatedTest = await this.prisma.controlTest.update({
            where: { id: testId },
            data: {
                approvalStatus: 'REJECTED',
                rejectionReason: reason,
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'REJECT', entityType: 'ControlTest', entityId: testId, newValue: updatedTest },
        });

        return updatedTest;
    }

    async getRelations(id: string) {
        const control = await this.prisma.control.findUnique({
            where: { id },
            include: {
                owner: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        if (!control) throw new NotFoundException(`Control with ID ${id} not found`);

        // Get linked risks via mapping
        const riskMappings = await this.prisma.controlRiskMapping.findMany({
            where: { controlId: id },
            include: {
                risk: {
                    select: { id: true, riskId: true, name: true, status: true, residualRiskScore: true },
                },
            },
        });
        const risks = riskMappings.map(m => m.risk);

        // Get findings linked to this control
        const findings = await this.prisma.finding.findMany({
            where: { controlId: id },
            select: { id: true, findingId: true, description: true, status: true, severity: true },
        });
        const findingIds = findings.map(f => f.id);

        // Get actions linked to these findings
        const actions = await this.prisma.action.findMany({
            where: { findingId: { in: findingIds } },
            select: { id: true, actionId: true, description: true, status: true, dueDate: true },
        });

        return {
            control: {
                id: control.id,
                controlId: control.controlId,
                name: control.name,
                effectivenessStatus: control.effectivenessStatus,
                type: control.type,
                owner: control.owner,
            },
            risks,
            findings,
            actions,
        };
    }

    async delete(id: string, userId: string) {
        const control = await this.findOne(id);

        // Log the action before deletion
        await this.prisma.auditLog.create({
            data: {
                userId,
                action: 'DELETE',
                entityType: 'Control',
                entityId: id,
                oldValue: control,
            },
        });

        // Delete related records first (cascade)
        await this.prisma.controlTest.deleteMany({
            where: { controlId: id },
        });

        await this.prisma.controlRiskMapping.deleteMany({
            where: { controlId: id },
        });

        await this.prisma.finding.deleteMany({
            where: { controlId: id },
        });

        // Hard delete the control
        await this.prisma.control.delete({
            where: { id },
        });

        return { message: 'Control deleted successfully' };
    }

    async generateTestRecordsForControl(controlId: string) {
        const control = await this.prisma.control.findUnique({
            where: { id: controlId },
        });

        if (!control || control.status !== 'ACTIVE') return;

        // Check if there are already pending or any test records for this control
        const existingCount = await this.prisma.testRecord.count({
            where: { controlId },
        });

        // If records already exist, we skip to avoid duplicate generation
        if (existingCount > 0) return;

        const currentYear = new Date().getFullYear();
        const prefix = `T-${currentYear}-`;
        const lastRecord = await this.prisma.testRecord.findFirst({
            where: {
                testId: {
                    startsWith: prefix,
                },
            },
            orderBy: {
                testId: 'desc',
            },
        });

        let nextNum = 1;
        if (lastRecord && lastRecord.testId) {
            const parts = lastRecord.testId.split('-');
            const lastNum = parseInt(parts[2], 10);
            if (!isNaN(lastNum)) {
                nextNum = lastNum + 1;
            }
        }

        const testRecordsToCreate: Array<{
            controlId: string;
            dueDate: Date;
            status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
            assigneeId: string | null;
            testId: string;
        }> = [];
        const currentDate = new Date();

        const turkishMonths: Record<string, number> = {
            'Ocak': 0, 'Şubat': 1, 'Mart': 2, 'Nisan': 3, 'Mayıs': 4, 'Haziran': 5,
            'Temmuz': 6, 'Ağustos': 7, 'Eylül': 8, 'Ekim': 9, 'Kasım': 10, 'Aralık': 11
        };

        if (control.frequency === 'DAILY') {
            // Generate next 30 days
            for (let i = 1; i <= 30; i++) {
                const date = new Date();
                date.setDate(currentDate.getDate() + i);
                // Skip weekends (optional but good for banking systems)
                if (date.getDay() !== 0 && date.getDay() !== 6) {
                    testRecordsToCreate.push({
                        controlId,
                        dueDate: date,
                        status: 'PENDING',
                        assigneeId: control.ownerId,
                        testId: `${prefix}${nextNum.toString().padStart(4, '0')}`,
                    });
                    nextNum++;
                }
            }
        } else if (control.frequency === 'WEEKLY') {
            // Generate next 12 weeks
            for (let i = 1; i <= 12; i++) {
                const date = new Date();
                date.setDate(currentDate.getDate() + (i * 7));
                testRecordsToCreate.push({
                    controlId,
                    dueDate: date,
                    status: 'PENDING',
                    assigneeId: control.ownerId,
                    testId: `${prefix}${nextNum.toString().padStart(4, '0')}`,
                });
                nextNum++;
            }
        } else if (control.frequency === 'MONTHLY') {
            // Generate 12 monthly tasks
            for (let i = 0; i < 12; i++) {
                const date = new Date(currentYear, currentDate.getMonth() + i + 1, 0); // Last day of month
                testRecordsToCreate.push({
                    controlId,
                    dueDate: date,
                    status: 'PENDING',
                    assigneeId: control.ownerId,
                    testId: `${prefix}${nextNum.toString().padStart(4, '0')}`,
                });
                nextNum++;
            }
        } else if (['QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'AD_HOC'].includes(control.frequency)) {
            // Generate tasks for selected months
            const months = control.selectedMonths || [];
            for (const monthName of months) {
                const monthIndex = turkishMonths[monthName];
                if (monthIndex !== undefined) {
                    let targetYear = currentYear;
                    if (monthIndex < currentDate.getMonth()) {
                        targetYear = currentYear + 1; // Schedule for next year if month already passed
                    }
                    const date = new Date(targetYear, monthIndex + 1, 0); // Last day of that month
                    testRecordsToCreate.push({
                        controlId,
                        dueDate: date,
                        status: 'PENDING',
                        assigneeId: control.ownerId,
                        testId: `${prefix}${nextNum.toString().padStart(4, '0')}`,
                    });
                    nextNum++;
                }
            }
        }

        if (testRecordsToCreate.length > 0) {
            await this.prisma.testRecord.createMany({
                data: testRecordsToCreate,
            });
        }
    }
}
