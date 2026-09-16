import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import {
    CardStatusDto, UpsertEvidenceRuleDto, UpsertProcessCardDto, UpsertTestCardDto,
} from './dto';
import { writeAudit } from './library.util';

const J = (v: unknown) => (v ?? Prisma.JsonNull);

/**
 * Kontrol test kartları, borsa süreç kapsam kartları ve kanıt yeterliliği
 * rehberi. Taslak kartlar kurum politikası / resmî standart OLARAK SUNULMAZ —
 * `origin` ve `status` bunu açıkça ayırır.
 */
@Injectable()
export class CardsService {
    constructor(private prisma: PrismaService) {}

    // ─── Kontrol test kartı ────────────────────────────────────────────────
    listTestCards(params: { status?: string; topicNo?: number }) {
        const where: Prisma.ControlTestCardWhereInput = {};
        if (params.status) where.status = params.status as Prisma.ControlTestCardWhereInput['status'];
        if (params.topicNo) where.topicNo = params.topicNo;
        return this.prisma.controlTestCard.findMany({
            where,
            orderBy: [{ topicNo: 'asc' }, { code: 'asc' }],
            include: {
                _count: { select: { mappings: true, scenarios: true } },
                mappings: { select: { status: true } },
            },
        });
    }

    async getTestCard(id: string) {
        const c = await this.prisma.controlTestCard.findUnique({
            where: { id },
            include: {
                relatedControl: { select: { id: true, controlId: true, name: true } },
                mappings: {
                    include: {
                        version: { select: { versionLabel: true, source: { select: { slug: true, title: true } } } },
                        unit: { select: { unitCode: true, title: true } },
                    },
                },
                scenarios: { select: { id: true, scenarioId: true, kind: true, status: true } },
            },
        });
        if (!c) throw new NotFoundException('Test kartı bulunamadı');
        return c;
    }

    async upsertTestCard(dto: UpsertTestCardDto, userId: string) {
        const code = dto.code.trim();
        const existing = await this.prisma.controlTestCard.findUnique({ where: { code } });
        const data = {
            topicNo: dto.topicNo ?? null,
            title: dto.title.trim(),
            origin: (dto.origin ?? 'AI_DRAFT') as Prisma.ControlTestCardCreateInput['origin'],
            purposeRisk: dto.purposeRisk,
            scopePrereq: dto.scopePrereq,
            method: dto.method,
            steps: J(dto.steps),
            expectedState: dto.expectedState,
            requestedEvidence: J(dto.requestedEvidence),
            evidenceSufficiency: dto.evidenceSufficiency,
            decisionCriteria: J(dto.decisionCriteria),
            misleadingSignals: dto.misleadingSignals,
            sampleControlResult: dto.sampleControlResult,
            sampleEvidenceRequest: dto.sampleEvidenceRequest,
            relatedControlId: dto.relatedControlId || null,
        };
        if (existing) {
            const c = await this.prisma.controlTestCard.update({
                where: { code },
                data: { ...data, version: { increment: 1 } },
            });
            await writeAudit(this.prisma, userId, 'UPDATE', 'ControlTestCard', c.id, existing, c);
            return c;
        }
        const c = await this.prisma.controlTestCard.create({ data: { code, createdById: userId, ...data } });
        await writeAudit(this.prisma, userId, 'CREATE', 'ControlTestCard', c.id, null, c);
        return c;
    }

    async setTestCardStatus(id: string, dto: CardStatusDto, userId: string) {
        const before = await this.getTestCard(id);
        if (dto.status === 'APPROVED') {
            // Onaydan önce en az bir onaylı kaynak eşleştirmesi olmalı (grounding şartı).
            const confirmed = before.mappings.some((m) => m.status === 'USER_CONFIRMED');
            if (!confirmed) {
                throw new BadRequestException(
                    'Onay için en az bir onaylı (USER_CONFIRMED) kaynak eşleştirmesi gerekli — "eşleştirme bekliyor" durumundaki kart onaylanamaz.',
                );
            }
        }
        const c = await this.prisma.controlTestCard.update({
            where: { id },
            data: { status: dto.status as Prisma.ControlTestCardUpdateInput['status'] },
        });
        await writeAudit(this.prisma, userId, 'UPDATE', 'ControlTestCard', id, { status: before.status }, { status: c.status });
        return c;
    }

