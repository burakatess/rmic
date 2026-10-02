import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../../prisma';
import { AiEmbeddingService } from '../ai-embedding.service';
import {
    METHODOLOGY_HASH, METHODOLOGY_SLUG, METHODOLOGY_TEXT, METHODOLOGY_VERSION,
} from '../../library/system-sources/methodology';
import {
    CandidateDoc, RetrievalQuery, bm25Score, fuseAndRank,
} from './eval-retrieval.util';
import { RetrievedUnit } from './eval-v3.types';

/** Bir birimin prompt'a girebileceği azami metin (kesilirse açıkça işaretlenir). */
export const UNIT_PROMPT_LIMIT = 3000;
export const SOURCES_TOTAL_LIMIT = 24_000;

/** Otomatik taramada aranan kaynak türleri (metodoloji ayrı ve HER ZAMAN eklenir). */
const SEARCHABLE_KINDS = ['REGULATION', 'OFFICIAL_GUIDE', 'CORPORATE_POLICY'] as const;
const SCOPE_PARAM_KEY = 'evaluation_scope_profile';

export interface RetrievalNote {
    method: 'HYBRID' | 'LEXICAL_ONLY' | 'NONE';
    semanticUsed: boolean;
    semanticUnavailableReason: string | null;
    poolSize: number;
    thresholds: { minScore: number; topK: number };
    queryTerms: string[];
    codeMentions: string[];
    candidates: {
        unitId: string; unitCode: string; title: string;
        lexical: number; semantic: number | null; fused: number; rank: number | null; sent: boolean;
    }[];
    selectedByUser: string[];
    sentUnitIds: string[];
    truncatedUnitIds: string[];
    notes: string[];
}

interface ScopeProfile { [slug: string]: 'IN_SCOPE' | 'OUT_OF_SCOPE' | 'UNVERIFIED' }

const sha16 = (t: string) => createHash('sha256').update(t).digest('hex').slice(0, 16);

/**
 * Kontrol & Kanıt Değerlendirme için OTOMATİK kaynak taraması.
 * Sıra: sorgu üret (eval-retrieval.util) → onaylı sistem kaynaklarında sözcük (BM25) +
 * anlamsal (embedding) skor → birleştir/yeniden sırala → eşik → top-K.
 * Bütün rehber/mevzuat prompt'a ALINMAZ; yalnız eşiği geçen birimler girer.
 * Embedding kullanılamıyorsa sözcük araması ile devam edilir (retrievalNote'ta belirtilir).
 */
@Injectable()
export class EvalSourceRetrievalService {
    private readonly logger = new Logger('EvalSourceRetrieval');
    private vectorCache = new Map<string, { at: number; vectors: Map<string, number[]> }>();

    constructor(
        private prisma: PrismaService,
        private embeddings: AiEmbeddingService,
    ) {}

    // ─── Sistem metodolojisi (güvenilir talimat) ─────────────────────────────
    async loadMethodology(): Promise<{ text: string; version: string; hash: string; origin: 'DB' | 'BUILTIN' }> {
        try {
            const src = await this.prisma.source.findUnique({
                where: { slug: METHODOLOGY_SLUG },
                include: {
                    versions: {
                        where: { approvalStatus: 'APPROVED' },
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        select: { versionLabel: true, fullText: true },
                    },
                },
            });
            const v = src?.isActive ? src.versions[0] : null;
            if (v?.fullText?.trim()) {
                return { text: v.fullText, version: v.versionLabel, hash: sha16(v.fullText), origin: 'DB' };
            }
        } catch (e) {
            this.logger.warn(`Metodoloji DB'den okunamadı, yerleşik metin kullanılacak: ${(e as Error).message}`);
        }
        return { text: METHODOLOGY_TEXT, version: METHODOLOGY_VERSION, hash: METHODOLOGY_HASH.slice(0, 16), origin: 'BUILTIN' };
    }

    // ─── Kurum kapsam profili (ör. Tebliğ kapsamında mıyız?) ──────────────────
    async loadScopeProfile(): Promise<ScopeProfile> {
        try {
            const p = await this.prisma.parameter.findUnique({ where: { key: SCOPE_PARAM_KEY } });
            const v = p?.value;
            if (v && typeof v === 'object' && !Array.isArray(v)) return v as ScopeProfile;
        } catch (e) {
            this.logger.warn(`Kapsam profili okunamadı: ${(e as Error).message}`);
        }
        return {};
    }

