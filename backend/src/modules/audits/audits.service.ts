import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class AuditsService {
    constructor(private prisma: PrismaService) { }

    // Audit Plans
    async findAllPlans(query: any) {
        const { year, status, page = 1, limit = 20 } = query;
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
        const { riskId, controlId, severity, status, page = 1, limit = 20 } = query;
        const skip = (page - 1) * limit;
        const where: any = {};
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
                orderBy: { createdAt: 'desc' },
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
