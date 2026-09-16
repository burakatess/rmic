import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { AiEmbeddingService } from '../ai/ai-embedding.service';
import { RetrievalQueryDto } from './dto';
import { writeAudit } from './library.util';

interface ViewerScope {
    /** Kullanıcının görebileceği en yüksek gizlilik seviyesi. */
    maxConfidentiality: 'PUBLIC' | 'INTERNAL' | 'RESTRICTED' | 'CONFIDENTIAL';
}

const CONF_ORDER = ['PUBLIC', 'INTERNAL', 'RESTRICTED', 'CONFIDENTIAL'] as const;

/** Manuel seçimde bir birimin değerlendirmeye eklenebileceği azami metin uzunluğu. */
export const UNIT_TEXT_LIMIT = 8000;

/**
 * Sürümlü, yetkilendirilmiş kaynaklardan retrieval. Öncelik fine-tuning DEĞİL.
 * Yetki filtresi retrieval'dan ÖNCE uygulanır: yetkisiz kaynaklar embedding
 * araması veya sonuç özeti üzerinden kullanıcıya sızmaz. Kaynak içindeki
 * talimatlar uygulama talimatı olarak yürütülmez (yalnız referans veri).
 *
 * İki ayrı yol:
 *   - MANUEL SEÇİM (lookupUnits): onaylı + hak izinli + erişilebilir kısa birim,
 *     embedding servisi KAPALI olsa bile tam ID/kod ile seçilebilir.
 *   - OTOMATİK RETRIEVAL (search): öneri + anlamsal arama; güncel indeks (READY) gerekir.
 */
@Injectable()
export class RetrievalService {
    constructor(
        private prisma: PrismaService,
        private embeddings: AiEmbeddingService,
    ) {}

    private allowedConf(viewer: ViewerScope): string[] {
        return [...CONF_ORDER].slice(0, CONF_ORDER.indexOf(viewer.maxConfidentiality) + 1);
    }

    // ─── RAG indeksleme — iş kaydıyla (başarı/hata/yeniden deneme görünür) ──
    async buildIndex(versionId: string, userId: string) {
        const version = await this.prisma.sourceVersion.findUnique({
            where: { id: versionId },
            include: { source: true, units: { orderBy: { stableKey: 'asc' } } },
        });
        if (!version) throw new BadRequestException('Sürüm bulunamadı');
        if (version.approvalStatus !== 'APPROVED') {
            throw new BadRequestException('İndeksleme için sürüm APPROVED olmalı (önce içerik incelemesi + onay).');
        }
        if (version.source.rightRag !== 'ALLOWED' || !version.source.rightsVerifiedAt) {
            throw new BadRequestException(
                `RAG kullanım hakkı doğrulanmadı (rightRag="${version.source.rightRag}"). Kısıtlı kaynakta yalnız metadata + resmî bağlantı saklanır.`,
            );
        }
        if (!this.embeddings.enabled) {
            throw new BadRequestException(
                'Embedding servisi kapalı (AI_ENABLED). Manuel seçim yine çalışır; otomatik öneri/arama için servis açık olmalı.',
            );
        }

        const prevAttempts = version.indexAttempts;
        const job = await this.prisma.sourceIndexJob.create({
            data: { versionId, status: 'RUNNING', attempt: prevAttempts + 1, createdById: userId },
        });
        await this.prisma.sourceVersion.update({
            where: { id: versionId },
            data: { indexStatus: 'RUNNING', indexAttempts: prevAttempts + 1, indexError: null },
        });

        try {
            const raw: { text: string; unitId: string | null }[] = [];
            if (version.units.length) {
                for (const u of version.units) {
                    raw.push({ text: `${u.unitCode} — ${u.title}\n${u.originalText}`.slice(0, 4000), unitId: u.id });
                }
            } else if (version.fullText?.trim()) {
                const txt = version.fullText.trim();
                for (let i = 0; i < txt.length && i < 400_000; i += 1200) {
                    raw.push({ text: txt.slice(i, i + 1400), unitId: null });
                }
            }
            if (raw.length === 0) throw new Error('İndekslenecek metin yok (birim veya tam metin ekleyin).');

            const vectors = await this.embeddings.embed(raw.map((r) => r.text));
            await this.prisma.$transaction(async (tx) => {
                await tx.sourceChunk.deleteMany({ where: { versionId } });
                for (let i = 0; i < raw.length; i++) {
                    await tx.sourceChunk.create({
                        data: {
                            versionId,
                            unitId: raw[i].unitId,
                            ordinal: i,
                            text: raw[i].text,
                            embedding: vectors[i] ?? [],
                            embedModel: this.embeddings.enabled ? 'configured' : null,
                            tokenCount: Math.round(raw[i].text.length / 4),
                        },
                    });
                }
            });

            await this.prisma.sourceIndexJob.update({
                where: { id: job.id },
                data: { status: 'READY', chunkCount: raw.length, finishedAt: new Date() },
            });
            await this.prisma.sourceVersion.update({
                where: { id: versionId },
                data: { indexStatus: 'READY', indexedAt: new Date(), indexChunkCount: raw.length, indexError: null },
            });
            await writeAudit(this.prisma, userId, 'UPDATE', 'SourceVersion', versionId, null, { indexBuilt: raw.length });
            return { jobId: job.id, status: 'READY', chunks: raw.length };
        } catch (e) {
            const msg = (e as Error).message.slice(0, 500);
            await this.prisma.sourceIndexJob.update({
                where: { id: job.id },
                data: { status: 'ERROR', error: msg, finishedAt: new Date() },
            });
            await this.prisma.sourceVersion.update({
                where: { id: versionId },
                data: { indexStatus: 'ERROR', indexError: msg },
            });
            throw new BadRequestException(`İndeksleme başarısız: ${msg}. "Yeniden dene" ile tekrar başlatabilirsiniz.`);
        }
    }

