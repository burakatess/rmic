import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { KnowledgeDocKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { CreateKnowledgeDocDto, UpdateKnowledgeDocDto } from './dto';

/**
 * Kurumsal Kaynak Kütüphanesi — AI Kontrol & Kanıt Değerlendirme'nin grounding
 * katmanı. Mevzuat maddeleri (RegulationArticle) gibi elle seçilip oturuma
 * snapshot'lanır. Yazma yalnızca yönetici rolleri; okuma AI değerlendirme rolleri.
 */
@Injectable()
export class KnowledgeService {
    constructor(private prisma: PrismaService) {}

    async search(params: { q?: string; kind?: KnowledgeDocKind; category?: string; includeInactive?: boolean }) {
        const where: Prisma.KnowledgeDocWhereInput = {};
        if (!params.includeInactive) where.isActive = true;
        if (params.kind) where.kind = params.kind;
        if (params.category) where.category = params.category;
        const q = params.q?.trim();
        if (q) {
            where.OR = [
                { code: { contains: q, mode: 'insensitive' } },
                { title: { contains: q, mode: 'insensitive' } },
                { body: { contains: q, mode: 'insensitive' } },
            ];
        }
        return this.prisma.knowledgeDoc.findMany({
            where,
            orderBy: [{ kind: 'asc' }, { code: 'asc' }],
            take: 50,
        });
    }

    async get(id: string) {
        const doc = await this.prisma.knowledgeDoc.findUnique({ where: { id } });
        if (!doc) throw new NotFoundException('Kaynak dokümanı bulunamadı');
        return doc;
    }

    async create(dto: CreateKnowledgeDocDto, userId: string) {
        const code = dto.code.trim();
        const clash = await this.prisma.knowledgeDoc.findUnique({ where: { code } });
        if (clash) throw new BadRequestException('Bu kaynak kodu zaten kullanılıyor');

        const doc = await this.prisma.knowledgeDoc.create({
            data: {
                kind: dto.kind,
                code,
                title: dto.title.trim(),
                body: dto.body,
                category: dto.category?.trim() || null,
                tags: dto.tags ?? [],
                sourceRef: dto.sourceRef?.trim() || null,
                effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : null,
                createdById: userId,
            },
        });
        await this.writeAudit(userId, 'CREATE', doc.id, null, doc);
        return doc;
    }

    async update(id: string, dto: UpdateKnowledgeDocDto, userId: string) {
        const existing = await this.get(id);

        if (dto.code && dto.code.trim() !== existing.code) {
            const clash = await this.prisma.knowledgeDoc.findUnique({ where: { code: dto.code.trim() } });
            if (clash) throw new BadRequestException('Bu kaynak kodu zaten kullanılıyor');
        }

        const doc = await this.prisma.knowledgeDoc.update({
            where: { id },
            data: {
                kind: dto.kind ?? undefined,
                code: dto.code?.trim() ?? undefined,
                title: dto.title?.trim() ?? undefined,
                body: dto.body ?? undefined,
                category: dto.category !== undefined ? dto.category.trim() || null : undefined,
                tags: dto.tags ?? undefined,
                sourceRef: dto.sourceRef !== undefined ? dto.sourceRef.trim() || null : undefined,
                effectiveDate:
                    dto.effectiveDate !== undefined
                        ? dto.effectiveDate
                            ? new Date(dto.effectiveDate)
                            : null
                        : undefined,
                isActive: dto.isActive ?? undefined,
            },
        });
        await this.writeAudit(userId, 'UPDATE', doc.id, existing, doc);
        return doc;
    }

    /** Kalıcı silme yerine pasifleştir — geçmiş değerlendirme snapshot'ları korunur. */
    async remove(id: string, userId: string) {
        const existing = await this.get(id);
        const doc = await this.prisma.knowledgeDoc.update({ where: { id }, data: { isActive: false } });
        await this.writeAudit(userId, 'DELETE', id, existing, doc);
        return { ok: true };
    }

    private async writeAudit(
        userId: string,
        action: string,
        entityId: string,
        oldValue: unknown,
        newValue: unknown,
    ) {
        await this.prisma.auditLog
            .create({
                data: {
                    userId,
                    action,
                    entityType: 'KnowledgeDoc',
                    entityId,
                    oldValue: oldValue ?? Prisma.JsonNull,
                    newValue: newValue ?? Prisma.JsonNull,
                },
            })
            .catch(() => undefined);
    }
}
