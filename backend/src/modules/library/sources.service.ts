import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import {
    CreateSourceDto, UpdateSourceDto, CreateVersionDto, UpdateVersionDto, CreateUnitDto, UpdateUnitDto,
} from './dto';
import { sha256Short, toDate, writeAudit } from './library.util';

@Injectable()
export class SourcesService {
    constructor(private prisma: PrismaService) {}

    // ─── Kaynak ────────────────────────────────────────────────────────────
    async list(params: { q?: string; kind?: string; confidentiality?: string; includeArchived?: boolean }) {
        // Arşivlenmiş (isActive=false) kaynaklar aktif katalogda görünmez; geçmiş atıflar için kayıt korunur.
        const where: Prisma.SourceWhereInput = params.includeArchived ? {} : { isActive: true };
        if (params.kind) where.kind = params.kind as Prisma.SourceWhereInput['kind'];
        if (params.confidentiality) {
            where.confidentiality = params.confidentiality as Prisma.SourceWhereInput['confidentiality'];
        }
        const q = params.q?.trim();
        if (q) {
            where.OR = [
                { title: { contains: q, mode: 'insensitive' } },
                { slug: { contains: q, mode: 'insensitive' } },
                { docCode: { contains: q, mode: 'insensitive' } },
                { publisher: { contains: q, mode: 'insensitive' } },
            ];
        }
        return this.prisma.source.findMany({
            where,
            orderBy: [{ kind: 'asc' }, { title: 'asc' }],
            include: {
                versions: {
                    orderBy: { createdAt: 'desc' },
                    select: {
                        id: true, versionLabel: true, approvalStatus: true, effectiveDate: true, validUntil: true,
                        contentRetrieved: true, supersededById: true,
                        _count: { select: { units: true, chunks: true, mappings: true } },
                    },
                },
            },
        });
    }

    async get(id: string) {
        const s = await this.prisma.source.findUnique({
            where: { id },
            include: {
                versions: {
                    orderBy: { createdAt: 'desc' },
                    include: { _count: { select: { units: true, chunks: true, mappings: true } } },
                },
            },
        });
        if (!s) throw new NotFoundException('Kaynak bulunamadı');
        return s;
    }

    async create(dto: CreateSourceDto, userId: string) {
        const slug = dto.slug.trim().toLowerCase();
        if (await this.prisma.source.findUnique({ where: { slug } })) {
            throw new BadRequestException('Bu slug zaten kullanılıyor');
        }
        const doc = await this.prisma.source.create({
            data: {
                kind: dto.kind as Prisma.SourceCreateInput['kind'],
                slug,
                title: dto.title.trim(),
                publisher: dto.publisher?.trim() || null,
                officialUrl: dto.officialUrl?.trim() || null,
                docCode: dto.docCode?.trim() || null,
                language: dto.language?.trim() || 'en',
                owner: dto.owner?.trim() || null,
                confidentiality: (dto.confidentiality ?? 'PUBLIC') as Prisma.SourceCreateInput['confidentiality'],
                tags: dto.tags ?? [],
                ...this.rightsData(dto),
                createdById: userId,
            },
        });
        await writeAudit(this.prisma, userId, 'CREATE', 'Source', doc.id, null, doc);
        return doc;
    }

    async update(id: string, dto: UpdateSourceDto, userId: string) {
        const before = await this.get(id);
        if (dto.slug && dto.slug.trim().toLowerCase() !== before.slug) {
            if (await this.prisma.source.findUnique({ where: { slug: dto.slug.trim().toLowerCase() } })) {
                throw new BadRequestException('Bu slug zaten kullanılıyor');
            }
        }
        const doc = await this.prisma.source.update({
            where: { id },
            data: {
                kind: dto.kind ? (dto.kind as Prisma.SourceUpdateInput['kind']) : undefined,
                slug: dto.slug ? dto.slug.trim().toLowerCase() : undefined,
                title: dto.title?.trim(),
                publisher: dto.publisher !== undefined ? dto.publisher.trim() || null : undefined,
                officialUrl: dto.officialUrl !== undefined ? dto.officialUrl.trim() || null : undefined,
                docCode: dto.docCode !== undefined ? dto.docCode.trim() || null : undefined,
                language: dto.language?.trim(),
                owner: dto.owner !== undefined ? dto.owner.trim() || null : undefined,
                confidentiality: dto.confidentiality
                    ? (dto.confidentiality as Prisma.SourceUpdateInput['confidentiality'])
                    : undefined,
                tags: dto.tags ?? undefined,
                ...this.rightsData(dto, true),
            },
        });
        await writeAudit(this.prisma, userId, 'UPDATE', 'Source', id, before, doc);
        return doc;
    }