    private scopeStatusOf(kind: string, slug: string, sourceMeta: unknown, profile: ScopeProfile): string {
        if (kind !== 'REGULATION') return 'IN_SCOPE'; // rehber/politika için kapsam bayrağı gerekmez
        if (profile[slug]) return profile[slug];
        const meta = (sourceMeta ?? {}) as { scope?: { status?: string } };
        return meta.scope?.status === 'IN_SCOPE' || meta.scope?.status === 'OUT_OF_SCOPE'
            ? meta.scope.status
            : 'UNVERIFIED';
    }

    private toRetrievedUnit(
        u: {
            id: string; unitCode: string; title: string; originalText: string; locator: unknown;
            version: { id: string; versionLabel: string; source: { id: string; slug: string; title: string; kind: string; metadata: unknown } };
        },
        profile: ScopeProfile,
        extra: { score: number | null; rank: number | null; method: string | null; origin: RetrievedUnit['origin'] },
    ): RetrievedUnit {
        const s = u.version.source;
        const loc = (u.locator ?? {}) as { page?: unknown };
        const page = typeof loc.page === 'number' ? loc.page : null;
        const truncated = u.originalText.length > UNIT_PROMPT_LIMIT;
        return {
            unitId: u.id, sourceId: s.id, versionId: u.version.id, sourceSlug: s.slug, sourceName: s.title,
            sourceKind: s.kind, versionLabel: u.version.versionLabel, unitCode: u.unitCode, title: u.title,
            page, text: truncated ? u.originalText.slice(0, UNIT_PROMPT_LIMIT) : u.originalText,
            textHash: sha16(u.originalText), truncated,
            scopeStatus: this.scopeStatusOf(s.kind, s.slug, s.metadata, profile),
            score: extra.score, rank: extra.rank, method: extra.method, origin: extra.origin,
        };
    }

    // ─── Kullanıcının elle seçtiği birimler (canlı onay/hak doğrulaması) ──────
    async loadUserSelected(unitIds: string[]): Promise<RetrievedUnit[]> {
        if (!unitIds?.length) return [];
        const profile = await this.loadScopeProfile();
        const rows = await this.prisma.sourceUnit.findMany({
            where: { id: { in: unitIds } },
            include: { version: { include: { source: true } } },
        });
        const byId = new Map(rows.map((r) => [r.id, r]));
        const blocked: string[] = [];
        const out: RetrievedUnit[] = [];
        for (const id of unitIds) {
            const u = byId.get(id);
            if (!u) { blocked.push(`Seçili kaynak birimi bulunamadı (${id.slice(0, 8)}…).`); continue; }
            const s = u.version.source;
            if (u.version.approvalStatus !== 'APPROVED') {
                blocked.push(`"${s.title} ${u.version.versionLabel} · ${u.unitCode}" sürümü artık onaylı değil (${u.version.approvalStatus}).`);
                continue;
            }
            if (s.rightRag !== 'ALLOWED' || !s.rightsVerifiedAt) {
                blocked.push(`"${s.title} · ${u.unitCode}" kaynağının RAG kullanım hakkı geri alınmış / doğrulanmamış.`);
                continue;
            }
            out.push(this.toRetrievedUnit(u, profile, { score: null, rank: null, method: 'USER_SELECTED', origin: 'USER_SELECTED' }));
        }
        if (blocked.length > 0) {
            throw new BadRequestException(
                'Seçili kaynaklarla değerlendirme başlatılamaz:\n' + blocked.map((b) => '• ' + b).join('\n') +
                    '\nKaynak seçimini güncelleyin.',
            );
        }
        return out;
    }

