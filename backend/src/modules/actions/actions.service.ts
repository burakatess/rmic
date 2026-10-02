import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { nextCounterValue, formatRecordId } from '../../common/util/sequential-id';
import { AuditsService } from '../audits/audits.service';
import { projectActionStatus } from '../../common/workflow/workflow-projection';
import { parseMultiValue, personFieldWhere } from '../../common/util/person-filter';

const normalizeRole = (r?: string): string =>
    ({ ADMIN: 'SYSTEM_ADMIN', RISK_MANAGER: 'RISK_CONTROL_MANAGER', CONTROL_OWNER: 'AUDITEE' }[r ?? ''] ?? r ?? '');

@Injectable()
export class ActionsService {
    constructor(
        private prisma: PrismaService,
        private audits: AuditsService,
    ) { }

    /**
     * Aksiyon var mı + oturum sahibi bu aksiyonu değiştirebilir mi?
     * AUDITEE (denetlenen) yalnızca KENDİ sahip olduğu aksiyonu güncelleyebilir/
     * tamamlayabilir/uzatabilir — başka bir kullanıcının aksiyonuna dokunamaz
     * (Madde 2, nesne bazlı yetkilendirme). Diğer roller mevcut RBAC ile sınırlı.
     */
    private async loadActionForMutation(id: string, userId: string, role?: string) {
        const action = await this.prisma.action.findUnique({ where: { id } });
        if (!action) throw new NotFoundException('Aksiyon bulunamadı');
        if (normalizeRole(role) === 'AUDITEE' && action.ownerId !== userId) {
            throw new ForbiddenException('Yalnızca kendi sorumluluğunuzdaki aksiyonu değiştirebilirsiniz');
        }
        return action;
    }

    /** Atomik sayaçtan A-2026-NNNN (bkz. audits.service.ts ile aynı). */
    private async nextActionId(): Promise<string> {
        return formatRecordId('A', await nextCounterValue(this.prisma, 'action'));
    }

    async findAll(query: any, currentUserId?: string) {
        const { search, ownerId, ownerIds, status, source, riskId, findingId, sortBy, sortOrder, overdue, dueMonth } = query;
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
        const ownerFilter = personFieldWhere('ownerId', ownerIds || ownerId, currentUserId);
        if (ownerFilter) where.AND = [...(where.AND || []), ownerFilter];
        if (status) {
            const statuses = parseMultiValue(status);
            where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
        }
        if (overdue === 'true') {
            where.dueDate = { lt: new Date() };
            where.status = { notIn: ['KAPATILDI', 'CLOSED', 'IPTAL'] };
        } else if (/^\d{4}-\d{2}$/.test(dueMonth || '')) {
            const [year, month] = dueMonth.split('-').map(Number);
            where.dueDate = { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };
        }
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
            ...projectActionStatus(action.status, action.dueDate, now),
            isOverdue: projectActionStatus(action.status, action.dueDate, now).timingStatus === 'GECIKMIS',
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
        return { ...action, ...projectActionStatus(action.status, action.dueDate) };
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
        // Veri modeli: Action.findingId ZORUNLU. `/actions` ve `/findings/:id/actions`
        // aynı ortak domain kuralından geçer (Madde 2). Yalnız riske bağlı, findingId
        // olmayan aksiyon veri modelinde temsil edilemez.
        if (!data.findingId) {
            throw new BadRequestException('Aksiyon bir bulguya bağlı olmalıdır (findingId zorunlu).');
        }
        const findingExists = await this.prisma.finding.findUnique({ where: { id: data.findingId }, select: { id: true } });
        if (!findingExists) throw new BadRequestException('Geçersiz bulgu: seçilen bulgu bulunamadı');
        if (data.controlId) {
            const controlExists = await this.prisma.control.findUnique({ where: { id: data.controlId }, select: { id: true } });
            if (!controlExists) throw new BadRequestException('Geçersiz kontrol: seçilen kontrol bulunamadı');
        }

        // ORTAK domain servisi — otomatik takip, hedef tarih, atomik audit.
        return this.audits.createAction(data.findingId, {
            description: data.description,
            ownerId: data.ownerId || userId,
            responsibleDepartment: data.responsibleDepartment,
            dueDate: data.dueDate,
            notes: data.notes,
            status: data.status,
        }, userId);
    }

    async update(id: string, data: any, userId: string, role?: string) {
        const action = await this.loadActionForMutation(id, userId, role);
        // findingId/riskId/controlId genel update ile DEĞİŞTİRİLEMEZ (whitelist).
        // Tüm aksiyonlar bir bulguya bağlıdır → ORTAK domain servisine delege (Madde 2).
        return this.audits.updateAction(action.findingId, id, {
            description: data.description,
            ownerId: data.ownerId,
            dueDate: data.dueDate,
            status: data.status,
            notes: data.notes,
        }, userId);
    }

    async delete(id: string, userId: string) {
        const action = await this.prisma.action.findUnique({ where: { id } });
        if (!action) throw new NotFoundException('Aksiyon bulunamadı');
        return this.audits.deleteAction(action.findingId, id, userId);
    }

    async complete(id: string, data: { evidenceIds?: string[] }, userId: string, role?: string) {
        const action = await this.loadActionForMutation(id, userId, role);
        if (action.status === 'KAPATILDI' || action.status === 'CLOSED') {
            throw new BadRequestException('Onaylı biçimde kapatılmış aksiyon yeniden tamamlanamaz.');
        }
        const evidenceIds = data.evidenceIds ?? [];
        // "Tamamlandı" — ONAYLI KAPANIŞ DEĞİL. Bulgu kapanışı yalnızca takip
        // onayından geçer (checkAndCloseFindinIfAllActionsClosed KAPATILDI arar).
        return this.prisma.$transaction(async (tx) => {
            if (evidenceIds.length) {
                const linked = await tx.actionAttachment.count({ where: { actionId: id, id: { in: evidenceIds } } });
                if (linked !== evidenceIds.length) throw new BadRequestException('Kanıtlardan biri bu aksiyona bağlı değil veya erişilebilir değil.');
            }
            const updated = await tx.action.update({
                where: { id }, data: { status: 'COMPLETED', completedAt: new Date() },
            });
            await tx.auditLog.create({
                data: { userId, action: 'COMPLETE', entityType: 'Action', entityId: id, oldValue: action, newValue: { ...updated, evidenceIds } },
            });
            return updated;
        });
    }

    async extend(id: string, data: { newDueDate: string; reason: string }, userId: string, role?: string) {
        const action = await this.loadActionForMutation(id, userId, role);
        if (!data.reason) throw new BadRequestException('Extension reason is mandatory');
        if (!data.newDueDate || isNaN(new Date(data.newDueDate).getTime())) {
            throw new BadRequestException('Geçerli bir yeni termin (newDueDate) zorunludur.');
        }

        // ORTAK domain servisi — termin değişimi takip planını ve bulgu hedef
        // tarihini de günceller (Madde 2).
        return this.audits.updateAction(action.findingId, id, {
            dueDate: data.newDueDate,
            extensionReason: data.reason,
            extensionApproved: false,
        }, userId);
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