    private rightsData(dto: Partial<CreateSourceDto>, partial = false) {
        const pick = (v?: string) => (partial ? (v as never) : ((v ?? 'UNKNOWN') as never));
        return {
            rightRefLink: pick(dto.rightRefLink),
            rightFullText: pick(dto.rightFullText),
            rightRag: pick(dto.rightRag),
            rightFineTune: pick(dto.rightFineTune),
            rightExport: pick(dto.rightExport),
            rightsNote: partial
                ? dto.rightsNote !== undefined
                    ? dto.rightsNote.trim() || null
                    : undefined
                : dto.rightsNote?.trim() || null,
        };
    }

    // ─── Sürüm ─────────────────────────────────────────────────────────────
    async addVersion(sourceId: string, dto: CreateVersionDto, userId: string) {
        await this.get(sourceId);
        const label = dto.versionLabel.trim();
        const clash = await this.prisma.sourceVersion.findFirst({ where: { sourceId, versionLabel: label } });
        if (clash) throw new BadRequestException('Bu sürüm etiketi bu kaynakta zaten var');

        const fullText = dto.fullText?.trim() || null;
        const version = await this.prisma.$transaction(async (tx) => {
            const created = await tx.sourceVersion.create({
                data: {
                    sourceId,
                    versionLabel: label,
                    publishDate: toDate(dto.publishDate),
                    effectiveDate: toDate(dto.effectiveDate),
                    validUntil: toDate(dto.validUntil),
                    accessedAt: toDate(dto.accessedAt) ?? new Date(),
                    fullText,
                    contentHash: fullText ? sha256Short(fullText) : null,
                    contentRetrieved: dto.contentRetrieved ?? !!fullText,
                    storageNote: dto.storageNote?.trim() || null,
                    approvalStatus: (dto.approvalStatus ?? 'DRAFT') as Prisma.SourceVersionCreateInput['approvalStatus'],
                },
            });
            // Yeni sürüm eskisini EZMEZ — yalnızca "yerine geçer" ilişkisi kurulur;
            // eski sürüm ve ona bağlı değerlendirmeler yerinde kalır.
            if (dto.supersedesVersionId) {
                const old = await tx.sourceVersion.findFirst({
                    where: { id: dto.supersedesVersionId, sourceId },
                });
                if (!old) throw new BadRequestException('Yerine geçilecek sürüm bu kaynakta bulunamadı');
                await tx.sourceVersion.update({
                    where: { id: old.id },
                    data: { supersededById: created.id, approvalStatus: 'SUPERSEDED' },
                });
            }
            return created;
        });
        await writeAudit(this.prisma, userId, 'CREATE', 'SourceVersion', version.id, null, version);
        return version;
    }

    async getVersion(id: string) {
        const v = await this.prisma.sourceVersion.findUnique({
            where: { id },
            include: {
                source: true,
                units: { orderBy: { stableKey: 'asc' } },
                supersedes: { select: { id: true, versionLabel: true } },
                supersededBy: { select: { id: true, versionLabel: true } },
                _count: { select: { chunks: true, mappings: true } },
            },
        });
        if (!v) throw new NotFoundException('Sürüm bulunamadı');
        return v;
    }

    async updateVersion(id: string, dto: UpdateVersionDto, userId: string) {
        const before = await this.getVersion(id);
        const fullText = dto.fullText !== undefined ? dto.fullText.trim() || null : undefined;
        const v = await this.prisma.sourceVersion.update({
            where: { id },
            data: {
                versionLabel: dto.versionLabel?.trim(),
                publishDate: dto.publishDate !== undefined ? toDate(dto.publishDate) : undefined,
                effectiveDate: dto.effectiveDate !== undefined ? toDate(dto.effectiveDate) : undefined,
                validUntil: dto.validUntil !== undefined ? toDate(dto.validUntil) : undefined,
                accessedAt: dto.accessedAt !== undefined ? toDate(dto.accessedAt) : undefined,
                fullText,
                contentHash: fullText !== undefined ? (fullText ? sha256Short(fullText) : null) : undefined,
                contentRetrieved: dto.contentRetrieved,
                storageNote: dto.storageNote !== undefined ? dto.storageNote.trim() || null : undefined,
                approvalStatus: dto.approvalStatus
                    ? (dto.approvalStatus as Prisma.SourceVersionUpdateInput['approvalStatus'])
                    : undefined,
                // Tam metin değiştiyse içerik incelemesi ve indeks güncelliği düşer.
                ...(fullText !== undefined && fullText !== before.fullText
                    ? { contentReviewedAt: null, contentReviewedById: null, ...this.staleIndex(before) }
                    : {}),
            },
        });
        await writeAudit(this.prisma, userId, 'UPDATE', 'SourceVersion', id, before, v);
        return v;
    }