    /**
     * ESKİ akışta kullanıcının seçtiği mevzuat maddeleri (Regulation/RegulationArticle) — sistem kaynağı
     * karşılığı (BIGR-<no>, md.<no>) varsa SourceUnit olarak eklenir (atıf yapılabilir); yoksa yalnız BAĞLAM
     * metni olarak döner (id'si olmadığı için atıf yapılamaz).
     */
    async resolveLegacyRegulationSelections(
        snapshot: unknown,
    ): Promise<{ units: RetrievedUnit[]; contextOnly: { madde: string; baslik: string; metin: string }[] }> {
        const items = Array.isArray(snapshot) ? (snapshot as { madde?: string; baslik?: string; metin?: string }[]) : [];
        if (items.length === 0) return { units: [], contextOnly: [] };
        const codeOf = (madde: string): string | null => {
            const m = madde.match(/^(\S+)\s+md\.(.+)$/);
            if (!m) return null;
            if (/BIGR/i.test(m[1])) return `BIGR-${m[2].trim()}`;
            return `md.${m[2].trim()}`;
        };
        const wanted = items.map((i) => ({ i, code: i.madde ? codeOf(i.madde) : null }));
        const codes = [...new Set(wanted.map((w) => w.code).filter((c): c is string => !!c))];
        const profile = await this.loadScopeProfile();
        const rows = codes.length
            ? await this.prisma.sourceUnit.findMany({
                where: {
                    unitCode: { in: codes },
                    version: {
                        approvalStatus: 'APPROVED', supersededById: null,
                        source: { isActive: true, isSystemManaged: true, rightRag: 'ALLOWED', rightsVerifiedAt: { not: null }, kind: { in: [...SEARCHABLE_KINDS] } },
                    },
                },
                include: { version: { include: { source: true } } },
            })
            : [];
        const byCode = new Map(rows.map((r) => [r.unitCode, r]));
        const units: RetrievedUnit[] = [];
        const contextOnly: { madde: string; baslik: string; metin: string }[] = [];
        for (const w of wanted) {
            const row = w.code ? byCode.get(w.code) : undefined;
            if (row) units.push(this.toRetrievedUnit(row, profile, { score: null, rank: null, method: 'USER_SELECTED_LEGACY', origin: 'USER_SELECTED' }));
            else contextOnly.push({ madde: w.i.madde ?? '', baslik: w.i.baslik ?? '', metin: (w.i.metin ?? '').slice(0, 2000) });
        }
        return { units, contextOnly };
    }

    // ─── Otomatik hybrid retrieval ────────────────────────────────────────────
    async retrieve(
        query: RetrievalQuery,
        opt: { topK?: number; minScore?: number } = {},
    ): Promise<{ units: RetrievedUnit[]; note: RetrievalNote }> {
        const topK = opt.topK ?? Number(process.env.AI_EVAL_RETRIEVAL_TOP_K || 8);
        const minScore = opt.minScore ?? Number(process.env.AI_EVAL_RETRIEVAL_MIN_SCORE || 0.3);
        const note: RetrievalNote = {
            method: 'NONE', semanticUsed: false, semanticUnavailableReason: null, poolSize: 0,
            thresholds: { minScore, topK },
            queryTerms: query.terms.slice(0, 15).map((t) => t.stem), codeMentions: query.codeMentions.slice(0, 15),
            candidates: [], selectedByUser: [], sentUnitIds: [], truncatedUnitIds: [], notes: [],
        };

        const profile = await this.loadScopeProfile();
        const rows = await this.prisma.sourceUnit.findMany({
            where: {
                version: {
                    approvalStatus: 'APPROVED', supersededById: null,
                    OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
                    source: {
                        isActive: true, isSystemManaged: true, isTestFixture: false,
                        rightRag: 'ALLOWED', rightsVerifiedAt: { not: null },
                        confidentiality: { in: ['PUBLIC', 'INTERNAL'] },
                        kind: { in: [...SEARCHABLE_KINDS] },
                    },
                },
            },
            include: { version: { include: { source: true } } },
        });
        note.poolSize = rows.length;
        if (rows.length === 0) {
            note.notes.push('Taranabilecek onaylı sistem kaynağı yok (kaynaklar henüz içe aktarılmamış olabilir).');
            return { units: [], note };
        }

        const docs: CandidateDoc[] = rows.map((u) => ({
            unitId: u.id, unitCode: u.unitCode, title: u.title, text: u.originalText,
            extra: ((u.metadata ?? {}) as { denetimSorusu?: string }).denetimSorusu ?? null,
        }));
        const lexical = bm25Score(query, docs);

        // Anlamsal skor — kullanılamazsa sözcük aramasına düş (not'ta belirtilir).
        let semantic: Map<string, number> | null = null;
        if (!this.embeddings.enabled) {
            note.semanticUnavailableReason = 'Embedding servisi kapalı.';
        } else {
            try {
                const vectors = await this.loadVectors([...new Set(rows.map((r) => r.version.id))]);
                if (vectors.size === 0) {
                    note.semanticUnavailableReason = 'Kaynak birimleri için embedding indeksi yok.';
                } else {
                    const q = await this.embeddings.embedQuery(query.text);
                    if (q.length > 0) {
                        semantic = new Map();
                        for (const [unitId, vec] of vectors) {
                            if (vec.length === q.length) semantic.set(unitId, AiEmbeddingService.cosine(q, vec));
                        }
                        if (semantic.size === 0) { semantic = null; note.semanticUnavailableReason = 'Embedding boyutları uyuşmuyor.'; }
                    }
                }
            } catch (e) {
                note.semanticUnavailableReason = `Anlamsal arama başarısız: ${(e as Error).message}`;
                this.logger.warn(note.semanticUnavailableReason);
            }
        }
        note.semanticUsed = semantic !== null;
        note.method = semantic ? 'HYBRID' : 'LEXICAL_ONLY';

        const fused = fuseAndRank(query, docs, lexical, semantic, { minScore, topK });
        const rowById = new Map(rows.map((r) => [r.id, r]));
        const units: RetrievedUnit[] = [];
        let total = 0;
        for (const f of fused) {
            const row = rowById.get(f.unitId);
            if (!row) continue;
            const ru = this.toRetrievedUnit(row, profile, { score: Number(f.fused.toFixed(4)), rank: f.rank ?? null, method: f.method, origin: 'RETRIEVAL' });
            if (total + ru.text.length > SOURCES_TOTAL_LIMIT) {
                note.notes.push(`"${ru.unitCode}" toplam kaynak metni sınırı nedeniyle iletilmedi.`);
                continue;
            }
            total += ru.text.length;
            units.push(ru);
            if (ru.truncated) note.truncatedUnitIds.push(ru.unitId);
        }
        note.sentUnitIds = units.map((u) => u.unitId);
        note.candidates = fused.slice(0, 20).map((f) => ({
            unitId: f.unitId, unitCode: f.unitCode, title: f.title,
            lexical: Number(f.lexical.toFixed(3)), semantic: f.semantic == null ? null : Number(f.semantic.toFixed(3)),
            fused: Number(f.fused.toFixed(3)), rank: f.rank ?? null, sent: note.sentUnitIds.includes(f.unitId),
        }));
        if (units.length === 0) note.notes.push('Eşiği geçen ilişkili kaynak birimi bulunamadı.');
        return { units, note };
    }

