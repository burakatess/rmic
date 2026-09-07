import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { AiProviderService } from './ai-provider.service';
import { AiEmbeddingService } from './ai-embedding.service';
import { TextExtractService } from './text-extract.service';
import { AI_PROMPT_VERSION, EVAL, EVAL_VISION } from './prompts';

type EvalKind = 'DOCUMENT' | 'IMAGE' | 'EMAIL' | 'TEXT';

export interface CreateEvalSessionDto {
    title?: string;
    controlRefId?: string | null;
    controlText?: string | null;
    controlManualNote?: string | null;
    evidenceText?: string | null;
    regulationArticleIds?: string[];
    knowledgeDocIds?: string[];
}

const MAX_DIGEST = 40_000;

@Injectable()
export class AiEvalService {
    constructor(
        private prisma: PrismaService,
        private provider: AiProviderService,
        private embeddings: AiEmbeddingService,
        private extractor: TextExtractService,
    ) {}

    // ─── Oturum yönetimi ─────────────────────────────────────────────────────

    async createSession(dto: CreateEvalSessionDto, userId: string) {
        const { controlSnapshot, regulationSnapshot, knowledgeSnapshot, defaultTitle } = await this.buildSnapshots(
            dto.controlRefId ?? null,
            dto.controlText ?? null,
            dto.regulationArticleIds ?? [],
            dto.knowledgeDocIds ?? [],
        );
        return this.prisma.aiEvalSession.create({
            data: {
                title: dto.title?.trim() || defaultTitle,
                controlRefId: dto.controlRefId ?? null,
                controlText: dto.controlText ?? null,
                controlManualNote: dto.controlManualNote ?? null,
                evidenceText: dto.evidenceText ?? null,
                controlSnapshot: (controlSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                regulationArticleIds: dto.regulationArticleIds ?? [],
                regulationSnapshot: (regulationSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                knowledgeDocIds: dto.knowledgeDocIds ?? [],
                knowledgeSnapshot: (knowledgeSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                createdById: userId,
            },
        });
    }

    async listSessions(userId: string) {
        return this.prisma.aiEvalSession.findMany({
            where: { createdById: userId, status: 'ACTIVE' },
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                title: true,
                controlRefId: true,
                createdAt: true,
                updatedAt: true,
                _count: { select: { messages: true, attachments: true } },
            },
        });
    }

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
        return s;
    }

    async updateSession(id: string, dto: CreateEvalSessionDto, userId: string) {
        await this.getSession(id, userId);
        const { controlSnapshot, regulationSnapshot, knowledgeSnapshot, defaultTitle } = await this.buildSnapshots(
            dto.controlRefId ?? null,
            dto.controlText ?? null,
            dto.regulationArticleIds ?? [],
            dto.knowledgeDocIds ?? [],
        );
        return this.prisma.aiEvalSession.update({
            where: { id },
            data: {
                title: dto.title?.trim() || defaultTitle,
                controlRefId: dto.controlRefId ?? null,
                controlText: dto.controlText ?? null,
                controlManualNote: dto.controlManualNote ?? null,
                evidenceText: dto.evidenceText ?? null,
                controlSnapshot: (controlSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                regulationArticleIds: dto.regulationArticleIds ?? [],
                regulationSnapshot: (regulationSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                knowledgeDocIds: dto.knowledgeDocIds ?? [],
                knowledgeSnapshot: (knowledgeSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            },
        });
    }

    async archiveSession(id: string, userId: string) {
        await this.getSession(id, userId);
        await this.prisma.aiEvalSession.update({ where: { id }, data: { status: 'ARCHIVED' } });
        return { ok: true };
    }

    // ─── Ekler ───────────────────────────────────────────────────────────────

    async addAttachment(
        sessionId: string,
        meta: { fileName: string; originalName: string; mimeType: string; sizeBytes: number },
        userId: string,
    ) {
        await this.getSession(sessionId, userId);
        const kind = this.kindFor(meta.mimeType, meta.originalName);
        return this.prisma.aiEvalAttachment.create({
            data: { sessionId, ...meta, kind, uploadedById: userId },
        });
    }

    async removeAttachment(sessionId: string, attId: string, userId: string) {
        await this.getSession(sessionId, userId);
        const att = await this.prisma.aiEvalAttachment.findFirst({ where: { id: attId, sessionId } });
        if (!att) throw new NotFoundException('Ek bulunamadı');
        await this.prisma.aiEvalAttachment.delete({ where: { id: attId } });
        return { ok: true };
    }

    // ─── Değerlendirme (sohbet turu) ─────────────────────────────────────────

    async sendMessage(sessionId: string, text: string, userId: string) {
        const session = await this.getSession(sessionId, userId);
        if (!session.controlText?.trim() && !session.controlSnapshot && !session.controlManualNote?.trim()) {
            throw new BadRequestException('Önce Kontrol Alanı doldurulmalı (envanterden seçin veya elle yazın).');
        }

        const attachmentCount = await this.prisma.aiEvalAttachment.count({ where: { sessionId } });
        const priorTurns = await this.prisma.aiEvalMessage.count({ where: { sessionId, role: 'ASSISTANT' } });
        const hasEvidence =
            attachmentCount > 0 || !!session.evidenceText?.trim() || !!text?.trim() || priorTurns > 0;
        if (!hasEvidence) {
            throw new BadRequestException(
                'Değerlendirme için en az bir kanıt gerekli: dosya ekleyin, Yanıt/Kanıt metni yazın ya da açıklama girin.',
            );
        }

        const userContent = text?.trim() || 'Sağlanan kanıtları kontrol ve mevzuata göre değerlendir.';
        await this.prisma.aiEvalMessage.create({
            data: { sessionId, role: 'USER', content: userContent },
        });

        // Görsel eklerin metnini (yoksa) VISION ile çıkar ve önbelleğe al
        const attachments = await this.prisma.aiEvalAttachment.findMany({ where: { sessionId } });
        const evidenceParts: string[] = [];
        if (session.evidenceText?.trim()) {
            evidenceParts.push(`### Manuel kanıt / yanıt metni\n${session.evidenceText.trim()}`);
        }
        for (const att of attachments) {
            if (att.extractedText) {
                evidenceParts.push(`### ${att.originalName}\n${att.extractedText}`);
                continue;
            }
            const doc = await this.extractor.extractOne({
                id: att.id,
                fileName: att.fileName,
                originalName: att.originalName,
                mimeType: att.mimeType,
                sizeBytes: att.sizeBytes,
            });
            let extracted = '';
            if (doc.kind === 'text') {
                extracted = doc.text ?? '';
            } else if (doc.kind === 'image' && doc.imageBase64) {
                const vres = await this.provider.chat({
                    tier: 'vision',
                    json: true,
                    system: EVAL_VISION.system,
                    user: EVAL_VISION.user(att.originalName),
                    images: [{ mimeType: att.mimeType, dataBase64: doc.imageBase64 }],
                });
                extracted = `[görsel — VISION okuması]\n${JSON.stringify(vres.parsed ?? { rawText: vres.text }, null, 2)}`;
            } else {
                extracted = `(otomatik okunamadı${doc.note ? ': ' + doc.note : ''})`;
            }
            await this.prisma.aiEvalAttachment.update({ where: { id: att.id }, data: { extractedText: extracted } });
            evidenceParts.push(`### ${att.originalName}\n${extracted}`);
        }

        const controlText = this.controlAsText(session);
        const regulationText = this.regulationAsText(session);
        const knowledgeText = this.knowledgeAsText(session);
        const history = session.messages
            .map((m) => `${m.role === 'USER' ? 'Kullanıcı' : 'Asistan'}: ${m.content}`)
            .join('\n');
        const evidenceDigest = evidenceParts.join('\n\n').slice(0, MAX_DIGEST);
        const precedents = await this.loadPrecedentFindings(
            session.controlRefId,
            `${controlText}\n${evidenceDigest}`.slice(0, 4000),
        );
        const precedentText = precedents.length ? JSON.stringify(precedents, null, 2) : '';
        const lastEval = [...session.messages].reverse().find((m) => m.role === 'ASSISTANT' && m.evaluation);
        const lastEvaluationJson = lastEval ? JSON.stringify(lastEval.evaluation) : null;

        const cfg = this.provider.config;
        let modelName = '';
        let assistantMsg;
        try {
            const resp = await this.provider.chat({
                tier: 'heavy',
                modelOverride: cfg.evalModel,
                reasoning: true,
                json: true,
                system: EVAL.system,
                user: EVAL.user({
                    controlText,
                    regulationText,
                    knowledgeText,
                    precedentText,
                    evidenceDigest,
                    history,
                    userMessage: text?.trim(),
                    lastEvaluationJson,
                }),
            });
            modelName = resp.model;
            const parsed = (resp.parsed ?? { sohbetNotu: resp.text }) as { sohbetNotu?: string };
            assistantMsg = await this.prisma.aiEvalMessage.create({
                data: {
                    sessionId,
                    role: 'ASSISTANT',
                    content: parsed.sohbetNotu || 'Değerlendirme tamamlandı.',
                    evaluation: (resp.parsed ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                    modelName: resp.model,
                    tokensIn: resp.tokensIn ?? null,
                    tokensOut: resp.tokensOut ?? null,
                    latencyMs: resp.latencyMs,
                },
            });
        } catch (e) {
            assistantMsg = await this.prisma.aiEvalMessage.create({
                data: {
                    sessionId,
                    role: 'ASSISTANT',
                    content: 'Değerlendirme yapılamadı.',
                    modelName: modelName || cfg.evalModel || cfg.models.heavy,
                    errorText: (e as Error).message,
                },
            });
            await this.prisma.aiEvalSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });
            throw e;
        }

        await this.prisma.aiEvalSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });
        await this.prisma.auditLog.create({
            data: {
                userId,
                action: 'AI_EVAL',
                entityType: 'AiEvalSession',
                entityId: sessionId,
                newValue: { model: modelName, promptVersion: AI_PROMPT_VERSION },
            },
        });

        return this.getSession(sessionId, userId);
    }

    // ─── Yardımcılar ─────────────────────────────────────────────────────────

    private async buildSnapshots(
        controlRefId: string | null,
        controlText: string | null,
        articleIds: string[],
        knowledgeDocIds: string[],
    ) {
        let controlSnapshot: Record<string, unknown> | null = null;
        let defaultTitle = 'Kontrol & Kanıt Değerlendirmesi';

        if (controlRefId) {
            const c = await this.prisma.control.findUnique({
                where: { id: controlRefId },
                select: { controlId: true, name: true, description: true, testSteps: true, type: true, frequency: true },
            });
            if (!c) throw new BadRequestException('Seçilen kontrol bulunamadı');
            controlSnapshot = { ...c };
            defaultTitle = `${c.name} — değerlendirme`;
        } else if (controlText?.trim()) {
            defaultTitle = `${controlText.trim().slice(0, 40)}… — değerlendirme`;
        }

        let regulationSnapshot: unknown[] | null = null;
        if (articleIds.length) {
            const rows = await this.prisma.regulationArticle.findMany({
                where: { id: { in: articleIds } },
                select: {
                    articleCode: true,
                    title: true,
                    description: true,
                    regulation: { select: { code: true, name: true } },
                },
            });
            regulationSnapshot = rows.map((r) => ({
                madde: `${r.regulation.code} md.${r.articleCode}`,
                regulasyon: r.regulation.name,
                baslik: r.title,
                metin: r.description,
            }));
        }

        let knowledgeSnapshot: unknown[] | null = null;
        if (knowledgeDocIds.length) {
            const rows = await this.prisma.knowledgeDoc.findMany({
                where: { id: { in: knowledgeDocIds }, isActive: true },
                select: { kind: true, code: true, title: true, body: true, sourceRef: true },
            });
            knowledgeSnapshot = rows.map((r) => ({
                tur: r.kind,
                kod: r.code,
                baslik: r.title,
                metin: r.body,
                kaynak: r.sourceRef,
            }));
        }

        return { controlSnapshot, regulationSnapshot, knowledgeSnapshot, defaultTitle };
    }

    private controlAsText(session: {
        controlText: string | null;
        controlManualNote: string | null;
        controlSnapshot: unknown;
    }): string {
        const parts: string[] = [];
        if (session.controlSnapshot && typeof session.controlSnapshot === 'object') {
            const c = session.controlSnapshot as Record<string, unknown>;
            parts.push(
                `Kontrol: ${c.name ?? ''} (${c.controlId ?? ''})`,
                `Tanım: ${c.description ?? ''}`,
            );
            if (c.testSteps) parts.push(`Test adımları: ${c.testSteps}`);
        } else if (session.controlText?.trim()) {
            parts.push(session.controlText.trim());
        }
        if (session.controlManualNote?.trim()) {
            parts.push(`Ek not (kullanıcı): ${session.controlManualNote.trim()}`);
        }
        return parts.join('\n') || '(kontrol metni yok)';
    }

    private regulationAsText(session: { regulationSnapshot: unknown }): string {
        if (!Array.isArray(session.regulationSnapshot)) return '';
        return (session.regulationSnapshot as Record<string, unknown>[])
            .map((r) => `• ${r.madde} — ${r.baslik}\n${r.metin}`)
            .join('\n\n');
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

    /**
     * Kontrol + kanıt metnine en benzer geçmiş bulguları getirir — tutarlı
     * derecelendirme ve tekrar tespiti için referans. Embedding devre dışıysa veya
     * çağrı başarısız olursa boş dizi (özellik bozulmaz).
     */
    private async loadPrecedentFindings(controlRefId: string | null, queryText: string) {
        if (!this.embeddings.enabled) return [];
        const pool = await this.prisma.finding.findMany({
            where: controlRefId
                ? { OR: [{ controlId: controlRefId }, { controlTest: { controlId: controlRefId } }] }
                : {},
            orderBy: { createdAt: 'desc' },
            take: controlRefId ? 25 : 40,
            select: {
                findingId: true,
                summary: true,
                description: true,
                severity: true,
                status: true,
                recommendation: true,
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
        if (['eml', 'msg'].includes(ext) || mimeType === 'message/rfc822' || mimeType === 'application/vnd.ms-outlook')
            return 'EMAIL';
        if (['txt', 'csv'].includes(ext)) return 'TEXT';
        return 'DOCUMENT';
    }
}