    listIndexJobs(versionId: string) {
        return this.prisma.sourceIndexJob.findMany({
            where: { versionId },
            orderBy: { startedAt: 'desc' },
            take: 20,
        });
    }

    // ─── MANUEL SEÇİM — embedding GEREKMEZ ─────────────────────────────────
    /**
     * Onaylı + RAG hakkı izinli + erişilebilir birimleri tam kod/ID ile ya da
     * kısa metinle bulur. İndeks (chunk) durumu KOŞUL DEĞİL — kullanıcı bir
     * SourceUnit'i seçip metnini değerlendirmeye ekleyebilsin diye.
     */
    async lookupUnits(params: { code?: string; q?: string; versionId?: string }, viewer: ViewerScope) {
        const allowedConf = this.allowedConf(viewer);
        const versionWhere: Prisma.SourceVersionWhereInput = {
            approvalStatus: 'APPROVED',
            source: {
                confidentiality: { in: allowedConf as never },
                rightRag: 'ALLOWED',
                rightsVerifiedAt: { not: null },
            },
        };
        if (params.versionId) versionWhere.id = params.versionId;

        const unitWhere: Prisma.SourceUnitWhereInput = { version: versionWhere };
        const code = params.code?.trim();
        const q = params.q?.trim();
        if (code) {
            unitWhere.OR = [
                { unitCode: { equals: code, mode: 'insensitive' } },
                { stableKey: { equals: code, mode: 'insensitive' } },
            ];
        } else if (q && q.length >= 2) {
            unitWhere.OR = [
                { unitCode: { contains: q, mode: 'insensitive' } },
                { title: { contains: q, mode: 'insensitive' } },
                { originalText: { contains: q, mode: 'insensitive' } },
                { translationTr: { contains: q, mode: 'insensitive' } },
            ];
        }

        const units = await this.prisma.sourceUnit.findMany({
            where: unitWhere,
            take: 30,
            orderBy: { stableKey: 'asc' },
            include: {
                version: {
                    select: {
                        id: true, versionLabel: true, indexStatus: true,
                        source: { select: { id: true, slug: true, title: true, kind: true, officialUrl: true, confidentiality: true } },
                    },
                },
            },
        });

        return units.map((u) => {
            const len = u.originalText.length;
            return {
                unitId: u.id,
                unitCode: u.unitCode,
                stableKey: u.stableKey,
                title: u.title,
                charCount: len,
                // Uzun içerikte sınır AÇIK — sessiz kesme yapılmaz; kullanıcı bilir.
                withinLimit: len <= UNIT_TEXT_LIMIT,
                limit: UNIT_TEXT_LIMIT,
                excerpt: u.originalText.slice(0, 240),
                translationTr: u.translationTr,
                source: {
                    id: u.version.source.id, slug: u.version.source.slug, title: u.version.source.title,
                    kind: u.version.source.kind, officialUrl: u.version.source.officialUrl,
                },
                versionId: u.version.id,
                versionLabel: u.version.versionLabel,
                indexReady: u.version.indexStatus === 'READY',
            };
        });
    }