    /** Sürüm başına chunk vektörleri; 5 dk bellek önbelleği (sürüm kimliği + chunk sayısı anahtarlı). */
    private async loadVectors(versionIds: string[]): Promise<Map<string, number[]>> {
        const key = [...versionIds].sort().join('|');
        const hit = this.vectorCache.get(key);
        if (hit && Date.now() - hit.at < 5 * 60_000) return hit.vectors;
        const chunks = await this.prisma.sourceChunk.findMany({
            where: { versionId: { in: versionIds }, unitId: { not: null } },
            select: { unitId: true, embedding: true },
        });
        const vectors = new Map<string, number[]>();
        for (const c of chunks) if (c.unitId && c.embedding.length > 0) vectors.set(c.unitId, c.embedding);
        this.vectorCache.set(key, { at: Date.now(), vectors });
        return vectors;
    }
}

// ─── Prompt metni ────────────────────────────────────────────────────────────

export function sourceTypeLabel(u: Pick<RetrievedUnit, 'sourceKind' | 'scopeStatus'>): string {
    if (u.sourceKind === 'REGULATION') {
        if (u.scopeStatus === 'IN_SCOPE') return 'BAĞLAYICI MEVZUAT';
        if (u.scopeStatus === 'OUT_OF_SCOPE') return 'MEVZUAT — KURUM KAPSAMI DIŞI (yalnız referans)';
        return 'MEVZUAT — KAPSAM DOĞRULANMADI';
    }
    if (u.sourceKind === 'OFFICIAL_GUIDE') return 'RESMÎ REHBER (kanuni zorunluluk değildir)';
    return 'KURUMSAL KAYNAK';
}

export function formatUnitsForPrompt(units: RetrievedUnit[]): string {
    return units
        .map((u) => {
            const head =
                `[${u.alias ?? `U:${u.unitId}`}] ${u.sourceName} · sürüm ${u.versionLabel} · ${sourceTypeLabel(u)} · ` +
                `${u.unitCode} · ${u.title}${u.page ? ` · sayfa ${u.page}` : ''}`;
            const trunc = u.truncated ? '\n[NOT: metin sınır nedeniyle kısaltıldı — tam metin kaynakta]' : '';
            return `${head}\n${u.text}${trunc}`;
        })
        .join('\n\n');
}
