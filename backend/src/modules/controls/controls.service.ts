import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class ControlsService {
    constructor(private prisma: PrismaService) { }

    private generateControlId(): string {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `C-${year}-${random}`;
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
                findings: { orderBy: { createdAt: 'desc' }, take: 10 },
                regulations: { include: { article: { include: { regulation: true } } } },
            },
        });
        if (!control) throw new NotFoundException(`Control with ID ${id} not found`);
        return control;
    }

    async create(data: any, userId: string) {
        const control = await this.prisma.control.create({
            data: { ...data, controlId: this.generateControlId() },
            include: { owner: { select: { id: true, firstName: true, lastName: true, email: true } } },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'Control', entityId: control.id, newValue: control },
        });

        return control;
    }

    async update(id: string, data: any, userId: string) {
        console.log('Updating control:', id, data);
        const existing = await this.findOne(id);
        const control = await this.prisma.control.update({
            where: { id },
            data,
            include: { owner: { select: { id: true, firstName: true, lastName: true, email: true } } },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'Control', entityId: id, oldValue: existing, newValue: control },
        });

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
}