    // ─── Süreç kapsam kartı ────────────────────────────────────────────────
    listProcessCards(area?: string) {
        return this.prisma.processScopeCard.findMany({
            where: area ? { area } : {},
            orderBy: { code: 'asc' },
            include: { _count: { select: { mappings: true } } },
        });
    }

    async getProcessCard(id: string) {
        const c = await this.prisma.processScopeCard.findUnique({
            where: { id },
            include: {
                mappings: {
                    include: {
                        version: { select: { versionLabel: true, source: { select: { slug: true, title: true } } } },
                        unit: { select: { unitCode: true } },
                    },
                },
            },
        });
        if (!c) throw new NotFoundException('Süreç kartı bulunamadı');
        return c;
    }

    async upsertProcessCard(dto: UpsertProcessCardDto, userId: string) {
        const code = dto.code.trim();
        const existing = await this.prisma.processScopeCard.findUnique({ where: { code } });
        const data = {
            title: dto.title.trim(),
            area: dto.area,
            description: dto.description,
            criticalAssets: J(dto.criticalAssets),
            paramSpec: J(dto.paramSpec),
            linkedControlIds: dto.linkedControlIds ?? [],
        };
        if (existing) {
            const c = await this.prisma.processScopeCard.update({ where: { code }, data });
            await writeAudit(this.prisma, userId, 'UPDATE', 'ProcessScopeCard', c.id, existing, c);
            return c;
        }
        const c = await this.prisma.processScopeCard.create({ data: { code, createdById: userId, ...data } });
        await writeAudit(this.prisma, userId, 'CREATE', 'ProcessScopeCard', c.id, null, c);
        return c;
    }

    async setProcessCardStatus(id: string, dto: CardStatusDto, userId: string) {
        await this.getProcessCard(id);
        const c = await this.prisma.processScopeCard.update({
            where: { id },
            data: { status: dto.status as Prisma.ProcessScopeCardUpdateInput['status'] },
        });
        await writeAudit(this.prisma, userId, 'UPDATE', 'ProcessScopeCard', id, null, { status: c.status });
        return c;
    }

    // ─── Kanıt yeterliliği rehberi ─────────────────────────────────────────
    listEvidenceRules(category?: string) {
        return this.prisma.evidenceSufficiencyRule.findMany({
            where: category ? { category } : {},
            orderBy: [{ category: 'asc' }, { orderNo: 'asc' }, { code: 'asc' }],
        });
    }

    async upsertEvidenceRule(dto: UpsertEvidenceRuleDto, userId: string) {
        const code = dto.code.trim();
        const existing = await this.prisma.evidenceSufficiencyRule.findUnique({ where: { code } });
        const data = {
            category: dto.category,
            title: dto.title.trim(),
            rule: dto.rule,
            goodExample: dto.goodExample?.trim() || null,
            badExample: dto.badExample?.trim() || null,
            scoringSpec: J(dto.scoringSpec),
            orderNo: dto.orderNo ?? 0,
        };
        if (existing) {
            const r = await this.prisma.evidenceSufficiencyRule.update({ where: { code }, data });
            await writeAudit(this.prisma, userId, 'UPDATE', 'EvidenceSufficiencyRule', r.id, existing, r);
            return r;
        }
        const r = await this.prisma.evidenceSufficiencyRule.create({ data: { code, createdById: userId, ...data } });
        await writeAudit(this.prisma, userId, 'CREATE', 'EvidenceSufficiencyRule', r.id, null, r);
        return r;
    }
}
