import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { CreateMappingDto, ReviewMappingDto } from './dto';
import { writeAudit } from './library.util';

/**
 * Kontrol / test kartı / süreç kartı ↔ kaynak birimi eşleştirmesi. Çoktan çoğa.
 * AI önerileri TASLAK'tır (status = AI_DRAFT); kullanıcı onaylamadan
 * (USER_CONFIRMED) resmî uyum haritasına girmez. "İlişkili" (RELATED) olması
 * "uyum sağlandı" ANLAMINA GELMEZ.
 */
@Injectable()
export class MappingsService {
    constructor(private prisma: PrismaService) {}

    async listForTarget(params: {
        controlId?: string;
        testCardId?: string;
        processCardId?: string;
        status?: string;
    }) {
        const where: Prisma.SourceMappingWhereInput = {};
        if (params.controlId) where.controlId = params.controlId;
        if (params.testCardId) where.testCardId = params.testCardId;
        if (params.processCardId) where.processCardId = params.processCardId;
        if (params.status) where.status = params.status as Prisma.SourceMappingWhereInput['status'];
        return this.prisma.sourceMapping.findMany({
            where,
            orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
            include: {
                version: { select: { id: true, versionLabel: true, source: { select: { id: true, slug: true, title: true, kind: true } } } },
                unit: { select: { id: true, unitCode: true, stableKey: true, title: true } },
            },
        });
    }

    /** Bir kaynak sürümüne bağlı tüm eşleşmeler (kaynağın nerede kullanıldığı). */
    async listForVersion(versionId: string) {
        return this.prisma.sourceMapping.findMany({
            where: { versionId },
            include: {
                control: { select: { id: true, controlId: true, name: true } },
                testCard: { select: { id: true, code: true, title: true } },
                processCard: { select: { id: true, code: true, title: true } },
                unit: { select: { id: true, unitCode: true } },
            },
        });
    }

    async create(dto: CreateMappingDto, userId: string, asAiDraft = false) {
        this.assertTargetShape(dto);
        const version = await this.prisma.sourceVersion.findUnique({ where: { id: dto.versionId } });
        if (!version) throw new BadRequestException('Geçersiz kaynak sürümü');
        if (dto.unitId) {
            const u = await this.prisma.sourceUnit.findFirst({ where: { id: dto.unitId, versionId: dto.versionId } });
            if (!u) throw new BadRequestException('Birim bu sürüme ait değil');
        }
        await this.assertTargetExists(dto);

        const mapping = await this.prisma.sourceMapping.create({
            data: {
                targetType: dto.targetType as Prisma.SourceMappingCreateInput['targetType'],
                controlId: dto.controlId ?? null,
                testCardId: dto.testCardId ?? null,
                processCardId: dto.processCardId ?? null,
                versionId: dto.versionId,
                unitId: dto.unitId ?? null,
                matchType: dto.matchType as Prisma.SourceMappingCreateInput['matchType'],
                status: asAiDraft ? 'AI_DRAFT' : 'PENDING',
                rationale: dto.rationale?.trim() || null,
                bindingType: dto.bindingType ?? null,
                applicabilityRationale: dto.applicabilityRationale?.trim() || null,
                createdById: userId,
            },
        });
        await writeAudit(this.prisma, userId, 'CREATE', 'SourceMapping', mapping.id, null, mapping);
        return mapping;
    }

    async review(id: string, dto: ReviewMappingDto, userId: string) {
        const before = await this.prisma.sourceMapping.findUnique({ where: { id } });
        if (!before) throw new NotFoundException('Eşleştirme bulunamadı');
        const confirming = dto.status === 'USER_CONFIRMED';
        const m = await this.prisma.sourceMapping.update({
            where: { id },
            data: {
                status: dto.status as Prisma.SourceMappingUpdateInput['status'],
                rationale: dto.rationale !== undefined ? dto.rationale.trim() || null : undefined,
                approvedById: confirming ? userId : null,
                approvedAt: confirming ? new Date() : null,
            },
        });
        await writeAudit(this.prisma, userId, 'UPDATE', 'SourceMapping', id, before, m);
        return m;
    }

    async remove(id: string, userId: string) {
        const before = await this.prisma.sourceMapping.findUnique({ where: { id } });
        if (!before) throw new NotFoundException('Eşleştirme bulunamadı');
        await this.prisma.sourceMapping.delete({ where: { id } });
        await writeAudit(this.prisma, userId, 'DELETE', 'SourceMapping', id, before, null);
        return { ok: true };
    }

    /** Kaynak sürümünün kullanıldığı değerlendirme oturumları (soft link — snapshot içinde birim/sürüm izi). */
    async usedInEvaluations(versionId: string) {
        const units = await this.prisma.sourceUnit.findMany({ where: { versionId }, select: { id: true } });
        const unitIds = units.map((u) => u.id);
        if (unitIds.length === 0) return [];
        return this.prisma.aiEvalSession.findMany({
            where: {
                OR: [
                    { sourceUnitIds: { hasSome: unitIds } },
                    { usedSourceUnitIds: { hasSome: unitIds } },
                ],
            },
            select: {
                id: true, title: true, period: true, runStatus: true, outcome: true, updatedAt: true,
                sourceUnitIds: true, usedSourceUnitIds: true,
            },
            orderBy: { updatedAt: 'desc' },
            take: 100,
        });
    }

    private assertTargetShape(dto: CreateMappingDto) {
        const provided: Record<string, string | undefined> = {
            controlId: dto.controlId,
            testCardId: dto.testCardId,
            processCardId: dto.processCardId,
        };
        const keys = Object.keys(provided).filter((k) => provided[k]);
        if (keys.length !== 1) {
            throw new BadRequestException('Tam olarak bir hedef (controlId | testCardId | processCardId) verilmeli');
        }
        const map: Record<string, string> = {
            CONTROL: 'controlId',
            CONTROL_TEST_CARD: 'testCardId',
            PROCESS_SCOPE_CARD: 'processCardId',
        };
        if (map[dto.targetType] && map[dto.targetType] !== keys[0]) {
            throw new BadRequestException('targetType ile verilen hedef alanı uyuşmuyor');
        }
    }

    private async assertTargetExists(dto: CreateMappingDto) {
        if (dto.controlId && !(await this.prisma.control.findUnique({ where: { id: dto.controlId } }))) {
            throw new BadRequestException('Geçersiz kontrol');
        }
        if (dto.testCardId && !(await this.prisma.controlTestCard.findUnique({ where: { id: dto.testCardId } }))) {
            throw new BadRequestException('Geçersiz test kartı');
        }
        if (dto.processCardId && !(await this.prisma.processScopeCard.findUnique({ where: { id: dto.processCardId } }))) {
            throw new BadRequestException('Geçersiz süreç kartı');
        }
    }
}