    /** Bir birim listesinin manuel seçime uygunluğunu (canlı yetki/onay) doğrular. */
    async validateUnitsForRun(unitIds: string[], viewer: ViewerScope) {
        if (unitIds.length === 0) return { valid: [], invalid: [] as { unitId: string; reason: string }[] };
        const allowedConf = this.allowedConf(viewer);
        const units = await this.prisma.sourceUnit.findMany({
            where: { id: { in: unitIds } },
            include: { version: { include: { source: true } } },
        });
        const found = new Map(units.map((u) => [u.id, u]));
        const valid: typeof units = [];
        const invalid: { unitId: string; reason: string }[] = [];
        for (const id of unitIds) {
            const u = found.get(id);
            if (!u) {
                invalid.push({ unitId: id, reason: 'Birim bulunamadı.' });
                continue;
            }
            if (u.version.approvalStatus !== 'APPROVED') {
                invalid.push({ unitId: id, reason: `Sürüm onaylı değil (${u.version.approvalStatus}).` });
                continue;
            }
            if (u.version.source.rightRag !== 'ALLOWED' || !u.version.source.rightsVerifiedAt) {
                invalid.push({ unitId: id, reason: 'RAG kullanım hakkı geri alınmış / doğrulanmamış.' });
                continue;
            }
            if (!allowedConf.includes(u.version.source.confidentiality)) {
                invalid.push({ unitId: id, reason: 'Kaynağın gizlilik seviyesine erişiminiz yok.' });
                continue;
            }
            valid.push(u);
        }
        return { valid, invalid };
    }

    // ─── OTOMATİK ARAMA (öneri + anlamsal) — güncel indeks gerekir ─────────
    async search(dto: RetrievalQueryDto, viewer: ViewerScope) {
        const allowedConf = this.allowedConf(viewer);
        const asOf = dto.asOfDate ? new Date(dto.asOfDate) : null;
        const versionWhere: Prisma.SourceVersionWhereInput = {
            approvalStatus: 'APPROVED',
            indexStatus: 'READY', // STALE indeks sessizce kullanılmaz
            source: {
                confidentiality: { in: allowedConf as never },
                rightRag: 'ALLOWED',
                rightsVerifiedAt: { not: null },
                ...(dto.kinds?.length ? { kind: { in: dto.kinds as never } } : {}),
            },
            ...(asOf
                ? {
                      AND: [
                          { OR: [{ effectiveDate: null }, { effectiveDate: { lte: asOf } }] },
                          { OR: [{ validUntil: null }, { validUntil: { gte: asOf } }] },
                      ],
                  }
                : {}),
        };
        const versions = await this.prisma.sourceVersion.findMany({ where: versionWhere, select: { id: true } });
        const versionIds = versions.map((v) => v.id);
        if (versionIds.length === 0) {
            return {
                query: dto.query,
                results: [],
                reason: 'no_indexed_sources',
                note: 'Yetki + geçerlilik filtresinden geçen ve güncel indeksi olan kaynak yok.',
            };
        }

        let exactUnitIds: string[] = [];
        if (dto.unitCode?.trim()) {
            const units = await this.prisma.sourceUnit.findMany({
                where: {
                    versionId: { in: versionIds },
                    OR: [
                        { unitCode: { equals: dto.unitCode.trim(), mode: 'insensitive' } },
                        { stableKey: { equals: dto.unitCode.trim(), mode: 'insensitive' } },
                    ],
                },
                select: { id: true },
            });
            exactUnitIds = units.map((u) => u.id);
        }

        const chunks = await this.prisma.sourceChunk.findMany({
            where: { versionId: { in: versionIds } },
            include: {
                version: { select: { id: true, versionLabel: true, source: { select: { id: true, slug: true, title: true, kind: true, officialUrl: true } } } },
                unit: { select: { id: true, unitCode: true, stableKey: true, title: true } },
            },
            take: 800,
        });
        if (chunks.length === 0) {
            return { query: dto.query, results: [], reason: 'no_chunks', note: 'İndekslenmiş içerik yok.' };
        }

        const topK = Math.min(20, Math.max(1, dto.topK ?? 8));
        let scored: { chunk: (typeof chunks)[number]; score: number }[];
        if (this.embeddings.enabled) {
            const [qv] = await this.embeddings.embed([dto.query]);
            scored = chunks.map((c) => ({
                chunk: c,
                score: c.embedding.length ? AiEmbeddingService.cosine(qv, c.embedding) : 0,
            }));
        } else {
            const terms = dto.query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
            scored = chunks.map((c) => {
                const lc = c.text.toLowerCase();
                return { chunk: c, score: terms.filter((t) => lc.includes(t)).length / Math.max(1, terms.length) };
            });
        }
        for (const s of scored) {
            if (s.chunk.unit && exactUnitIds.includes(s.chunk.unit.id)) s.score += 1;
        }

        const results = scored
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map(({ chunk, score }) => ({
                score: Number(score.toFixed(4)),
                text: chunk.text,
                source: {
                    id: chunk.version.source.id, slug: chunk.version.source.slug, title: chunk.version.source.title,
                    kind: chunk.version.source.kind, officialUrl: chunk.version.source.officialUrl,
                },
                versionLabel: chunk.version.versionLabel,
                unit: chunk.unit
                    ? { id: chunk.unit.id, code: chunk.unit.unitCode, stableKey: chunk.unit.stableKey, title: chunk.unit.title }
                    : null,
                versionId: chunk.versionId,
            }));

        return {
            query: dto.query,
            filter: { asOfDate: dto.asOfDate ?? null, kinds: dto.kinds ?? null, maxConfidentiality: viewer.maxConfidentiality },
            results,
            note: 'Referanslar gerçek kaynak birimlerine bağlıdır. Kaynakta bulunmayan alıntı doğrulama katmanınca reddedilir.',
        };
    }

