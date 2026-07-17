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
        const { search, ownerId, status, source, riskId, findingId, sortBy, sortOrder } = query;
        const page = parseInt(query.page, 10) || 1;
        const limit = parseInt(query.limit, 10) || 20;
        const skip = (page - 1) * limit;
        const where: any = {};
        if (search) {
            where.OR = [
                { description: { contains: search, mode: 'insensitive' } },
                { actionId: { contains: search, mode: 'insensitive' } },
            ];
        }
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
                orderBy: { [sortBy || 'dueDate']: sortOrder || 'asc' },
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

    async getRelations(id: string) {
        const action = await this.prisma.action.findUnique({
            where: { id },
            include: {
                owner: { select: { id: true, firstName: true, lastName: true } },
                risk: { select: { id: true, riskId: true, name: true, status: true, residualRiskScore: true } },
                finding: {
                    include: {
                        control: { select: { id: true, controlId: true, name: true, effectivenessStatus: true, type: true } },
                    },
                },
            },
        });
        if (!action) throw new NotFoundException(`Action with ID ${id} not found`);

        // Build risks: direct risk + risks via finding's control
        const risks: any[] = [];
        if (action.risk) {
            risks.push(action.risk);
        }
        if (action.finding?.control) {
            const controlRiskMappings = await this.prisma.controlRiskMapping.findMany({
                where: { controlId: action.finding.control.id },
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

        // Controls: from finding's control
        const controls = action.finding?.control ? [action.finding.control] : [];

        // Findings: the finding linked to this action
        const findings = action.finding
            ? [{ id: action.finding.id, findingId: action.finding.findingId, description: action.finding.description, status: action.finding.status, severity: action.finding.severity }]
            : [];

        return {
            action: {
                id: action.id,
                actionId: action.actionId,
                description: action.description,
                status: action.status,
                dueDate: action.dueDate,
                owner: action.owner,
            },
            risks,
            controls,
            findings,
        };
    }

    async create(data: any, userId: string) {
        // ENFORCE: Action must have risk impact
        if (!data.riskId && !data.findingId) {
            throw new BadRequestException('Action must be linked to a risk or a finding');
        }

        // FK doğrulaması — Prisma FK 500 yerine okunur 400
        if (data.riskId) {
            const riskExists = await this.prisma.risk.findUnique({ where: { id: data.riskId }, select: { id: true } });
            if (!riskExists) throw new BadRequestException('Geçersiz risk: seçilen risk bulunamadı');
        }
        if (data.findingId) {
            const findingExists = await this.prisma.finding.findUnique({ where: { id: data.findingId }, select: { id: true } });
            if (!findingExists) throw new BadRequestException('Geçersiz bulgu: seçilen bulgu bulunamadı');
        }
        if (data.controlId) {
            const controlExists = await this.prisma.control.findUnique({ where: { id: data.controlId }, select: { id: true } });
            if (!controlExists) throw new BadRequestException('Geçersiz kontrol: seçilen kontrol bulunamadı');
        }
        if (data.ownerId) {
            const ownerExists = await this.prisma.user.findUnique({ where: { id: data.ownerId }, select: { id: true } });
            if (!ownerExists) throw new BadRequestException('Geçersiz kullanıcı: aksiyon sorumlusu bulunamadı');
        }

        const action = await this.prisma.action.create({
            data: {
                actionId: this.generateActionId(),
                description: data.description,
                ownerId: data.ownerId || userId,
                riskId: data.riskId || null,
                findingId: data.findingId || null,
                controlId: data.controlId || null,
                dueDate: new Date(data.dueDate),
                status: data.status || undefined,
            },
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
        // Whitelist — findingId/riskId/controlId burada DEĞİŞTİRİLEMEZ (iş kuralı + mass-assignment koruması)
        if (data.ownerId) {
            const ownerExists = await this.prisma.user.findUnique({ where: { id: data.ownerId }, select: { id: true } });
            if (!ownerExists) throw new BadRequestException('Geçersiz kullanıcı: aksiyon sorumlusu bulunamadı');
        }

        const action = await this.prisma.action.update({
            where: { id },
            data: {
                description: data.description !== undefined ? data.description : undefined,
                ownerId: data.ownerId !== undefined ? data.ownerId : undefined,
                dueDate: data.dueDate !== undefined ? new Date(data.dueDate) : undefined,
                status: data.status !== undefined ? data.status : undefined,
            },
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

    async extend(id: string, data: { newDueDate: string; reason: string }, userId: string) {
        if (!data.reason) {
            throw new BadRequestException('Extension reason is mandatory');
        }

        const newDueDate = new Date(data.newDueDate);

        const action = await this.prisma.action.update({
            where: { id },
            data: {
                dueDate: newDueDate,
                extensionReason: data.reason,
                extensionApproved: false,
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'EXTEND', entityType: 'Action', entityId: id, newValue: { newDueDate, reason: data.reason } },
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
