import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class ActionsService {
    constructor(private prisma: PrismaService) { }

    private generateActionId(): string {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `A-${year}-${random}`;
    }

    async findAll(query: any) {
        const { ownerId, status, source, riskId, findingId, page = 1, limit = 20 } = query;
        const skip = (page - 1) * limit;
        const where: any = {};
        if (ownerId) where.ownerId = ownerId;
        if (status) where.status = status;
        if (source) where.source = source;
        if (riskId) where.riskId = riskId;
        if (findingId) where.findingId = findingId;

        const [actions, total] = await Promise.all([
            this.prisma.action.findMany({
                where,
                include: {
                    owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                    risk: { select: { id: true, riskId: true, name: true } },
                    finding: { select: { id: true, findingId: true, description: true } },
                    effectivenessReview: true,
                },
                skip,
                take: limit,
                orderBy: { dueDate: 'asc' },
            }),
            this.prisma.action.count({ where }),
        ]);

        // Mark overdue actions
        const now = new Date();
        const actionsWithOverdue = actions.map((action) => ({
            ...action,
            isOverdue: action.status !== 'CLOSED' && action.status !== 'COMPLETED' && action.dueDate < now,
        }));

        return { data: actionsWithOverdue, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async findOne(id: string) {
        const action = await this.prisma.action.findUnique({
            where: { id },
            include: {
                owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                risk: true,
                finding: { include: { control: true } },
                effectivenessReview: true,
            },
        });
        if (!action) throw new NotFoundException(`Action with ID ${id} not found`);
        return action;
    }

    async create(data: any, userId: string) {
        // ENFORCE: Action must have risk impact
        if (!data.riskId && !data.findingId) {
            throw new BadRequestException('Action must be linked to a risk or a finding');
        }

        const action = await this.prisma.action.create({
            data: { ...data, actionId: this.generateActionId() },
            include: {
                owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                risk: { select: { id: true, riskId: true, name: true } },
                finding: { select: { id: true, findingId: true } },
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'Action', entityId: action.id, newValue: action },
        });

        return action;
    }

    async update(id: string, data: any, userId: string) {
        const action = await this.prisma.action.update({
            where: { id },
            data,
            include: {
                owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                risk: { select: { id: true, riskId: true, name: true } },
                finding: { select: { id: true, findingId: true } },
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'Action', entityId: id, newValue: action },
        });

        return action;
    }

    async complete(id: string, userId: string) {
        const action = await this.prisma.action.update({
            where: { id },
            data: { status: 'COMPLETED', completedAt: new Date() },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'COMPLETE', entityType: 'Action', entityId: id, newValue: action },
        });

        return action;
    }

    async extend(id: string, data: { newDueDate: Date; reason: string }, userId: string) {
        if (!data.reason) {
            throw new BadRequestException('Extension reason is mandatory');
        }

        const action = await this.prisma.action.update({
            where: { id },
            data: {
                dueDate: data.newDueDate,
                extensionReason: data.reason,
                extensionApproved: false,
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'EXTEND', entityType: 'Action', entityId: id, newValue: { newDueDate: data.newDueDate, reason: data.reason } },
        });

        return action;
    }

    async createEffectivenessReview(id: string, data: any, userId: string) {
        // CRITICAL: Closing action does NOT mean risk reduction
        // Risk reduction must be calculated and approved

        const action = await this.findOne(id);

        const review = await this.prisma.effectivenessReview.create({
            data: {
                actionId: id,
                riskScoreBefore: data.riskScoreBefore,
                riskScoreAfter: data.riskScoreAfter,
                controlEffectiveness: data.controlEffectiveness,
                isEffective: data.isEffective,
                reviewedBy: userId,
                notes: data.notes,
            },
        });

        // Update action status
        await this.prisma.action.update({
            where: { id },
            data: { status: data.isEffective ? 'CLOSED' : 'COMPLETED' },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'EFFECTIVENESS_REVIEW', entityType: 'Action', entityId: id, newValue: review },
        });

        return review;
    }

    async approveEffectivenessReview(id: string, userId: string) {
        const review = await this.prisma.effectivenessReview.update({
            where: { actionId: id },
            data: {
                managementApproval: true,
                approvedBy: userId,
                approvedAt: new Date(),
            },
        });

        // If approved and effective, update the related risk's residual score
        const action = await this.findOne(id);
        if (review.isEffective && action.riskId) {
            await this.prisma.risk.update({
                where: { id: action.riskId },
                data: {
                    residualRiskScore: review.riskScoreAfter,
                    isAboveAppetite: false, // Will be recalculated
                },
            });
        }

        await this.prisma.auditLog.create({
            data: { userId, action: 'APPROVAL', entityType: 'EffectivenessReview', entityId: review.id, newValue: review },
        });

        return review;
    }
}