    /**
     * Bir değerlendirme çıktısındaki referansların gerçekten var olan, yetkili,
     * çalışmada MODELE İLETİLMİŞ kaynak birimlerine bağlandığını doğrular.
     * Geçerli kaynak ID'si tek başına tespitin o kaynaktan çıktığını KANITLAMAZ —
     * ilişki (relationReviewed) insan incelemesine bırakılır.
     */
    async verifyCitations(
        citations: { unitId?: string; unitCode?: string; versionId?: string; quote?: string; group?: string; index?: number }[],
        viewer: ViewerScope,
        sentUnitIds: string[] = [],
    ) {
        const allowedConf = this.allowedConf(viewer);
        const out: {
            input: (typeof citations)[number];
            textVerified: boolean;
            inSentSet: boolean;
            relationReviewed: boolean;
            reason: string;
        }[] = [];
        for (const c of citations) {
            const unit = await this.prisma.sourceUnit.findFirst({
                where: {
                    ...(c.unitId ? { id: c.unitId } : {}),
                    ...(c.versionId ? { versionId: c.versionId } : {}),
                    ...(c.unitCode ? { OR: [{ unitCode: c.unitCode }, { stableKey: c.unitCode }] } : {}),
                    version: { source: { confidentiality: { in: allowedConf as never } } },
                },
                select: { id: true, originalText: true, unitCode: true, versionId: true },
            });
            if (!unit) {
                out.push({
                    input: c, textVerified: false, inSentSet: false, relationReviewed: false,
                    reason: 'Bu madde/birim yetkili kaynaklarda bulunamadı (uydurma atıf — reddedildi).',
                });
                continue;
            }
            const inSentSet = sentUnitIds.length === 0 || sentUnitIds.includes(unit.id);
            let textVerified = true;
            let reason = inSentSet ? 'Birim mevcut ve bu çalışmada modele iletilmişti.' : 'Birim mevcut ama bu çalışmada modele iletilmemişti — atıf geçersiz.';
            if (c.quote && c.quote.trim().length > 12) {
                const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
                textVerified = norm(unit.originalText).includes(norm(c.quote).slice(0, 120));
                reason = textVerified ? `${reason} Alıntı özgün metinde bulundu.` : `${reason} Alıntı özgün metinle EŞLEŞMİYOR.`;
            }
            out.push({ input: { ...c, unitId: unit.id, versionId: unit.versionId }, textVerified, inSentSet, relationReviewed: false, reason });
        }
        return {
            citations: out,
            allValid: out.every((o) => o.textVerified && o.inSentSet),
            note: 'Geçerli birim + alıntı eşleşmesi, tespitin o kaynaktan çıktığını kanıtlamaz; ilişki insan incelemesine bırakıldı (relationReviewed=false).',
        };
    }

    assertConfidentiality(sourceConf: string, viewer: ViewerScope) {
        if (CONF_ORDER.indexOf(sourceConf as never) > CONF_ORDER.indexOf(viewer.maxConfidentiality)) {
            throw new ForbiddenException('Bu kaynağın gizlilik seviyesine erişiminiz yok.');
        }
    }
}
