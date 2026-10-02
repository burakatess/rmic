import {
    BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { AiProviderService } from './ai-provider.service';
import { AiEmbeddingService } from './ai-embedding.service';
import { TextExtractService } from './text-extract.service';
import { EVAL_VISION } from './prompts';
import { EVAL_ASK, makeNonce } from './prompts/eval-v2';
import { EVAL_V3 } from './prompts/eval-v3';
import { EVAL_PROMPT_VERSION, EVAL_V3_SCHEMA_VERSION, EVAL_V3_PROMPT_VERSION } from './ai.constants';
import type { EvalRunDto, EvalAskDto } from './dto';
import { EvalSourceRetrievalService, formatUnitsForPrompt } from './eval-v3/eval-source-retrieval.service';
import { buildRetrievalQuery } from './eval-v3/eval-retrieval.util';
import { buildEvidenceDigest, EvidenceItem } from './eval-v3/eval-evidence.util';
import { computeEvalInputHash, textChecksum } from './eval-v3/eval-input-hash';
import { summarizePreviousEvaluation } from './eval-v3/eval-previous-summary';
import { processEvalV3Response, EvidenceCtx } from './eval-v3/eval-v3.pipeline';
import { RetrievedUnit, V3Issue } from './eval-v3/eval-v3.types';

type EvalKind = 'DOCUMENT' | 'IMAGE' | 'EMAIL' | 'TEXT';

export interface CreateEvalSessionDto {
    title?: string;
    period?: string | null;
    controlRefId?: string | null;
    controlText?: string | null;
    controlManualNote?: string | null;
    evidenceText?: string | null;
    regulationArticleIds?: string[];
    knowledgeDocIds?: string[];
    /** Kaynak Kataloğu birimleri (SourceUnit.id) — sürümlü, yetkilendirilmiş. */
    sourceUnitIds?: string[];
    contentVersion?: number;
}

export interface ListQuery {
    view?: string; q?: string; runStatus?: string; outcome?: string; controlRefId?: string;
    period?: string; dateFrom?: string; dateTo?: string;
    sort?: string; dir?: string; page?: number; pageSize?: number;
}

const MAX_DIGEST = 40_000;
const MONTHS_TR = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

/** İçerik olarak insan incelemesi gereken değerlendirme grupları. */
const REVIEWABLE_GROUPS = ['uyumsuzAlanlar', 'bulguAdaylari'] as const;

@Injectable()
export class AiEvalService {
    constructor(
        private prisma: PrismaService,
        private provider: AiProviderService,
        private embeddings: AiEmbeddingService,
        private extractor: TextExtractService,
        private retrieval: EvalSourceRetrievalService,
    ) {}

    // ─── Liste (görünüm / arama / filtre / sıralama / sayfalama) ─────────────

    async listSessions(userId: string, query: ListQuery = {}) {
        const view = (['active', 'archived', 'trashed'].includes(query.view ?? '') ? query.view : 'active') as
            'active' | 'archived' | 'trashed';
        const statusByView = { active: 'ACTIVE', archived: 'ARCHIVED', trashed: 'TRASHED' } as const;

        const where: Prisma.AiEvalSessionWhereInput = {
            createdById: userId,
            status: statusByView[view],
        };
        if (query.runStatus) {
            where.runStatus = query.runStatus as Prisma.AiEvalSessionWhereInput['runStatus'];
        }
        if (query.outcome) {
            where.outcome = query.outcome as Prisma.AiEvalSessionWhereInput['outcome'];
        }
        if (query.controlRefId) where.controlRefId = query.controlRefId;
        if (query.period) where.period = query.period;
        if (query.dateFrom || query.dateTo) {
            const range: Prisma.DateTimeFilter = {};
            if (query.dateFrom && !Number.isNaN(Date.parse(query.dateFrom))) range.gte = new Date(query.dateFrom);
            if (query.dateTo && !Number.isNaN(Date.parse(query.dateTo))) range.lte = new Date(`${query.dateTo}T23:59:59.999`);
            where.updatedAt = range;
        }
        const q = query.q?.trim();
        if (q) {
            where.OR = [
                { title: { contains: q, mode: 'insensitive' } },
                { period: { contains: q, mode: 'insensitive' } },
                { controlText: { contains: q, mode: 'insensitive' } },
                { controlSnapshot: { path: ['name'], string_contains: q } },
                { controlSnapshot: { path: ['controlId'], string_contains: q } },
            ];
        }

        const page = Math.max(1, query.page ?? 1);
        const pageSize = Math.min(100, Math.max(5, query.pageSize ?? 20));
        const sort = ['updatedAt', 'title', 'createdAt'].includes(query.sort ?? '') ? (query.sort as string) : 'updatedAt';
        const dir: 'asc' | 'desc' = query.dir === 'asc' ? 'asc' : 'desc';

        const [total, rows] = await Promise.all([
            this.prisma.aiEvalSession.count({ where }),
            this.prisma.aiEvalSession.findMany({
                where,
                orderBy: { [sort]: dir } as Prisma.AiEvalSessionOrderByWithRelationInput,
                skip: (page - 1) * pageSize,
                take: pageSize,
                select: {
                    id: true, title: true, period: true, controlRefId: true, controlSnapshot: true,
                    runStatus: true, outcome: true, inputsDirty: true, status: true, trashedAt: true,
                    createdAt: true, updatedAt: true, evidenceText: true,
                    _count: { select: { attachments: { where: { active: true } } } },
                    needsReview: true,
                    messages: {
                        where: { role: 'ASSISTANT', kind: 'EVALUATION', cancelled: false, stale: false },
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        select: { evaluation: true, editedEvaluation: true, errorText: true, schemaVersion: true },
                    },
                },
            }),
        ]);

        const data = rows.map((s) => {
            const latest = s.messages[0];
            const evalObj = (latest?.editedEvaluation ?? latest?.evaluation) as Record<string, unknown> | undefined;
            const arrLen = (k: string) => (evalObj && Array.isArray(evalObj[k]) ? (evalObj[k] as unknown[]).length : null);
            const counts = this.countsFromEvaluation(evalObj, latest?.schemaVersion ?? null);
            const snap = (s.controlSnapshot ?? null) as { name?: string; controlId?: string } | null;
            return {
                id: s.id,
                title: s.title,
                period: s.period,
                control: s.controlRefId && snap ? { controlId: snap.controlId ?? null, name: snap.name ?? null } : null,
                runStatus: s.runStatus,
                outcome: s.outcome,
                inputsDirty: s.inputsDirty,
                needsReview: s.needsReview,
                lifecycle: s.status,
                trashedAt: s.trashedAt,
                evidenceCount: s._count.attachments,
                hasEvidenceText: !!s.evidenceText?.trim(),
                // Yalnızca güncel (iptal/eski olmayan) değerlendirmeden sayılır.
                findingCount: counts.findings ?? arrLen('uyumsuzAlanlar'),
                missingEvidenceCount: counts.missingEvidence ?? arrLen('eksikBilgi'),
                createdAt: s.createdAt,
                updatedAt: s.updatedAt,
            };
        });

        return { data, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
    }

    // ─── Tekil oturum ──────────────────────────────────────────────────────

    async getSession(id: string, userId: string) {
        const s = await this.prisma.aiEvalSession.findUnique({
            where: { id },
            include: {
                messages: { orderBy: { createdAt: 'asc' } },
                attachments: { orderBy: { createdAt: 'asc' } },
            },
        });
        if (!s) throw new NotFoundException('Değerlendirme oturumu bulunamadı');
        if (s.createdById !== userId) throw new ForbiddenException('Bu oturuma erişiminiz yok');

        const latestEval = [...s.messages]
            .reverse()
            .find(
                (m) =>
                    m.role === 'ASSISTANT' &&
                    (m.kind ?? 'EVALUATION') === 'EVALUATION' &&
                    !m.cancelled && !m.stale && (m.evaluation || m.editedEvaluation),
            );
        return {
            ...s,
            latestEvaluation: latestEval
                ? {
                      messageId: latestEval.id,
                      original: latestEval.evaluation,
                      edited: latestEval.editedEvaluation,
                      effective: latestEval.editedEvaluation ?? latestEval.evaluation,
                      schemaVersion: latestEval.schemaVersion,
                      schemaValid: latestEval.schemaValid,
                      schemaIssues: latestEval.schemaIssues,
                      citedSourceRefs: latestEval.citedSourceRefs,
                      sentSourceUnitIds: latestEval.sentSourceUnitIds,
                      retrievalNote: latestEval.retrievalNote,
                      modelName: latestEval.modelName,
                      promptVersion: latestEval.promptVersion,
                      inputVersion: latestEval.inputVersion,
                      reviewedById: latestEval.reviewedById,
                      reviewedAt: latestEval.reviewedAt,
                      createdAt: latestEval.createdAt,
                  }
                : null,
        };
    }

    private async loadOwned(id: string, userId: string) {
        const s = await this.prisma.aiEvalSession.findUnique({ where: { id } });
        if (!s) throw new NotFoundException('Değerlendirme oturumu bulunamadı');
        if (s.createdById !== userId) throw new ForbiddenException('Bu oturuma erişiminiz yok');
        return s;
    }

    // ─── Oluşturma / güncelleme (autosave + iyimser eşzamanlılık) ───────────

    async createSession(dto: CreateEvalSessionDto, userId: string) {
        const period = dto.period?.trim() || this.currentPeriod();
        const { controlSnapshot, regulationSnapshot, knowledgeSnapshot, sourceSnapshot } = await this.buildSnapshots(
            dto.controlRefId ?? null, dto.controlText ?? null,
            dto.regulationArticleIds ?? [], dto.knowledgeDocIds ?? [], dto.sourceUnitIds ?? [],
        );
        const autoTitle = this.deriveTitle(controlSnapshot, dto.controlText ?? null, period);
        const created = await this.prisma.aiEvalSession.create({
            data: {
                title: dto.title?.trim() || autoTitle,
                titleEditedByUser: !!dto.title?.trim(),
                period,
                controlRefId: dto.controlRefId ?? null,
                controlText: dto.controlText ?? null,
                controlManualNote: dto.controlManualNote ?? null,
                evidenceText: dto.evidenceText ?? null,
                controlSnapshot: (controlSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                regulationArticleIds: dto.regulationArticleIds ?? [],
                regulationSnapshot: (regulationSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                knowledgeDocIds: dto.knowledgeDocIds ?? [],
                knowledgeSnapshot: (knowledgeSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                sourceUnitIds: dto.sourceUnitIds ?? [],
                sourceSnapshot: (sourceSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                createdById: userId,
            },
        });
        // Tutarlı tam şekil (messages/attachments/latestEvaluation) döndür.
        return this.getSession(created.id, userId);
    }

    async updateSession(id: string, dto: CreateEvalSessionDto, userId: string) {
        const before = await this.loadOwned(id, userId);
        if (before.status === 'TRASHED') throw new BadRequestException('Çöp kutusundaki oturum düzenlenemez.');
        // Eski istek yeni içeriği ezmesin (item 5).
        if (dto.contentVersion !== undefined && dto.contentVersion !== before.contentVersion) {
            throw new ConflictException(
                'Bu değerlendirme başka bir yerden güncellendi. Sayfayı yenileyip tekrar deneyin.',
            );
        }

        const period = dto.period !== undefined ? (dto.period?.trim() || this.currentPeriod()) : before.period;
        const { controlSnapshot, regulationSnapshot, knowledgeSnapshot, sourceSnapshot } = await this.buildSnapshots(
            dto.controlRefId ?? null, dto.controlText ?? null,
            dto.regulationArticleIds ?? [], dto.knowledgeDocIds ?? [], dto.sourceUnitIds ?? [],
        );

        const inputsChanged =
            (dto.controlRefId ?? null) !== before.controlRefId ||
            (dto.controlText ?? null) !== before.controlText ||
            (dto.controlManualNote ?? null) !== before.controlManualNote ||
            (dto.evidenceText ?? null) !== before.evidenceText ||
            JSON.stringify([...(dto.regulationArticleIds ?? [])].sort()) !== JSON.stringify([...before.regulationArticleIds].sort()) ||
            JSON.stringify([...(dto.knowledgeDocIds ?? [])].sort()) !== JSON.stringify([...before.knowledgeDocIds].sort()) ||
            JSON.stringify([...(dto.sourceUnitIds ?? [])].sort()) !== JSON.stringify([...before.sourceUnitIds].sort());
        const hasEval = await this.prisma.aiEvalMessage.count({
            where: {
                sessionId: id, role: 'ASSISTANT', kind: 'EVALUATION', cancelled: false, stale: false,
                NOT: { evaluation: { equals: Prisma.DbNull } },
            },
        });

        const nextTitle = dto.title !== undefined
            ? (dto.title?.trim() || before.title)
            : (before.titleEditedByUser
                ? before.title
                : this.deriveTitle(controlSnapshot, dto.controlText ?? null, period ?? undefined));
        // Değişmeyen girdide contentVersion ARTMAZ: her "Değerlendir" tıklaması (veya boş autosave)
        // sürümü artırıp uçuştaki sonucu "stale" yapıyor ve eski sonucu görünür bırakıyordu.
        const somethingChanged = inputsChanged || nextTitle !== before.title || (period ?? null) !== (before.period ?? null);

        await this.prisma.aiEvalSession.update({
            where: { id },
            data: {
                title: nextTitle,
                titleEditedByUser: dto.title !== undefined && !!dto.title?.trim() ? true : before.titleEditedByUser,
                period,
                controlRefId: dto.controlRefId ?? null,
                controlText: dto.controlText ?? null,
                controlManualNote: dto.controlManualNote ?? null,
                evidenceText: dto.evidenceText ?? null,
                controlSnapshot: (controlSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                regulationArticleIds: dto.regulationArticleIds ?? [],
                regulationSnapshot: (regulationSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                knowledgeDocIds: dto.knowledgeDocIds ?? [],
                knowledgeSnapshot: (knowledgeSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                sourceUnitIds: dto.sourceUnitIds ?? [],
                sourceSnapshot: (sourceSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                ...(somethingChanged ? { contentVersion: { increment: 1 } } : {}),
                inputsDirty: inputsChanged && hasEval > 0 ? true : before.inputsDirty,
            },
        });
        return this.getSession(id, userId);
    }

    async renameSession(id: string, title: string, userId: string) {
        await this.loadOwned(id, userId);
        await this.prisma.aiEvalSession.update({
            where: { id },
            data: { title: title.trim(), titleEditedByUser: true },
        });
        return this.getSession(id, userId);
    }

    // ─── Yaşam döngüsü (arşiv / çöp / geri al) ──────────────────────────────

    private assertNotRunning(s: { runStatus: string }) {
        if (s.runStatus === 'RUNNING') {
            throw new BadRequestException('Değerlendirme sürüyor — önce iptal edin veya tamamlanmasını bekleyin.');
        }
    }

    async archiveSession(id: string, userId: string) {
        const s = await this.loadOwned(id, userId);
        this.assertNotRunning(s);
        await this.prisma.aiEvalSession.update({ where: { id }, data: { status: 'ARCHIVED' } });
        await this.audit(userId, 'AI_EVAL_ARCHIVE', id);
        return { ok: true };
    }

    async unarchiveSession(id: string, userId: string) {
        await this.loadOwned(id, userId);
        await this.prisma.aiEvalSession.update({ where: { id }, data: { status: 'ACTIVE' } });
        await this.audit(userId, 'AI_EVAL_UNARCHIVE', id);
        return { ok: true };
    }

    async trashSession(id: string, userId: string) {
        const s = await this.loadOwned(id, userId);
        this.assertNotRunning(s);
        await this.prisma.aiEvalSession.update({ where: { id }, data: { status: 'TRASHED', trashedAt: new Date() } });
        await this.audit(userId, 'AI_EVAL_TRASH', id);
        return { ok: true };
    }

    async restoreSession(id: string, userId: string) {
        await this.loadOwned(id, userId);
        await this.prisma.aiEvalSession.update({ where: { id }, data: { status: 'ACTIVE', trashedAt: null } });
        await this.audit(userId, 'AI_EVAL_RESTORE', id);
        return { ok: true };
    }

    async bulkArchive(ids: string[], userId: string) {
        return this.bulkOp(ids, (id) => this.archiveSession(id, userId));
    }
    async bulkTrash(ids: string[], userId: string) {
        return this.bulkOp(ids, (id) => this.trashSession(id, userId));
    }
    private async bulkOp(ids: string[], fn: (id: string) => Promise<unknown>) {
        const ok: string[] = [];
        const failed: { id: string; reason: string }[] = [];
        for (const id of [...new Set(ids)].slice(0, 200)) {
            try {
                await fn(id);
                ok.push(id);
            } catch (e) {
                failed.push({ id, reason: (e as Error).message });
            }
        }
        return { requested: ids.length, ok: ok.length, failed };
    }

    // ─── İşlem durumu: sonuçlandırma / yeniden açma ─────────────────────────

    async completeSession(id: string, outcome: string, userId: string) {
        const s = await this.getSession(id, userId);
        if (s.runStatus !== 'AWAITING_REVIEW') {
            throw new BadRequestException('Yalnızca "İnceleme bekliyor" durumundaki değerlendirme tamamlanabilir.');
        }
        const effective = (s.latestEvaluation?.effective ?? null) as Record<string, unknown> | null;
        if (!effective) throw new BadRequestException('Sonuçlandırılacak bir değerlendirme yok.');

        const unreviewed = this.countUnreviewed(effective);
        if (unreviewed > 0) {
            throw new BadRequestException(
                `${unreviewed} tespit henüz incelenmedi. Her tespiti kabul edin, düzenleyin ya da gerekçeyle reddedin.`,
            );
        }

        await this.prisma.aiEvalSession.update({
            where: { id },
            data: {
                runStatus: 'COMPLETED',
                outcome: outcome as Prisma.AiEvalSessionUpdateInput['outcome'],
                completedAt: new Date(),
                completedById: userId,
            },
        });
        await this.audit(userId, 'AI_EVAL_COMPLETE', id, { outcome });
        return this.getSession(id, userId);
    }

    async reopenSession(id: string, userId: string) {
        const s = await this.loadOwned(id, userId);
        if (s.runStatus !== 'COMPLETED') {
            throw new BadRequestException('Yalnızca tamamlanmış değerlendirme yeniden açılabilir.');
        }
        await this.prisma.aiEvalSession.update({
            where: { id },
            data: { runStatus: 'AWAITING_REVIEW', outcome: null, completedAt: null, completedById: null },
        });
        await this.audit(userId, 'AI_EVAL_REOPEN', id);
        return this.getSession(id, userId);
    }

    // ─── Çoğaltma (yeni dönem) ─────────────────────────────────────────────

    async cloneForNewPeriod(id: string, period: string, userId: string) {
        const src = await this.loadOwned(id, userId);
        const newPeriod = period.trim();
        const { controlSnapshot, regulationSnapshot, knowledgeSnapshot, sourceSnapshot } = await this.buildSnapshots(
            src.controlRefId, src.controlText, src.regulationArticleIds, src.knowledgeDocIds, src.sourceUnitIds,
        );
        const created = await this.prisma.aiEvalSession.create({
            data: {
                title: this.deriveTitle(controlSnapshot, src.controlText, newPeriod),
                period: newPeriod,
                // Taşınan: kontrol, kapsam şablonu (not), kaynak seçimleri.
                controlRefId: src.controlRefId,
                controlText: src.controlText,
                controlManualNote: src.controlManualNote,
                controlSnapshot: (controlSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                regulationArticleIds: src.regulationArticleIds,
                regulationSnapshot: (regulationSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                knowledgeDocIds: src.knowledgeDocIds,
                knowledgeSnapshot: (knowledgeSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                sourceUnitIds: src.sourceUnitIds,
                sourceSnapshot: (sourceSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                // Taşınmayan: kanıt, yazılı beyan, sohbet, sonuç, inceleme kararları.
                evidenceText: null,
                clonedFromId: src.id,
                createdById: userId,
            },
        });
        await this.audit(userId, 'AI_EVAL_CLONE', created.id, { from: src.id, period: newPeriod });
        return created;
    }

    // ─── Ekler + meta + sürüm zinciri ──────────────────────────────────────

    async addAttachment(
        sessionId: string,
        meta: { fileName: string; originalName: string; mimeType: string; sizeBytes: number },
        userId: string,
    ) {
        const s = await this.loadOwned(sessionId, userId);
        if (s.status === 'TRASHED') throw new BadRequestException('Çöp kutusundaki oturuma kanıt eklenemez.');
        const kind = this.kindFor(meta.mimeType, meta.originalName);
        const att = await this.prisma.aiEvalAttachment.create({
            data: { sessionId, ...meta, kind, uploadedById: userId },
        });
        await this.markInputsDirtyIfEvaluated(sessionId);
        return att;
    }

    async updateAttachmentMeta(
        sessionId: string, attId: string,
        meta: {
            docDate?: string | null; relatedSystem?: string | null; relatedSample?: string | null;
            relatedTestStep?: string | null; note?: string | null;
        },
        userId: string,
    ) {
        await this.loadOwned(sessionId, userId);
        const att = await this.prisma.aiEvalAttachment.findFirst({ where: { id: attId, sessionId } });
        if (!att) throw new NotFoundException('Ek bulunamadı');
        return this.prisma.aiEvalAttachment.update({
            where: { id: attId },
            data: {
                docDate: meta.docDate ?? undefined,
                relatedSystem: meta.relatedSystem ?? undefined,
                relatedSample: meta.relatedSample ?? undefined,
                relatedTestStep: meta.relatedTestStep ?? undefined,
                note: meta.note ?? undefined,
            },
        });
    }

    /** Yeni sürüm yükle — eskisini YERİNDE değiştirmez; pasifleştirir, meta taşınır. */
    async replaceAttachment(
        sessionId: string, attId: string,
        meta: { fileName: string; originalName: string; mimeType: string; sizeBytes: number },
        userId: string,
    ) {
        await this.loadOwned(sessionId, userId);
        const old = await this.prisma.aiEvalAttachment.findFirst({ where: { id: attId, sessionId } });
        if (!old) throw new NotFoundException('Ek bulunamadı');
        if (!old.active) throw new BadRequestException('Yalnızca aktif sürümün yerine yeni sürüm yüklenebilir.');

        const next = await this.prisma.$transaction(async (tx) => {
            const created = await tx.aiEvalAttachment.create({
                data: {
                    sessionId, ...meta,
                    kind: this.kindFor(meta.mimeType, meta.originalName),
                    uploadedById: userId,
                    version: old.version + 1,
                    active: true,
                    docDate: old.docDate, relatedSystem: old.relatedSystem,
                    relatedSample: old.relatedSample, relatedTestStep: old.relatedTestStep, note: old.note,
                },
            });
            await tx.aiEvalAttachment.update({
                where: { id: old.id },
                data: { active: false, supersededById: created.id },
            });
            return created;
        });
        await this.markInputsDirtyIfEvaluated(sessionId);
        return next;
    }

    async removeAttachment(sessionId: string, attId: string, userId: string) {
        await this.loadOwned(sessionId, userId);
        const att = await this.prisma.aiEvalAttachment.findFirst({ where: { id: attId, sessionId } });
        if (!att) throw new NotFoundException('Ek bulunamadı');
        // Sürüm zinciri bağını çöz, sonra sil.
        await this.prisma.aiEvalAttachment.updateMany({ where: { supersededById: attId }, data: { supersededById: null } });
        await this.prisma.aiEvalAttachment.delete({ where: { id: attId } });
        if (att.active) await this.markInputsDirtyIfEvaluated(sessionId);
        return { ok: true };
    }

    // ─── Tespit bazında insan incelemesi (item 9) ──────────────────────────

    async reviewFinding(
        sessionId: string,
        body: { group: string; index: number; status: string; reason?: string; edited?: unknown },
        userId: string,
    ) {
        const s = await this.getSession(sessionId, userId);
        const latest = s.latestEvaluation;
        if (!latest) throw new BadRequestException('İncelenecek değerlendirme yok.');
        if (s.runStatus === 'COMPLETED') {
            throw new BadRequestException('Tamamlanmış değerlendirmede inceleme değiştirilemez — önce yeniden açın.');
        }

        const base = JSON.parse(JSON.stringify(latest.edited ?? latest.original)) as Record<string, unknown>;
        let item: Record<string, unknown>;
        if (body.group === 'finding') {
            // v3: tek bir bulgu nesnesi (exists=true iken incelenir).
            const f = base.finding as Record<string, unknown> | undefined;
            if (!f || typeof f !== 'object' || f.exists !== true || body.index !== 0) {
                throw new BadRequestException('Geçersiz tespit referansı.');
            }
            item = f;
        } else {
            const arr = base[body.group];
            if (!Array.isArray(arr) || !arr[body.index]) throw new BadRequestException('Geçersiz tespit referansı.');
            item = arr[body.index] as Record<string, unknown>;
        }
        // AI'nin özgün çıktısı EZİLMEZ — düzenleme editedEvaluation'da yaşar.
        if (body.status === 'EDITED' && body.edited && typeof body.edited === 'object') {
            Object.assign(item, body.edited as Record<string, unknown>);
        }
        item._review = {
            status: body.status,
            reviewerId: userId,
            reviewedAt: new Date().toISOString(),
            reason: body.reason ?? null,
        };

        await this.prisma.aiEvalMessage.update({
            where: { id: latest.messageId },
            data: {
                editedEvaluation: base as Prisma.InputJsonValue,
                reviewedById: userId,
                reviewedAt: new Date(),
            },
        });
        await this.audit(userId, 'AI_EVAL_REVIEW', sessionId, {
            group: body.group, index: body.index, status: body.status,
        });
        return this.getSession(sessionId, userId);
    }

    // ─── AI çalışması: çalıştır / iptal ────────────────────────────────────

    async cancelRun(id: string, userId: string) {
        const s = await this.loadOwned(id, userId);
        if (s.runStatus !== 'RUNNING') throw new BadRequestException('Devam eden bir değerlendirme yok.');
        await this.prisma.aiEvalSession.update({ where: { id }, data: { cancelRequested: true } });
        return { ok: true };
    }

    // ─── Kaynak önerisi (kullanıcı seçer; gizli enjeksiyon yok) ────────────
    /**
     * Kontrol için kaynak birimi önerir:
     *   1) Önce ONAYLI kontrol–kaynak eşleşmeleri (SourceMapping USER_CONFIRMED)
     *   2) Sonra kontrol adı/test adımları/kapsam ile örtüşen, onaylı + RAG hakkı
     *      izinli + erişilebilir birimler
     * Sonuç suggestedSourceUnitIds'e yazılır; seçim kullanıcıya bırakılır.
     * Uygun içerik yoksa NEDEN açıklanır + yetkiliye katalog yönlendirmesi verilir.
     */
    async suggestSources(sessionId: string, userId: string) {
        const session = await this.getSession(sessionId, userId);
        const role = await this.userRole(userId);
        const allowedConf = this.confLevelsFor(role);
        const canManageCatalog = ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER'].includes(role);

        // Kontrol bağlamı
        let controlName = '';
        let testSteps = '';
        const snap = session.controlSnapshot as Record<string, unknown> | null;
        if (snap) {
            controlName = typeof snap.name === 'string' ? snap.name : '';
            testSteps = typeof snap.testSteps === 'string' ? snap.testSteps : '';
        } else if (session.controlText?.trim()) {
            controlName = session.controlText.trim().split('\n')[0].slice(0, 120);
        }
        const terms = `${controlName} ${testSteps} ${session.controlManualNote ?? ''}`
            .toLowerCase()
            .split(/[^a-zçğıöşü0-9]+/i)
            .filter((t) => t.length >= 4)
            .slice(0, 12);

        const period = session.period ? new Date(`${session.period} 1`) : null;
        const validAsOf = (v: { effectiveDate: Date | null; validUntil: Date | null }) =>
            !period ||
            ((!v.effectiveDate || v.effectiveDate <= period) && (!v.validUntil || v.validUntil >= period));

        const suggestions: {
            unitId: string; unitCode: string; sourceTitle: string; versionLabel: string;
            versionId: string; rationale: string; matchType?: string;
        }[] = [];
        const seen = new Set<string>();

        // 1) Onaylı eşleşmeler
        if (session.controlRefId) {
            const maps = await this.prisma.sourceMapping.findMany({
                where: {
                    controlId: session.controlRefId,
                    status: 'USER_CONFIRMED',
                    unitId: { not: null },
                    version: {
                        approvalStatus: 'APPROVED',
                        source: { confidentiality: { in: allowedConf as never }, rightRag: 'ALLOWED', rightsVerifiedAt: { not: null } },
                    },
                },
                include: {
                    unit: { select: { id: true, unitCode: true } },
                    version: { select: { id: true, versionLabel: true, effectiveDate: true, validUntil: true, source: { select: { title: true } } } },
                },
            });
            for (const m of maps) {
                if (!m.unit || seen.has(m.unit.id) || !validAsOf(m.version)) continue;
                seen.add(m.unit.id);
                suggestions.push({
                    unitId: m.unit.id, unitCode: m.unit.unitCode, sourceTitle: m.version.source.title,
                    versionLabel: m.version.versionLabel, versionId: m.version.id, matchType: m.matchType,
                    rationale: `Onaylı kontrol–kaynak eşleşmesi (${m.matchType}).`,
                });
            }
        }

        // 2) Anahtar kelime örtüşmesi
        if (terms.length) {
            const units = await this.prisma.sourceUnit.findMany({
                where: {
                    version: {
                        approvalStatus: 'APPROVED',
                        source: { confidentiality: { in: allowedConf as never }, rightRag: 'ALLOWED', rightsVerifiedAt: { not: null } },
                    },
                    OR: terms.flatMap((t) => [
                        { title: { contains: t, mode: 'insensitive' as const } },
                        { originalText: { contains: t, mode: 'insensitive' as const } },
                        { translationTr: { contains: t, mode: 'insensitive' as const } },
                    ]),
                },
                take: 25,
                include: {
                    version: { select: { id: true, versionLabel: true, effectiveDate: true, validUntil: true, source: { select: { title: true } } } },
                },
            });
            for (const u of units) {
                if (seen.has(u.id) || !validAsOf(u.version)) continue;
                seen.add(u.id);
                const hit = terms.find(
                    (t) =>
                        u.title.toLowerCase().includes(t) ||
                        u.originalText.toLowerCase().includes(t) ||
                        (u.translationTr ?? '').toLowerCase().includes(t),
                );
                suggestions.push({
                    unitId: u.id, unitCode: u.unitCode, sourceTitle: u.version.source.title,
                    versionLabel: u.version.versionLabel, versionId: u.version.id,
                    rationale: `Kontrol metniyle örtüşen terim: "${hit}".`,
                });
            }
        }

        const capped = suggestions.slice(0, 15);
        await this.prisma.aiEvalSession.update({
            where: { id: sessionId },
            data: { suggestedSourceUnitIds: capped.map((s) => s.unitId) },
        });

        if (capped.length === 0) {
            // Neden yok? — yetkisiz kaynak varlığını AÇIĞA ÇIKARMADAN.
            const anyApprovedAllowed = await this.prisma.sourceVersion.count({
                where: {
                    approvalStatus: 'APPROVED',
                    source: { confidentiality: { in: allowedConf as never }, rightRag: 'ALLOWED', rightsVerifiedAt: { not: null } },
                },
            });
            return {
                suggestions: [],
                reason:
                    anyApprovedAllowed === 0
                        ? 'Kaynak Kataloğu\'nda değerlendirmede kullanılabilir (onaylı + RAG hakkı doğrulanmış) içerik henüz yok.'
                        : 'Bu kontrolün metniyle örtüşen, kullanıma uygun kaynak birimi bulunamadı. Kaynak Kataloğu\'ndan elle seçebilir ya da eşleştirme kurabilirsiniz.',
                catalogLink: canManageCatalog ? '/ai/kaynak-katalogu' : null,
            };
        }
        return { suggestions: capped, reason: null, catalogLink: canManageCatalog ? '/ai/kaynak-katalogu' : null };
    }

    private async userRole(userId: string): Promise<string> {
        const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: { select: { name: true } } } });
        return u?.role.name ?? '';
    }

    private confLevelsFor(role: string): string[] {
        if (role === 'SYSTEM_ADMIN' || role === 'RISK_CONTROL_MANAGER') return ['PUBLIC', 'INTERNAL', 'RESTRICTED', 'CONFIDENTIAL'];
        if (role === 'AUDITOR' || role === 'IKS_MANAGER') return ['PUBLIC', 'INTERNAL', 'RESTRICTED'];
        return ['PUBLIC', 'INTERNAL'];
    }

    /**
     * "Değerlendir / Yeniden Değerlendir" — EKRANDAKİ güncel girdiyle yedi bölümlü,
     * doğrulanmış (v3) değerlendirme üretir.
     *
     * Sıra:
     *   1) Ekran girdisini KAYDET (contentVersion çakışırsa 409); başarısızsa koşu yok.
     *   2) Kanıtları oku (dosya başına kimlik E1..; okunamayanlar yeniden denenir).
     *   3) OTOMATİK kaynak taraması: kontrol + kanıt + açıklamadan sorgu → onaylı sistem
     *      kaynaklarında hybrid arama → eşik → top-K (+ kullanıcının elle seçtikleri).
     *   4) Girdi özeti (inputHash) → prompt (yeniden değerlendirmede kullanıcının son girdisi
     *      <yeniden_degerlendirme_talimati> bloğunda) → model.
     *   5) Şema + atıf doğrulaması; başarısızsa TEK onarım denemesi; yine başarısızsa
     *      SONUÇ KAYDEDİLMEZ (önceki değerlendirme yeni sonuç sanılmaz).
     *   6) Geç gelen / iptal edilen / stale sonuç güncel sonucu EZMEZ.
     */
    async runEvaluation(
        sessionId: string,
        screen: EvalRunDto | null,
        additionalNoteRaw: string,
        userId: string,
    ) {
        // 1) Ekran girdisini önce kaydet — hata olursa buradan fırlar, koşu yok.
        if (screen) {
            const { additionalNote: _drop, followUpQuestion: _dropQ, ...sessionPatch } = screen;
            void _drop; void _dropQ;
            await this.updateSession(sessionId, sessionPatch, userId);
        }
        const session = await this.getSession(sessionId, userId);
        const additionalNote =
            ((screen?.additionalNote ?? additionalNoteRaw) ?? '').toString().trim() || null;

        if (session.status === 'TRASHED') throw new BadRequestException('Çöp kutusundaki oturum değerlendirilemez.');
        if (session.runStatus === 'RUNNING') throw new ConflictException('Bu değerlendirme zaten çalışıyor.');
        if (!session.controlText?.trim() && !session.controlSnapshot && !session.controlManualNote?.trim()) {
            throw new BadRequestException('Önce Kontrol Alanı doldurulmalı (envanterden seçin veya elle yazın).');
        }

        const activeAttachments = await this.prisma.aiEvalAttachment.findMany({ where: { sessionId, active: true } });
        const priorEvalRuns = await this.prisma.aiEvalMessage.count({
            where: { sessionId, role: 'ASSISTANT', kind: 'EVALUATION', cancelled: false, stale: false,
                NOT: { evaluation: { equals: Prisma.DbNull } } },
        });
        const hasEvidence =
            activeAttachments.length > 0 || !!session.evidenceText?.trim() || !!additionalNote || priorEvalRuns > 0;
        if (!hasEvidence) {
            throw new BadRequestException(
                'Değerlendirme için en az bir kanıt gerekli: dosya ekleyin, Yanıt/Kanıt metni yazın ya da açıklama girin.',
            );
        }
        const isReEvaluation = priorEvalRuns > 0;

        // Kullanıcının elle seçtiği kaynaklar — canlı onay/hak doğrulaması (geri alınmışsa burada durur).
        const userSelected = await this.retrieval.loadUserSelected(session.sourceUnitIds ?? []);

        const inputVersion = session.contentVersion;
        const filesTotal = activeAttachments.filter((a) => !a.extractedText).length;
        await this.prisma.aiEvalSession.update({
            where: { id: sessionId },
            data: {
                runStatus: 'RUNNING', runStartedAt: new Date(), cancelRequested: false,
                runProgress: { phase: 'preparing', filesRead: 0, filesTotal } as Prisma.InputJsonValue,
            },
        });
        await this.prisma.aiEvalMessage.create({
            data: {
                sessionId, role: 'USER', kind: 'EVALUATION',
                content: additionalNote || '(ek açıklama girilmedi — ekrandaki kontrol ve kanıt değerlendirildi)',
                additionalNote,
            },
        });

        const cfg = this.provider.config;
        const nonce = makeNonce();
        let modelName = '';
        try {
            const read = await this.readEvidence(sessionId, activeAttachments, filesTotal);
            await this.prisma.aiEvalSession.update({
                where: { id: sessionId },
                data: { runProgress: { phase: 'retrieving', filesRead: read.filesRead, filesTotal } as Prisma.InputJsonValue },
            });

            const digest = buildEvidenceDigest(read.items, MAX_DIGEST);
            const controlInfo = this.controlAsText(session);
            const followUpQuestion = this.collectPendingQuestions(session.messages, screen?.followUpQuestion ?? null);
            const riskNames = this.controlRiskNames(session.controlSnapshot);
            const controlName = (session.controlSnapshot as { name?: string } | null)?.name ?? null;

            // 3) OTOMATİK kaynak taraması
            const query = buildRetrievalQuery({
                controlName, controlText: controlInfo, riskNames,
                evidenceText: digest.text, userNote: additionalNote, followUp: followUpQuestion,
            });
            const retrieved = await this.retrieval.retrieve(query);
            const legacy = await this.retrieval.resolveLegacyRegulationSelections(session.regulationSnapshot);
            const merged = new Map<string, RetrievedUnit>();
            for (const u of userSelected) merged.set(u.unitId, u);
            for (const u of legacy.units) if (!merged.has(u.unitId)) merged.set(u.unitId, u);
            for (const u of retrieved.units) if (!merged.has(u.unitId)) merged.set(u.unitId, u);
            const units = [...merged.values()].map((u, i) => ({ ...u, alias: `U${i + 1}` }));
            const note = { ...retrieved.note, selectedByUser: [...userSelected, ...legacy.units].map((u) => u.unitId), sentUnitIds: units.map((u) => u.unitId) };

            const methodology = await this.retrieval.loadMethodology();
            const sourcesText = formatUnitsForPrompt(units);

            const prevEval = this.pickPreviousEvaluation(session.messages);
            const previousSummary = isReEvaluation ? summarizePreviousEvaluation(prevEval) : null;
            const priorUserHistory = isReEvaluation ? this.collectPriorUserHistory(session.messages) : null;

            const precedents = await this.loadPrecedentFindings(
                session.controlRefId, `${controlInfo}\n${digest.text}`.slice(0, 4000),
            );
            const precedentText = precedents.length ? JSON.stringify(precedents, null, 2) : '';
            const legacyContext = legacy.contextOnly.length
                ? 'Kullanıcının seçtiği, kaynak kütüphanesinde karşılığı BULUNAMAYAN mevzuat maddeleri (yalnız bağlam; sourceUnitId yoktur, atıf yapılamaz):\n' +
                  legacy.contextOnly.map((c) => `• ${c.madde} — ${c.baslik}\n${c.metin}`).join('\n\n')
                : '';
            const knowledgeText = [this.knowledgeAsText(session), legacyContext].filter((t) => t?.trim()).join('\n\n');

            const modelVersion = process.env.AI_EVAL_MODEL_VERSION?.trim() || cfg.evalModel || cfg.models.heavy;
            const inputHash = computeEvalInputHash({
                controlVersion: (session.controlSnapshot as { version?: number } | null)?.version ?? null,
                controlTextHash: textChecksum(controlInfo),
                evidence: read.items.filter((i) => i.attachmentId).map((i) => ({ id: i.attachmentId as string, checksum: textChecksum(i.text) })),
                evidenceTextHash: session.evidenceText?.trim() ? textChecksum(session.evidenceText.trim()) : null,
                additionalNote, followUpQuestion,
                sourceUnits: units.map((u) => ({ unitId: u.unitId, versionId: u.versionId, textHash: u.textHash })),
                regulationArticleIds: session.regulationArticleIds ?? [],
                knowledgeDocIds: session.knowledgeDocIds ?? [],
                promptVersion: EVAL_V3_PROMPT_VERSION, modelVersion, methodologyHash: methodology.hash,
            });
            const lastHash = [...session.messages].reverse().find(
                (m) => m.role === 'ASSISTANT' && (m.kind ?? 'EVALUATION') === 'EVALUATION' && !m.cancelled && !m.stale && m.inputHash,
            )?.inputHash;
            const unchangedInput = !!lastHash && lastHash === inputHash;

            await this.prisma.aiEvalSession.update({
                where: { id: sessionId },
                data: { runProgress: { phase: 'evaluating', filesRead: read.filesRead, filesTotal } as Prisma.InputJsonValue },
            });

            const system = EVAL_V3.system(methodology.text);
            const evidenceLimitNote = digest.truncated
                ? '(NOT: bazı kanıtlar uzunluk sınırı nedeniyle kısaltıldı; ilgili kanıtın limitations alanında belirt.)'
                : null;
            const userPrompt = EVAL_V3.user({
                nonce, period: session.period, controlInfo, userNote: additionalNote, followUpQuestion,
                sourcesText, knowledgeText, precedentText, evidenceDigest: digest.text, evidenceLimitNote,
                previousSummary, priorUserHistory, isReEvaluation,
            });
            const evidenceCtx: EvidenceCtx[] = read.items.map((i) => ({
                evidenceId: i.evidenceId, name: i.name, kind: i.kind, readStatus: i.readStatus,
                note: i.note ?? null, attachmentId: i.attachmentId ?? null,
            }));

            const callModel = (extra = '') => this.provider.chat({
                tier: 'heavy', modelOverride: cfg.evalModel, reasoning: true, json: true,
                maxTokens: Math.max(cfg.maxTokens, 12000), system, user: userPrompt + extra,
            });

            let resp = await callModel();
            modelName = resp.model;
            let result = processEvalV3Response(resp.parsed, { units, evidence: evidenceCtx });
            let repaired = false;

            // 5) Şema/atıf doğrulaması başarısızsa TEK kontrollü onarım denemesi.
            if (!result.valid) {
                const errs = result.issues.filter((i) => i.severity === 'ERROR').map((i) => `- ${i.path}: ${i.message}`).join('\n');
                const raw = resp.parsed ? '' : `\n\nÖNCEKİ YANITIN (JSON olarak ayrıştırılamadı):\n${(resp.text || '').slice(0, 4000)}`;
                resp = await callModel(
                    `\n\nÖNCEKİ DENEMEN ŞU HATALARI İÇERİYORDU — YALNIZCA BUNLARI DÜZELTEREK TAM JSON'U TEKRAR ÜRET ` +
                        `(kaynak atfı yoksa bulgu üretme, kanıt yetersizse INSUFFICIENT_EVIDENCE kullan):\n${errs}${raw}`,
                );
                modelName = resp.model;
                result = processEvalV3Response(resp.parsed, { units, evidence: evidenceCtx });
                repaired = true;
            }

            const now = await this.prisma.aiEvalSession.findUnique({
                where: { id: sessionId },
                select: { cancelRequested: true, contentVersion: true },
            });
            const cancelled = !!now?.cancelRequested;
            const stale = (now?.contentVersion ?? inputVersion) !== inputVersion;

            if (!result.valid && !cancelled && !stale) {
                // Sonuç KAYDEDİLMEZ; önceki değerlendirme yeni sonuç gibi görünmez.
                const summaryErr = result.issues.filter((i) => i.severity === 'ERROR').map((i) => i.message).slice(0, 3).join(' ');
                await this.prisma.aiEvalMessage.create({
                    data: {
                        sessionId, role: 'ASSISTANT', kind: 'EVALUATION',
                        content: 'Değerlendirme çıktısı doğrulamadan geçemedi; sonuç kaydedilmedi. Kanıt/açıklama ekleyip yeniden deneyebilirsiniz.',
                        schemaVersion: EVAL_V3_SCHEMA_VERSION, schemaValid: false,
                        schemaIssues: result.issues as unknown as Prisma.InputJsonValue,
                        modelName: resp.model, modelVersion, promptVersion: EVAL_V3_PROMPT_VERSION, inputVersion, inputHash,
                        additionalNote, retrievalNote: { ...note, unchangedInput } as unknown as Prisma.InputJsonValue,
                        errorText: `Şema/atıf doğrulaması başarısız (onarım denendi: ${repaired}): ${summaryErr}`,
                        tokensIn: resp.tokensIn ?? null, tokensOut: resp.tokensOut ?? null, latencyMs: resp.latencyMs,
                    },
                });
                await this.prisma.aiEvalSession.update({
                    where: { id: sessionId },
                    data: {
                        runStatus: priorEvalRuns > 0 ? 'AWAITING_REVIEW' : 'DRAFT', runProgress: Prisma.DbNull,
                        runStartedAt: null, cancelRequested: false,
                    },
                });
                throw new BadRequestException(
                    'Değerlendirme sonucu doğrulanamadı ve kaydedilmedi. Lütfen kanıtları/açıklamayı gözden geçirip yeniden deneyin.',
                );
            }

            const output = result.output;
            const needsReview = !cancelled && !stale && (result.reviewReasons.length > 0 || repaired);
            const reviewReasons = [...result.reviewReasons];
            if (repaired) reviewReasons.push('Çıktı ilk denemede doğrulanamadı, kontrollü düzeltme ile alındı.');
            if (note.semanticUnavailableReason) reviewReasons.push(`Otomatik kaynak taramasında anlamsal arama kullanılamadı (${note.semanticUnavailableReason}).`);

            const summary = output?.controlResult.text || 'Değerlendirme tamamlandı.';
            const runInputSnapshot = {
                schemaVersion: EVAL_V3_SCHEMA_VERSION, promptVersion: EVAL_V3_PROMPT_VERSION,
                model: cfg.evalModel || cfg.models.heavy, modelVersion, inputHash, unchangedInput,
                contentVersion: session.contentVersion, period: session.period ?? null,
                controlTextHash: textChecksum(controlInfo), additionalNote, followUpQuestion,
                isReEvaluation, hadPreviousSummary: !!previousSummary,
                methodology: { version: methodology.version, hash: methodology.hash, origin: methodology.origin },
                evidence: digest.items.map((i) => ({
                    evidenceId: i.evidenceId, name: i.name, kind: i.kind, readStatus: i.readStatus,
                    attachmentId: i.attachmentId ?? null, chars: i.chars, sentChars: i.sentChars, truncated: i.truncated,
                    checksum: textChecksum(i.text),
                })),
                evidenceDigestTruncated: digest.truncated,
                regulationArticleIds: session.regulationArticleIds, knowledgeDocIds: session.knowledgeDocIds,
                sourceUnits: units.map((u) => ({
                    unitId: u.unitId, versionId: u.versionId, sourceSlug: u.sourceSlug, versionLabel: u.versionLabel,
                    unitCode: u.unitCode, textHash: u.textHash, truncated: u.truncated, origin: u.origin,
                    score: u.score, rank: u.rank,
                })),
            };
            const evidenceRefs = {
                attachmentIds: activeAttachments.map((a) => a.id),
                evidenceTextHash: session.evidenceText?.trim() ? textChecksum(session.evidenceText.trim()) : null,
                knowledgeDocIds: session.knowledgeDocIds, regulationArticleIds: session.regulationArticleIds,
                sourceUnitIds: units.map((u) => u.unitId),
                sourceVersions: units.map((u) => `${u.sourceSlug}@${u.versionLabel}`),
            };

            await this.prisma.aiEvalMessage.create({
                data: {
                    sessionId, role: 'ASSISTANT', kind: 'EVALUATION',
                    content: cancelled
                        ? 'Değerlendirme iptal edildi — sonuç geldi ama uygulanmadı.'
                        : stale
                            ? 'Girdiler bu koşu sürerken değişti — bu sonuç s' + inputVersion +
                              ' sürümüne ait. Güncel girdiler için yeniden değerlendirin.'
                            : summary,
                    evaluation: (output ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
                    schemaVersion: EVAL_V3_SCHEMA_VERSION,
                    schemaValid: cancelled || stale ? null : true,
                    schemaIssues: result.issues as unknown as Prisma.InputJsonValue,
                    modelName: resp.model, modelVersion, promptVersion: EVAL_V3_PROMPT_VERSION, inputVersion, inputHash,
                    additionalNote,
                    evidenceRefs: evidenceRefs as Prisma.InputJsonValue,
                    runInputSnapshot: runInputSnapshot as unknown as Prisma.InputJsonValue,
                    retrievalNote: { ...note, unchangedInput } as unknown as Prisma.InputJsonValue,
                    sentSourceUnitIds: units.map((u) => u.unitId),
                    citedSourceRefs: ((output?.references ?? []) as unknown) as Prisma.InputJsonValue,
                    tokensIn: resp.tokensIn ?? null, tokensOut: resp.tokensOut ?? null, latencyMs: resp.latencyMs,
                    cancelled, stale,
                },
            });

            await this.prisma.aiEvalSession.update({
                where: { id: sessionId },
                data: {
                    runStatus: cancelled || stale
                        ? (priorEvalRuns > 0 ? 'AWAITING_REVIEW' : 'DRAFT')
                        : 'AWAITING_REVIEW',
                    runProgress: Prisma.DbNull,
                    runStartedAt: null,
                    cancelRequested: false,
                    inputsDirty: stale,
                    needsReview: cancelled || stale ? undefined : needsReview,
                    needsReviewReason: cancelled || stale ? undefined : (needsReview ? reviewReasons.join(' ') : null),
                    usedSourceUnitIds: cancelled || stale ? undefined : (output?.usedSourceUnitIds ?? []),
                },
            });
        } catch (e) {
            if (e instanceof BadRequestException) throw e;
            const providerBusy = e instanceof ServiceUnavailableException; // sağlayıcı mesajı önceden Türkçe ve teknik detay içermez
            await this.prisma.aiEvalMessage.create({
                data: {
                    sessionId, role: 'ASSISTANT', kind: 'EVALUATION', content: 'Değerlendirme yapılamadı.',
                    modelName: modelName || cfg.evalModel || cfg.models.heavy,
                    promptVersion: EVAL_V3_PROMPT_VERSION, inputVersion,
                    errorText: (e as Error).message,
                },
            });
            await this.prisma.aiEvalSession.update({
                where: { id: sessionId },
                data: { runStatus: 'ERROR', runProgress: Prisma.DbNull, runStartedAt: null, cancelRequested: false },
            });
            if (providerBusy) throw e;
            throw new BadRequestException('Değerlendirme yapılamadı. Lütfen tekrar deneyin.');
        }

        await this.audit(userId, 'AI_EVAL', sessionId, {
            model: modelName, promptVersion: EVAL_V3_PROMPT_VERSION, schemaVersion: EVAL_V3_SCHEMA_VERSION,
        });
        return this.getSession(sessionId, userId);
    }

    /** Son değerlendirmeden SONRA sorulan (Ek soru) soruların soru+yanıt özeti — yeniden değerlendirmeye girer. */
    private collectPendingQuestions(
        messages: { role: string; kind?: string | null; content: string; answerText?: string | null; createdAt?: Date | string }[],
        explicit: string | null,
    ): string | null {
        const lastEvalIdx = (() => {
            for (let i = messages.length - 1; i >= 0; i--) {
                const m = messages[i];
                if (m.role === 'ASSISTANT' && (m.kind ?? 'EVALUATION') === 'EVALUATION') return i;
            }
            return -1;
        })();
        const after = messages.slice(lastEvalIdx + 1);
        const lines: string[] = [];
        const q = after.filter((m) => m.role === 'USER' && m.kind === 'QUESTION');
        for (const m of q) lines.push(`Soru: ${m.content.trim()}`);
        if (explicit?.trim()) lines.push(`Soru: ${explicit.trim()}`);
        return lines.length ? lines.join('\n') : null;
    }

    /** Önceki koşularda kullanıcının yazdığı açıklamalar (en fazla 5) — girdi, kanıt değil. */
    private collectPriorUserHistory(
        messages: { role: string; kind?: string | null; additionalNote?: string | null }[],
    ): string | null {
        const notes = messages
            .filter((m) => m.role === 'USER' && (m.kind ?? 'EVALUATION') === 'EVALUATION' && m.additionalNote?.trim())
            .map((m) => (m.additionalNote as string).trim().slice(0, 1000));
        // Bu koşunun notu henüz mesaj olarak eklenmedi (oturum daha önce okundu) → hepsi "geçmiş".
        const prior = notes.slice(-5);
        return prior.length ? prior.map((n, i) => `${i + 1}) ${n}`).join('\n') : null;
    }

    private controlRiskNames(snapshot: unknown): string[] {
        const c = (snapshot ?? {}) as { risks?: { riskId?: string; name?: string }[] };
        return (c.risks ?? []).map((r) => `${r.riskId ?? ''} ${r.name ?? ''}`.trim()).filter(Boolean);
    }

    /**
     * "Ek soru sor" — kullanıcının önceki değerlendirmeye ilişkin sorusuna
     * DOĞRUDAN yanıt verir; 6 başlıklı raporu YENİDEN ÜRETMEZ, önceki sonucu
     * değiştirmez. Yeni bilgi sonucu etkileyebilecekse yeniden değerlendirme
     * önerir (reevaluationRecommended).
     */
    async askQuestion(sessionId: string, dto: EvalAskDto, userId: string) {
        const session = await this.getSession(sessionId, userId);
        if (session.status === 'TRASHED') throw new BadRequestException('Çöp kutusundaki oturumda soru sorulamaz.');
        if (session.runStatus === 'RUNNING') throw new ConflictException('Değerlendirme çalışırken soru sorulamaz.');
        const question = dto.question.trim();
        if (!question) throw new BadRequestException('Soru boş olamaz.');
        if (
            dto.contentVersion !== undefined &&
            dto.contentVersion !== session.contentVersion
        ) {
            throw new ConflictException('Ekrandaki girdi değişti — sayfayı yenileyip tekrar sorun.');
        }

        const prevEval = this.pickPreviousEvaluation(session.messages);
        const activeAttachments = await this.prisma.aiEvalAttachment.findMany({ where: { sessionId, active: true } });
        const evidenceParts: string[] = [];
        if (session.evidenceText?.trim()) evidenceParts.push(`### Manuel kanıt / yanıt metni\n${session.evidenceText.trim()}`);
        for (const att of activeAttachments) {
            if (att.extractedText) evidenceParts.push(`### ${att.originalName}\n${att.extractedText}`);
        }
        // Soru, SON değerlendirmede modele giden kaynak birimleriyle (retrieval + seçili) yanıtlanır.
        const lastEvalMsg = [...session.messages].reverse().find(
            (m) => m.role === 'ASSISTANT' && (m.kind ?? 'EVALUATION') === 'EVALUATION' && !m.cancelled && !m.stale,
        );
        const askUnits = await this.retrieval
            .loadUserSelected([...new Set([...(session.sourceUnitIds ?? []), ...(lastEvalMsg?.sentSourceUnitIds ?? [])])])
            .catch(() => [] as RetrievedUnit[]);
        const sourceResolved = { promptText: formatUnitsForPrompt(askUnits) };

        await this.prisma.aiEvalMessage.create({
            data: { sessionId, role: 'USER', kind: 'QUESTION', content: question },
        });

        const cfg = this.provider.config;
        const nonce = makeNonce();
        let answer = '';
        let reevaluationRecommended = false;
        let why = '';
        let modelName = '';
        try {
            const resp = await this.provider.chat({
                tier: 'heavy', modelOverride: cfg.evalModel, reasoning: true, json: true, maxTokens: Math.max(cfg.maxTokens, 8000),
                system: EVAL_ASK.system,
                user: EVAL_ASK.user({
                    nonce, question,
                    controlText: this.controlAsText(session),
                    regulationText: this.regulationAsText(session),
                    knowledgeText: this.knowledgeAsText(session),
                    sourceUnitsText: sourceResolved.promptText,
                    evidenceDigest: evidenceParts.join('\n\n').slice(0, MAX_DIGEST),
                    previousEvaluationJson: prevEval ? JSON.stringify(prevEval) : null,
                }),
            });
            modelName = resp.model;
            const p = (resp.parsed ?? {}) as Record<string, unknown>;
            answer = (typeof p.answer === 'string' && p.answer.trim()) || resp.text.trim() || 'Yanıt üretilemedi.';
            reevaluationRecommended = p.reevaluationRecommended === true;
            why = typeof p.why === 'string' ? p.why : '';
        } catch (e) {
            await this.prisma.aiEvalMessage.create({
                data: {
                    sessionId, role: 'ASSISTANT', kind: 'ANSWER', content: 'Soru yanıtlanamadı.',
                    modelName: modelName || cfg.models.heavy, promptVersion: EVAL_PROMPT_VERSION,
                    errorText: (e as Error).message,
                },
            });
            throw new BadRequestException('Soru yanıtlanamadı. Lütfen tekrar deneyin.');
        }

        await this.prisma.aiEvalMessage.create({
            data: {
                sessionId, role: 'ASSISTANT', kind: 'ANSWER',
                content: reevaluationRecommended
                    ? `${answer}\n\n⚠ Bu bilgi sonucu etkileyebilir — "Yeniden değerlendir" önerilir: ${why}`.trim()
                    : answer,
                answerText: answer,
                modelName, promptVersion: EVAL_PROMPT_VERSION, inputVersion: session.contentVersion,
                schemaIssues: ({ reevaluationRecommended, why } as unknown as Prisma.InputJsonValue),
            },
        });
        await this.audit(userId, 'AI_EVAL_ASK', sessionId, { reevaluationRecommended });
        return this.getSession(sessionId, userId);
    }

    /** @deprecated `runEvaluation` kullanın. Eski `:id/messages` rotası + tanı script'i için. */
    async sendMessage(sessionId: string, text: string, userId: string) {
        return this.runEvaluation(sessionId, null, text ?? '', userId);
    }

    /**
     * Kanıt dosyalarını okur; ilerleme fazını günceller; kanıt başına KİMLİKLİ envanter döner
     * (E0 = kullanıcı kanıt metni, E1.. = dosyalar). Okunamayan dosyanın "okunamadı" yer
     * tutucusu ARTIK kalıcı önbelleğe yazılmaz — bir sonraki koşuda yeniden denenir.
     */
    private async readEvidence(
        sessionId: string,
        activeAttachments: {
            id: string; fileName: string; originalName: string; mimeType: string; sizeBytes: number;
            extractedText: string | null; docDate?: string | null; relatedSystem?: string | null;
            relatedSample?: string | null; relatedTestStep?: string | null; note?: string | null;
        }[],
        filesTotal: number,
    ) {
        const items: EvidenceItem[] = [];
        const session = await this.prisma.aiEvalSession.findUnique({ where: { id: sessionId }, select: { evidenceText: true } });
        if (session?.evidenceText?.trim()) {
            items.push({
                evidenceId: 'E0', name: 'Manuel kanıt / yanıt metni', kind: 'TEXT', readStatus: 'READ',
                text: session.evidenceText.trim(), attachmentId: null,
            });
        }
        let filesRead = 0;
        let n = 0;
        for (const att of activeAttachments) {
            n++;
            const meta = {
                docDate: att.docDate ?? null, relatedSystem: att.relatedSystem ?? null,
                relatedSample: att.relatedSample ?? null, relatedTestStep: att.relatedTestStep ?? null, note: att.note ?? null,
            };
            const kind = this.kindFor(att.mimeType, att.originalName);
            const evidenceId = `E${n}`;
            if (att.extractedText) {
                items.push({ evidenceId, name: att.originalName, kind, readStatus: 'READ', attachmentId: att.id, text: att.extractedText, meta });
                continue;
            }
            await this.prisma.aiEvalSession.update({
                where: { id: sessionId },
                data: { runProgress: { phase: 'reading_files', filesRead, filesTotal } as Prisma.InputJsonValue },
            });
            await this.prisma.aiEvalAttachment.update({ where: { id: att.id }, data: { readStatus: 'READING' } });

            let extracted = '';
            let readStatus: 'READ' | 'PARTIAL' | 'FAILED' = 'READ';
            let readNote: string | null = null;
            try {
                const doc = await this.extractor.extractOne({
                    id: att.id, fileName: att.fileName, originalName: att.originalName,
                    mimeType: att.mimeType, sizeBytes: att.sizeBytes,
                });
                if (doc.kind === 'text') {
                    extracted = doc.text ?? '';
                    if (!extracted.trim()) { readStatus = 'PARTIAL'; readNote = 'Metin çıkarılamadı veya boş.'; }
                } else if (doc.kind === 'image' && doc.imageBase64) {
                    const vres = await this.provider.chat({
                        tier: 'vision', json: true,
                        system: EVAL_VISION.system, user: EVAL_VISION.user(att.originalName),
                        images: [{ mimeType: att.mimeType, dataBase64: doc.imageBase64 }],
                    });
                    extracted = `[görsel — VISION okuması]\n${JSON.stringify(vres.parsed ?? { rawText: vres.text }, null, 2)}`;
                } else {
                    readStatus = 'FAILED';
                    readNote = doc.note ?? 'Desteklenmeyen dosya türü.';
                }
            } catch (e) {
                readStatus = 'FAILED';
                readNote = (e as Error).message;
            }
            // Başarısız okuma yer tutucusu kalıcı önbelleğe YAZILMAZ (extractedText null kalır → yeniden denenir).
            await this.prisma.aiEvalAttachment.update({
                where: { id: att.id },
                data: { ...(readStatus === 'FAILED' ? {} : { extractedText: extracted }), readStatus, readNote },
            });
            items.push({
                evidenceId, name: att.originalName, kind, readStatus, note: readNote, attachmentId: att.id,
                text: readStatus === 'FAILED' ? `(otomatik okunamadı${readNote ? ': ' + readNote : ''})` : extracted,
                meta,
            });
            filesRead++;
        }
        return { items, filesRead };
    }

    /** Bağlam için önceki EVALUATION çıktısı (iptal/stale olmayan en yenisi). Kanıt DEĞİL. */
    private pickPreviousEvaluation(messages: { role: string; kind?: string | null; cancelled: boolean; stale: boolean; evaluation: unknown; editedEvaluation: unknown }[]) {
        const m = [...messages].reverse().find(
            (x) => x.role === 'ASSISTANT' && (x.kind ?? 'EVALUATION') === 'EVALUATION' &&
                !x.cancelled && !x.stale && (x.evaluation || x.editedEvaluation),
        );
        return m ? (m.editedEvaluation ?? m.evaluation) : null;
    }

    // ─── Çıktı işlemleri (güncel, incelenmiş sonuçtan) ─────────────────────

    async buildOutputs(id: string, userId: string) {
        const s = await this.getSession(id, userId);
        const eff = (s.latestEvaluation?.effective ?? null) as Record<string, unknown> | null;
        if (!eff) throw new BadRequestException('Çıktı üretilecek bir değerlendirme yok.');

        const notRejected = (v: unknown): unknown[] =>
            Array.isArray(v)
                ? (v as unknown[]).filter((x) => {
                      const r = (x as { _review?: { status?: string } })?._review;
                      return r?.status && r.status !== 'REJECTED';
                  })
                : [];
        const isV3 = s.latestEvaluation?.schemaVersion === EVAL_V3_SCHEMA_VERSION ||
            (typeof eff.expectedState === 'string' && typeof eff.finding === 'object' && !Array.isArray(eff.finding));
        const isV2 = Array.isArray(eff.findingAssessment) || Array.isArray(eff.requirementAssessments);

        if (isV3) {
            const cr = (eff.controlResult ?? {}) as { status?: string; text?: string };
            const f = (eff.finding ?? {}) as { exists?: boolean; title?: string; explanation?: string; _review?: { status?: string } };
            const refs = Array.isArray(eff.references) ? (eff.references as Record<string, unknown>[]) : [];
            const more = Array.isArray(eff.additionalEvidenceRequired) ? (eff.additionalEvidenceRequired as string[]) : [];
            const controlResult = [
                `Kontrol sonucu: ${(cr.status ?? '').replace(/_/g, ' ')}`,
                cr.text || null,
                refs.length ? '\nİlişkili mevzuat ve rehber maddeleri:' : null,
                ...refs.map((r) => `• ${r.sourceName ?? ''} ${r.version ? `(${r.version}) ` : ''}${r.articleNumber ?? ''} — ${r.articleTitle ?? ''}`),
            ].filter(Boolean).join('\n');
            const findingRejected = f._review?.status === 'REJECTED';
            return {
                schemaVersion: s.latestEvaluation?.schemaVersion ?? null,
                outcome: s.outcome,
                runStatus: s.runStatus,
                needsReview: (s as { needsReview?: boolean }).needsReview ?? false,
                needsReviewReason: (s as { needsReviewReason?: string | null }).needsReviewReason ?? null,
                evaluationVersion: s.latestEvaluation?.messageId ?? null,
                reviewed: this.countUnreviewed(eff) === 0,
                controlResult,
                missingEvidenceRequest: more.length
                    ? `Aşağıdaki kanıt/belgeler istenmelidir:\n${more.map((m) => `• ${m}`).join('\n')}`
                    : 'Ek kanıt talebi belirtilmedi.',
                findingCandidates: f.exists === true && !findingRejected ? [f] : [],
            };
        }

        if (isV2) {
            const findings = notRejected(eff.findingAssessment) as Record<string, unknown>[];
            const cr = (eff.controlResult ?? {}) as { overall?: string; summary?: string; samplingPeriodLimits?: string };
            const reqs = Array.isArray(eff.requirementAssessments) ? (eff.requirementAssessments as Record<string, unknown>[]) : [];
            const controlResult = [
                `Genel sonuç: ${(cr.overall ?? '').replace(/_/g, ' ')}`,
                cr.summary || null,
                cr.samplingPeriodLimits ? `Örneklem/dönem sınırı: ${cr.samplingPeriodLimits}` : null,
                reqs.length ? '\nGereklilik bazında:' : null,
                ...reqs.map(
                    (r) => `• [${String(r.result ?? '').replace(/_/g, ' ')}] ${r.requirement ?? r.requirementKey ?? ''}${r.rationale ? ` — ${r.rationale}` : ''}`,
                ),
            ].filter(Boolean).join('\n');

            const evReqs = Array.isArray(eff.recommendations)
                ? (eff.recommendations as Record<string, unknown>[]).filter((r) => r.type === 'EVIDENCE_REQUEST')
                : [];
            const missingEvidenceRequest = evReqs.length
                ? `Aşağıdaki kanıt/belgeler istenmelidir:\n${evReqs
                      .map((r) => `• ${r.requestedDocument ?? r.text ?? ''}${r.answersQuestion ? ` — yanıtlayacağı soru: ${r.answersQuestion}` : ''}`)
                      .join('\n')}`
                : 'Ek kanıt talebi belirtilmedi.';

            return {
                schemaVersion: s.latestEvaluation?.schemaVersion ?? null,
                outcome: s.outcome,
                runStatus: s.runStatus,
                needsReview: (s as { needsReview?: boolean }).needsReview ?? false,
                needsReviewReason: (s as { needsReviewReason?: string | null }).needsReviewReason ?? null,
                evaluationVersion: s.latestEvaluation?.messageId ?? null,
                reviewed: this.countUnreviewed(eff) === 0,
                controlResult,
                missingEvidenceRequest,
                findingCandidates: findings,
            };
        }

        const uyumsuz = notRejected(eff.uyumsuzAlanlar) as Record<string, unknown>[];
        const bulgular = notRejected(eff.bulguAdaylari) as Record<string, unknown>[];
        const genel = (eff.genelDurum ?? {}) as { sonuc?: string; ozet?: string };

        // Kontrol sonucu — YALNIZ tespit, öneri karışmaz.
        const controlResult = [
            `Genel durum: ${(genel.sonuc ?? '').replace(/_/g, ' ')}`,
            genel.ozet || null,
            uyumsuz.length ? '\nTespitler:' : null,
            ...uyumsuz.map(
                (u, i) => `${i + 1}. ${u.konu ?? ''}${u.gerekce ? ` — ${u.gerekce}` : ''}${u.kaynak ? ` (${u.kaynak})` : ''}`,
            ),
        ].filter(Boolean).join('\n');

        const missing: string[] = Array.isArray(eff.eksikBilgi) ? (eff.eksikBilgi as string[]) : [];
        const missingEvidenceRequest = missing.length
            ? `Aşağıdaki kanıtlara ihtiyaç var:\n${missing.map((m) => `• ${m}`).join('\n')}`
            : 'Eksik kanıt belirtilmedi.';

        return {
            schemaVersion: null,
            outcome: s.outcome,
            runStatus: s.runStatus,
            needsReview: (s as { needsReview?: boolean }).needsReview ?? false,
            needsReviewReason: (s as { needsReviewReason?: string | null }).needsReviewReason ?? null,
            evaluationVersion: s.latestEvaluation?.messageId ?? null,
            reviewed: this.countUnreviewed(eff) === 0,
            controlResult,
            missingEvidenceRequest,
            findingCandidates: bulgular,
        };
    }

    // ─── Yardımcılar ──────────────────────────────────────────────────────

    private currentPeriod(): string {
        const d = new Date();
        return `${MONTHS_TR[d.getMonth()]} ${d.getFullYear()}`;
    }

    private deriveTitle(
        controlSnapshot: Record<string, unknown> | null,
        controlText: string | null,
        period?: string,
    ): string {
        const per = period || this.currentPeriod();
        if (controlSnapshot?.name) return `${String(controlSnapshot.name)} — ${per}`;
        const t = (controlText ?? '').trim();
        if (t) {
            const firstLine = t.split('\n').map((l) => l.trim()).find(Boolean) ?? t;
            const short = firstLine.length > 50 ? `${firstLine.slice(0, 50).trim()}…` : firstLine;
            return `${short} — ${per}`;
        }
        return `Kontrol & Kanıt Değerlendirmesi — ${per}`;
    }

    private countUnreviewed(evaluation: Record<string, unknown>): number {
        // v3: yalnız var olan (exists=true) tek bulgu insan incelemesi gerektirir.
        const f3 = evaluation.finding as Record<string, unknown> | undefined;
        if (f3 && typeof f3 === 'object' && !Array.isArray(f3) && typeof evaluation.expectedState === 'string') {
            return f3.exists === true && !f3._review ? 1 : 0;
        }
        // v2: yalnız findingAssessment girişleri insan incelemesi gerektirir.
        const groups: readonly string[] = Array.isArray(evaluation.findingAssessment)
            ? ['findingAssessment']
            : REVIEWABLE_GROUPS;
        let n = 0;
        for (const g of groups) {
            const arr = evaluation[g];
            if (Array.isArray(arr)) {
                for (const item of arr) {
                    if (!item || typeof item !== 'object' || !(item as Record<string, unknown>)._review) n++;
                }
            }
        }
        return n;
    }

    /** Liste ekranı için tespit / eksik-kanıt sayıları (v2 ise yeni şemadan). */
    private countsFromEvaluation(
        evalObj: Record<string, unknown> | undefined,
        _schemaVersion: string | null,
    ): { findings: number | null; missingEvidence: number | null } {
        if (!evalObj) return { findings: null, missingEvidence: null };
        const f3 = evalObj.finding as Record<string, unknown> | undefined;
        if (f3 && typeof f3 === 'object' && !Array.isArray(f3) && typeof evalObj.expectedState === 'string') {
            return {
                findings: f3.exists === true ? 1 : 0,
                missingEvidence: Array.isArray(evalObj.additionalEvidenceRequired) ? evalObj.additionalEvidenceRequired.length : 0,
            };
        }
        if (Array.isArray(evalObj.findingAssessment) || Array.isArray(evalObj.requirementAssessments)) {
            const findings = Array.isArray(evalObj.findingAssessment)
                ? (evalObj.findingAssessment as Record<string, unknown>[]).filter((f) => f?.supported !== false).length
                : 0;
            const missingEvidence = Array.isArray(evalObj.recommendations)
                ? (evalObj.recommendations as Record<string, unknown>[]).filter((r) => r?.type === 'EVIDENCE_REQUEST').length
                : 0;
            return { findings, missingEvidence };
        }
        return { findings: null, missingEvidence: null };
    }

    private async markInputsDirtyIfEvaluated(sessionId: string) {
        const hasEval = await this.prisma.aiEvalMessage.count({
            where: {
                sessionId, role: 'ASSISTANT', kind: 'EVALUATION', cancelled: false, stale: false,
                NOT: { evaluation: { equals: Prisma.DbNull } },
            },
        });
        if (hasEval > 0) {
            await this.prisma.aiEvalSession.update({ where: { id: sessionId }, data: { inputsDirty: true } });
        }
    }

    private async audit(userId: string, action: string, entityId: string, newValue?: Record<string, unknown>) {
        await this.prisma.auditLog
            .create({
                data: {
                    userId, action, entityType: 'AiEvalSession', entityId,
                    newValue: (newValue ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                },
            })
            .catch(() => undefined);
    }

    private async buildSnapshots(
        controlRefId: string | null,
        controlText: string | null,
        articleIds: string[],
        knowledgeDocIds: string[],
        sourceUnitIds: string[] = [],
    ) {
        let controlSnapshot: Record<string, unknown> | null = null;
        if (controlRefId) {
            const c = await this.prisma.control.findUnique({
                where: { id: controlRefId },
                select: {
                    controlId: true, name: true, description: true, testSteps: true, type: true, frequency: true,
                    mehaz: true, version: true,
                    owner: { select: { firstName: true, lastName: true, department: true } },
                    directorateRel: { select: { name: true } },
                    risks: { select: { risk: { select: { riskId: true, name: true } } } },
                },
            });
            if (!c) throw new BadRequestException('Seçilen kontrol bulunamadı');
            const { owner, directorateRel, risks, ...rest } = c;
            controlSnapshot = {
                ...rest,
                owner: owner ? { name: `${owner.firstName} ${owner.lastName}`.trim(), department: owner.department ?? null } : null,
                directorate: directorateRel?.name ?? null,
                risks: risks.map((r) => ({ riskId: r.risk.riskId, name: r.risk.name })),
            };
        }
        void controlText;

        let regulationSnapshot: unknown[] | null = null;
        if (articleIds.length) {
            const rows = await this.prisma.regulationArticle.findMany({
                where: { id: { in: articleIds } },
                select: {
                    articleCode: true, title: true, description: true,
                    regulation: { select: { code: true, name: true } },
                },
            });
            regulationSnapshot = rows.map((r) => ({
                madde: `${r.regulation.code} md.${r.articleCode}`,
                regulasyon: r.regulation.name, baslik: r.title, metin: r.description,
            }));
        }

        let knowledgeSnapshot: unknown[] | null = null;
        if (knowledgeDocIds.length) {
            const rows = await this.prisma.knowledgeDoc.findMany({
                where: { id: { in: knowledgeDocIds }, isActive: true },
                select: { kind: true, code: true, title: true, body: true, sourceRef: true },
            });
            knowledgeSnapshot = rows.map((r) => ({
                tur: r.kind, kod: r.code, baslik: r.title, metin: r.body, kaynak: r.sourceRef,
            }));
        }

        // Kaynak Kataloğu birimleri — sürüm + özgün metin izlenebilir biçimde snapshot'lanır.
        let sourceSnapshot: unknown[] | null = null;
        if (sourceUnitIds.length) {
            const units = await this.prisma.sourceUnit.findMany({
                where: { id: { in: sourceUnitIds } },
                select: {
                    id: true, stableKey: true, unitCode: true, title: true, originalText: true, translationTr: true,
                    version: {
                        select: {
                            id: true, versionLabel: true,
                            source: { select: { slug: true, title: true, officialUrl: true, confidentiality: true, rightRag: true } },
                        },
                    },
                },
            });
            sourceSnapshot = units.map((u) => ({
                unitId: u.id,
                stableKey: u.stableKey,
                kod: u.unitCode,
                baslik: u.title,
                ozgunMetin: u.originalText,
                trAciklama: u.translationTr,
                kaynak: u.version.source.title,
                slug: u.version.source.slug,
                surum: u.version.versionLabel,
                versionId: u.version.id,
                resmiUrl: u.version.source.officialUrl,
                gizlilik: u.version.source.confidentiality,
                ragHakki: u.version.source.rightRag,
            }));
        }

        return { controlSnapshot, regulationSnapshot, knowledgeSnapshot, sourceSnapshot };
    }

    private controlAsText(session: {
        controlText: string | null; controlManualNote: string | null; controlSnapshot: unknown; period?: string | null;
    }): string {
        const parts: string[] = [];
        if (session.controlSnapshot && typeof session.controlSnapshot === 'object') {
            const c = session.controlSnapshot as Record<string, unknown> & {
                owner?: { name?: string; department?: string } | null;
                directorate?: string | null;
                risks?: { riskId?: string; name?: string }[];
            };
            parts.push(`Kontrol: ${c.name ?? ''} (${c.controlId ?? ''})`, `Tanım / amaç: ${c.description ?? ''}`);
            if (c.testSteps) parts.push(`Test adımları: ${c.testSteps}`);
            if (c.mehaz) parts.push(`Mehaz: ${c.mehaz}`);
            if (c.frequency) parts.push(`Kontrol periyodu: ${c.frequency}`);
            if (c.type) parts.push(`Kontrol türü: ${c.type}`);
            if (c.owner?.name) parts.push(`Kontrol sahibi: ${c.owner.name}${c.owner.department ? ` (${c.owner.department})` : ''}`);
            if (c.directorate) parts.push(`Sorumlu birim: ${c.directorate}`);
            if (c.risks?.length) parts.push(`Bağlı riskler: ${c.risks.map((r) => `${r.riskId ?? ''} ${r.name ?? ''}`.trim()).join('; ')}`);
        } else if (session.controlText?.trim()) {
            parts.push(session.controlText.trim());
        }
        if (session.controlManualNote?.trim()) parts.push(`Ek not (kullanıcı): ${session.controlManualNote.trim()}`);
        return parts.join('\n') || '(kontrol metni yok)';
    }

    private regulationAsText(session: { regulationSnapshot: unknown }): string {
        if (!Array.isArray(session.regulationSnapshot)) return '';
        return (session.regulationSnapshot as Record<string, unknown>[])
            .map((r) => `• ${r.madde} — ${r.baslik}\n${r.metin}`).join('\n\n');
    }

    private knowledgeAsText(session: { knowledgeSnapshot: unknown }): string {
        if (!Array.isArray(session.knowledgeSnapshot)) return '';
        return (session.knowledgeSnapshot as Record<string, unknown>[])
            .map((r) => {
                const kaynak = r.kaynak ? ` (kaynak: ${r.kaynak})` : '';
                return `• [${r.tur} ${r.kod}] ${r.baslik}${kaynak}\n${r.metin}`;
            })
            .join('\n\n');
    }

    private async loadPrecedentFindings(controlRefId: string | null, queryText: string) {
        if (!this.embeddings.enabled) return [];
        const pool = await this.prisma.finding.findMany({
            where: controlRefId
                ? { OR: [{ controlId: controlRefId }, { controlTest: { controlId: controlRefId } }] }
                : {},
            orderBy: { createdAt: 'desc' },
            take: controlRefId ? 25 : 40,
            select: {
                findingId: true, summary: true, description: true, severity: true, status: true, recommendation: true,
            },
        });
        if (pool.length === 0) return [];

        const ranked = await this.embeddings.rankBySimilarity(
            queryText,
            pool.map((f) => ({
                text: `${f.summary ?? ''} ${f.description} ${f.recommendation ?? ''}`.trim(),
                item: f,
            })),
            5,
        );
        const source = ranked.length ? ranked.map((r) => ({ ...r.item, benzerlik: r.similarity })) : [];
        return source.map((f) => ({
            findingId: f.findingId,
            severity: f.severity,
            status: f.status,
            ozet: f.summary ?? null,
            aciklama: f.description.slice(0, 600),
            oneri: f.recommendation?.slice(0, 400) ?? null,
            benzerlik: 'benzerlik' in f ? Number((f.benzerlik as number).toFixed(3)) : undefined,
        }));
    }

    private kindFor(mimeType: string, name: string): EvalKind {
        const ext = name.toLowerCase().split('.').pop() || '';
        if (mimeType.startsWith('image/')) return 'IMAGE';
        if (['eml', 'msg'].includes(ext) || mimeType === 'message/rfc822' || mimeType === 'application/vnd.ms-outlook') {
            return 'EMAIL';
        }
        if (['txt', 'csv'].includes(ext)) return 'TEXT';
        return 'DOCUMENT';
    }
}