    /** İçerik değişince indeksi STALE'e çeker (READY ise); "hazır" sessizce kalmasın. */
    private staleIndex(v: { indexStatus: string }) {
        return v.indexStatus === 'READY'
            ? { indexStatus: 'STALE' as Prisma.SourceVersionUpdateInput['indexStatus'], contentChangedAt: new Date() }
            : { contentChangedAt: new Date() };
    }

    // ─── Birim (madde / kontrol) ───────────────────────────────────────────
    async addUnit(versionId: string, dto: CreateUnitDto, userId: string) {
        await this.getVersion(versionId);
        const stableKey = dto.stableKey.trim();
        const clash = await this.prisma.sourceUnit.findFirst({ where: { versionId, stableKey } });
        if (clash) throw new BadRequestException('Bu birim anahtarı bu sürümde zaten var');
        const version = await this.getVersion(versionId);
        const unit = await this.prisma.sourceUnit.create({
            data: {
                versionId,
                stableKey,
                unitCode: dto.unitCode.trim(),
                unitType: dto.unitType ?? 'clause',
                title: dto.title.trim(),
                // ÖZGÜN metin ile çeviri/yorum AYRI tutulur.
                originalText: dto.originalText,
                translationTr: dto.translationTr?.trim() || null,
                commentaryTr: dto.commentaryTr?.trim() || null,
                locator: (dto.locator ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                scope: dto.scope?.trim() || null,
                riskAreas: dto.riskAreas ?? [],
                parentKey: dto.parentKey?.trim() || null,
            },
        });
        // Birim değişikliği → içerik incelemesi + indeks güncelliği düşer.
        await this.prisma.sourceVersion.update({
            where: { id: versionId },
            data: { contentReviewedAt: null, contentReviewedById: null, ...this.staleIndex(version) },
        });
        await writeAudit(this.prisma, userId, 'CREATE', 'SourceUnit', unit.id, null, unit);
        return unit;
    }

    async updateUnit(id: string, dto: UpdateUnitDto, userId: string) {
        const before = await this.prisma.sourceUnit.findUnique({ where: { id }, include: { version: true } });
        if (!before) throw new NotFoundException('Birim bulunamadı');
        const textChanged = dto.originalText !== undefined && dto.originalText !== before.originalText;
        const unit = await this.prisma.sourceUnit.update({
            where: { id },
            data: {
                stableKey: dto.stableKey?.trim(),
                unitCode: dto.unitCode?.trim(),
                unitType: dto.unitType,
                title: dto.title?.trim(),
                originalText: dto.originalText,
                translationTr: dto.translationTr !== undefined ? dto.translationTr.trim() || null : undefined,
                commentaryTr: dto.commentaryTr !== undefined ? dto.commentaryTr.trim() || null : undefined,
                locator: dto.locator !== undefined ? (dto.locator as Prisma.InputJsonValue) : undefined,
                scope: dto.scope !== undefined ? dto.scope.trim() || null : undefined,
                riskAreas: dto.riskAreas ?? undefined,
                parentKey: dto.parentKey !== undefined ? dto.parentKey.trim() || null : undefined,
            },
        });
        if (textChanged) {
            await this.prisma.sourceVersion.update({
                where: { id: before.versionId },
                data: { contentReviewedAt: null, contentReviewedById: null, ...this.staleIndex(before.version) },
            });
        }
        await writeAudit(this.prisma, userId, 'UPDATE', 'SourceUnit', id, before, unit);
        return unit;
    }

    async removeUnit(id: string, userId: string) {
        const before = await this.prisma.sourceUnit.findUnique({ where: { id }, include: { version: true } });
        if (!before) throw new NotFoundException('Birim bulunamadı');
        await this.prisma.sourceUnit.delete({ where: { id } });
        await this.prisma.sourceVersion.update({
            where: { id: before.versionId },
            data: { contentReviewedAt: null, contentReviewedById: null, ...this.staleIndex(before.version) },
        });
        await writeAudit(this.prisma, userId, 'DELETE', 'SourceUnit', id, before, null);
        return { ok: true };
    }

    // ─── İçerik incelemesi / kullanım hakkı onayı (AYRI adımlar) ────────────

    /** İçerik incelemesi tamam — metin/birimler doğru ve kullanılabilir. Hak onayı DEĞİL. */
    async reviewContent(versionId: string, userId: string) {
        const v = await this.getVersion(versionId);
        if (v.units.length === 0 && !v.fullText?.trim()) {
            throw new BadRequestException('İncelenecek içerik yok — önce birim (madde/kontrol) ya da tam metin ekleyin.');
        }
        const updated = await this.prisma.sourceVersion.update({
            where: { id: versionId },
            data: { contentReviewedById: userId, contentReviewedAt: new Date() },
        });
        await writeAudit(this.prisma, userId, 'UPDATE', 'SourceVersion', versionId,
            { contentReviewedAt: v.contentReviewedAt }, { contentReviewedAt: updated.contentReviewedAt });
        return updated;
    }

    /**
     * Kullanım hakkı onayı — içerik incelemesinden AYRI. Dayanak (lisans/karar/yazışma)
     * ve onaylayan zorunlu. Sistem kendiliğinden ALLOWED yapmaz; bu yalnız yetkili
     * kullanıcının açık işaretlemesidir.
     */
    async verifyRights(
        sourceId: string,
        dto: {
            basis: string;
            rightRefLink?: string; rightFullText?: string; rightRag?: string;
            rightFineTune?: string; rightExport?: string;
        },
        userId: string,
    ) {
        const before = await this.get(sourceId);
        if (!dto.basis?.trim()) throw new BadRequestException('Kullanım hakkı dayanağı (lisans/karar/yazışma) zorunlu.');
        const doc = await this.prisma.source.update({
            where: { id: sourceId },
            data: {
                rightRefLink: (dto.rightRefLink ?? before.rightRefLink) as Prisma.SourceUpdateInput['rightRefLink'],
                rightFullText: (dto.rightFullText ?? before.rightFullText) as Prisma.SourceUpdateInput['rightFullText'],
                rightRag: (dto.rightRag ?? before.rightRag) as Prisma.SourceUpdateInput['rightRag'],
                rightFineTune: (dto.rightFineTune ?? before.rightFineTune) as Prisma.SourceUpdateInput['rightFineTune'],
                rightExport: (dto.rightExport ?? before.rightExport) as Prisma.SourceUpdateInput['rightExport'],
                rightsBasis: dto.basis.trim(),
                rightsVerifiedById: userId,
                rightsVerifiedAt: new Date(),
            },
        });
        await writeAudit(this.prisma, userId, 'UPDATE', 'Source', sourceId,
            { rights: { rag: before.rightRag, fullText: before.rightFullText }, verifiedAt: before.rightsVerifiedAt },
            { rights: { rag: doc.rightRag, fullText: doc.rightFullText }, verifiedAt: doc.rightsVerifiedAt, basis: doc.rightsBasis });
        return doc;
    }

    /** Kullanım hakkı geri alma — mevcut değerlendirme snapshot'ları korunur, yeni koşu bloklanır. */
    async revokeRights(sourceId: string, reason: string, userId: string) {
        const before = await this.get(sourceId);
        const doc = await this.prisma.source.update({
            where: { id: sourceId },
            data: {
                rightRag: 'DENIED', rightFullText: 'DENIED',
                rightsBasis: `[GERİ ALINDI ${new Date().toISOString().slice(0, 10)}] ${reason.trim()}`,
                rightsVerifiedById: userId,
                rightsVerifiedAt: new Date(),
            },
        });
        await writeAudit(this.prisma, userId, 'UPDATE', 'Source', sourceId,
            { rightRag: before.rightRag }, { rightRag: doc.rightRag, revoked: true, reason });
        return doc;
    }

    // ─── HAZIRLIK DURUMU — 5 kontrol (kullanıcı 5 teknik adımı bilmesin) ────
    async readiness(versionId: string) {
        const v = await this.prisma.sourceVersion.findUnique({
            where: { id: versionId },
            include: { source: true, _count: { select: { units: true } } },
        });
        if (!v) throw new NotFoundException('Sürüm bulunamadı');
        const hasContent = v._count.units > 0 || !!v.fullText?.trim();
        const contentReviewed = !!v.contentReviewedAt;
        const ragVerified = v.source.rightRag === 'ALLOWED' && !!v.source.rightsVerifiedAt;
        const indexReady = v.indexStatus === 'READY';
        const approved = v.approvalStatus === 'APPROVED';
        // Manuel seçim: onaylı + hak izinli + erişilebilir yeterli (indeks GEREKMEZ).
        const manualSelectable = hasContent && approved && ragVerified;
        // Otomatik retrieval (öneri + anlamsal arama): ek olarak güncel indeks gerekir.
        const autoRetrievalReady = manualSelectable && indexReady;

        const steps = [
            { key: 'content', label: 'Metin / birim mevcut', done: hasContent,
              action: hasContent ? null : { verb: 'addUnit', role: 'WRITE', hint: 'Madde/kontrol birimi veya tam metin ekleyin.' } },
            { key: 'contentReview', label: 'İçerik incelemesi tamamlandı', done: contentReviewed,
              action: contentReviewed ? null : { verb: 'reviewContent', role: 'WRITE', hint: 'Metin doğru/eksiksiz mi teyit edin.' } },
            { key: 'approval', label: 'Sürüm onaylı (APPROVED)', done: approved,
              action: approved ? null : { verb: 'approveVersion', role: 'WRITE', hint: 'İçerik incelemesi sonrası sürümü onaylayın.' } },
            { key: 'rights', label: 'RAG kullanım hakkı doğrulandı', done: ragVerified,
              action: ragVerified ? null : { verb: 'verifyRights', role: 'WRITE', hint: 'Lisans/karar dayanağıyla RAG hakkını işaretleyin.' } },
            { key: 'index', label: 'RAG indeksi güncel', done: indexReady, optional: true,
              action: indexReady ? null : { verb: 'buildIndex', role: 'WRITE', hint: manualSelectable ? 'Otomatik öneri/arama için indeks üretin (manuel seçim için gerekmez).' : 'Önce onay + hak adımları.' } },
        ];

        return {
            versionId: v.id,
            versionLabel: v.versionLabel,
            source: { id: v.source.id, slug: v.source.slug, title: v.source.title, rightRag: v.source.rightRag },
            indexStatus: v.indexStatus,
            indexError: v.indexError,
            indexAttempts: v.indexAttempts,
            indexChunkCount: v.indexChunkCount,
            steps,
            manualSelectable,
            autoRetrievalReady,
            usableInEvaluation: manualSelectable, // manuel seçimle değerlendirmede kullanılabilir
        };
    }

    // ─── Sürüm karşılaştırması ─────────────────────────────────────────────
    async diffVersions(aId: string, bId: string) {
        const [a, b] = await Promise.all([
            this.prisma.sourceVersion.findUnique({ where: { id: aId }, include: { units: true, source: true } }),
            this.prisma.sourceVersion.findUnique({ where: { id: bId }, include: { units: true, source: true } }),
        ]);
        if (!a || !b) throw new NotFoundException('Sürüm bulunamadı');
        if (a.sourceId !== b.sourceId) throw new BadRequestException('Farklı kaynakların sürümleri karşılaştırılamaz');

        const byKey = (units: typeof a.units) => new Map(units.map((u) => [u.stableKey, u]));
        const ma = byKey(a.units);
        const mb = byKey(b.units);
        const added = [...mb.keys()].filter((k) => !ma.has(k));
        const removed = [...ma.keys()].filter((k) => !mb.has(k));
        const changed = [...mb.keys()]
            .filter((k) => ma.has(k))
            .filter((k) => ma.get(k)!.originalText.trim() !== mb.get(k)!.originalText.trim())
            .map((k) => ({ stableKey: k, from: ma.get(k)!.unitCode, to: mb.get(k)!.unitCode, title: mb.get(k)!.title }));

        return {
            source: { id: a.sourceId, title: a.source.title },
            from: { id: a.id, label: a.versionLabel },
            to: { id: b.id, label: b.versionLabel },
            addedKeys: added,
            removedKeys: removed,
            changed,
            // Değişen maddelerden etkilenen eşleşmeler (yeniden inceleme adayı).
            affectedMappingKeys: [...new Set([...removed, ...changed.map((c) => c.stableKey)])],
        };
    }

    /** Değişen/kalkan birimlere bağlı eşleşmeleri "yeniden inceleme gerekli" olarak işaretler (otomatik uyumsuzluk İLAN ETMEZ). */
    async flagReReview(versionId: string, changedUnitKeys: string[], userId: string) {
        const units = await this.prisma.sourceUnit.findMany({
            where: { versionId, stableKey: { in: changedUnitKeys } },
            select: { id: true },
        });
        const unitIds = units.map((u) => u.id);
        if (unitIds.length === 0) return { flagged: 0 };
        const res = await this.prisma.sourceMapping.updateMany({
            where: { unitId: { in: unitIds }, status: 'USER_CONFIRMED' },
            data: { status: 'PENDING', rationale: 'Kaynak birimi değişti — yeniden inceleme gerekli.' },
        });
        await writeAudit(this.prisma, userId, 'UPDATE', 'SourceMapping', versionId, null, {
            reReviewFlagged: res.count,
            keys: changedUnitKeys,
        });
        return { flagged: res.count };
    }
}
