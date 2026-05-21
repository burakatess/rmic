import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class AuditsService {
    constructor(private prisma: PrismaService) { }

    // Audit Plans
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
                include: { _count: { select: { executions: true } } },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.auditPlan.count({ where }),
        ]);

        return { data: plans, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async createPlan(data: any, userId: string) {
        const planId = `AP-${data.year}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
        const plan = await this.prisma.auditPlan.create({ data: { ...data, planId } });
        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'AuditPlan', entityId: plan.id, newValue: plan },
        });
        return plan;
    }

    async updatePlan(id: string, data: any, userId: string) {
        const plan = await this.prisma.auditPlan.update({ where: { id }, data });
        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'AuditPlan', entityId: id, newValue: plan },
        });
        return plan;
    }

    // Audit Executions
    async createExecution(data: any, userId: string) {
        const execution = await this.prisma.auditExecution.create({ data });
        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'AuditExecution', entityId: execution.id, newValue: execution },
        });
        return execution;
    }

    async updateExecution(id: string, data: any, userId: string) {
        const execution = await this.prisma.auditExecution.update({ where: { id }, data });
        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'AuditExecution', entityId: id, newValue: execution },
        });
        return execution;
    }

    // Findings - MUST be linked to risk and control
    async findAllFindings(query: any) {
        const { search, riskId, controlId, severity, status, sortBy, sortOrder } = query;
        const page = parseInt(query.page, 10) || 1;
        const limit = parseInt(query.limit, 10) || 20;
        const skip = (page - 1) * limit;
        const where: any = {};
        if (search) {
            where.OR = [
                { description: { contains: search, mode: 'insensitive' } },
                { findingId: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (riskId) where.riskId = riskId;
        if (controlId) where.controlId = controlId;
        if (severity) where.severity = severity;
        if (status) where.status = status;

        const [findings, total] = await Promise.all([
            this.prisma.finding.findMany({
                where,
                include: {
                    risk: { select: { id: true, riskId: true, name: true } },
                    control: { select: { id: true, controlId: true, name: true } },
                    _count: { select: { actions: true } },
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
        // Validation removed: Finding can be standalone or linked to just one entity

        // Handle empty strings from frontend - convert to null for Prisma
        // Also strictly extract fields to avoid passing unwanted 'risk' or 'control' objects if they somehow exist in data
        const { risk, control, riskId, controlId, source, affectedSystem, recommendation, managementResponse, targetResolutionDate, closedDate, relatedDepartment, responsiblePerson, ...rest } = data;

        const findingData = {
            ...rest,
            source: source || 'INTERNAL_AUDIT',
            affectedSystem: affectedSystem || null,
            recommendation: recommendation || null,
            managementResponse: managementResponse || null,
            targetResolutionDate: targetResolutionDate ? new Date(targetResolutionDate) : null,
            closedDate: closedDate ? new Date(closedDate) : null,
            relatedDepartment: relatedDepartment || null,
            responsiblePerson: responsiblePerson || null,
            riskId: riskId || null,
            controlId: controlId || null,
        };

        const findingId = `F-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
        const finding = await this.prisma.finding.create({
            data: { ...findingData, findingId },
            include: {
                risk: { select: { id: true, riskId: true, name: true } },
                control: { select: { id: true, controlId: true, name: true } },
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'Finding', entityId: finding.id, newValue: finding },
        });

        return finding;
    }

    async updateFinding(id: string, data: any, userId: string) {
        // Handle empty strings from frontend
        const { risk, control, riskId, controlId, source, affectedSystem, recommendation, managementResponse, targetResolutionDate, closedDate, relatedDepartment, responsiblePerson, ...rest } = data;

        const findingData = {
            ...rest,
            source: source || undefined, // undefined keeps existing value if not provided
            affectedSystem: affectedSystem || null,
            recommendation: recommendation || null,
            managementResponse: managementResponse || null,
            targetResolutionDate: targetResolutionDate ? new Date(targetResolutionDate) : null,
            closedDate: closedDate ? new Date(closedDate) : null,
            relatedDepartment: relatedDepartment || null,
            responsiblePerson: responsiblePerson || null,
            riskId: riskId || null,
            controlId: controlId || null,
        };

        const finding = await this.prisma.finding.update({
            where: { id },
            data: findingData,
            include: {
                risk: { select: { id: true, riskId: true, name: true } },
                control: { select: { id: true, controlId: true, name: true } },
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
                actions: { include: { owner: { select: { id: true, firstName: true, lastName: true } } } },
                auditExecution: true,
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
            },
        });
        if (!finding) throw new NotFoundException(`Finding with ID ${id} not found`);

        // Get risks: direct risk + risks via control
        const risks: any[] = [];
        if (finding.risk) {
            risks.push(finding.risk);
        }
        if (finding.control) {
            const controlRiskMappings = await this.prisma.controlRiskMapping.findMany({
                where: { controlId: finding.control.id },
                include: {
                    risk: { select: { id: true, riskId: true, name: true, status: true, residualRiskScore: true } },
                },
            });
            for (const m of controlRiskMappings) {
                if (!risks.find(r => r.id === m.risk.id)) {
                    risks.push(m.risk);
                }
            }
        }

        // Get controls (just the one linked, if any)
        const controls = finding.control ? [finding.control] : [];

        // Get actions linked to this finding
        const actions = await this.prisma.action.findMany({
            where: { findingId: id },
            select: { id: true, actionId: true, description: true, status: true, dueDate: true },
        });

        return {
            finding: {
                id: finding.id,
                findingId: finding.findingId,
                description: finding.description,
                status: finding.status,
                severity: finding.severity,
            },
            risks,
            controls,
            actions,
        };
    }

    async deleteFinding(id: string, userId: string) {
        const finding = await this.getFinding(id);

        // Log the action before deletion
        await this.prisma.auditLog.create({
            data: {
                userId,
                action: 'DELETE',
                entityType: 'Finding',
                entityId: id,
                oldValue: finding,
            },
        });

        // Delete related actions first
        await this.prisma.action.deleteMany({
            where: { findingId: id },
        });

        // Hard delete the finding
        await this.prisma.finding.delete({
            where: { id },
        });

        return { message: 'Finding deleted successfully' };
    }
}
