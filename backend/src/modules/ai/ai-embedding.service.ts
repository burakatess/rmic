import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { loadAiConfig } from './ai.constants';

/**
 * Embedding çağrıları — OpenAI-uyumlu /v1/embeddings. Faz 2'de yalnızca
 * "tekrarlayan bulgu" benzerliği için. Vektörler kalıcı saklanmıyor (kontrol
 * başına geçmiş bulgu az); ihtiyaç olursa FindingEmbedding tablosu eklenebilir.
 */
@Injectable()
export class AiEmbeddingService {
    private readonly logger = new Logger('AiEmbedding');

    get enabled(): boolean {
        return loadAiConfig().enabled;
    }

    /**
     * `inputType`: asimetrik modellerde (NIM embedqa) sorgu ile pasaj AYRI olmalıdır.
     * Uzun listeler sağlayıcı sınırına takılmasın diye BATCH_SIZE'lık parçalara bölünür.
     */
    async embed(texts: string[], inputType: 'query' | 'passage' = 'passage'): Promise<number[][]> {
        const cfg = loadAiConfig();
        if (!cfg.enabled) throw new ServiceUnavailableException('Yapay zeka modülü devre dışı');
        if (texts.length === 0) return [];

        const out: number[][] = [];
        for (let i = 0; i < texts.length; i += AiEmbeddingService.BATCH_SIZE) {
            out.push(...(await this.embedBatch(texts.slice(i, i + AiEmbeddingService.BATCH_SIZE), inputType)));
        }
        return out;
    }

    /** Tek bir sorgu metni için (retrieval). */
    async embedQuery(text: string): Promise<number[]> {
        const [v] = await this.embed([text], 'query');
        return v ?? [];
    }

    static readonly BATCH_SIZE = 32;

    /** Yapılandırılmış embedding modelinin adı (chunk kaydında saklanır). */
    get modelName(): string {
        return loadAiConfig().embedModel;
    }

    private async embedBatch(texts: string[], inputType: 'query' | 'passage'): Promise<number[][]> {
        const cfg = loadAiConfig();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
        try {
            const res = await fetch(`${cfg.baseUrl}/embeddings`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${cfg.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: cfg.embedModel,
                    input: texts,
                    // NVIDIA NIM embedqa modelleri input_type ister (query|passage)
                    input_type: inputType,
                    encoding_format: 'float',
                }),
                signal: ctrl.signal,
            });
            if (!res.ok) {
                const t = await res.text().catch(() => '');
                this.logger.warn(`Embedding HTTP ${res.status}: ${t.slice(0, 200)}`);
                throw new ServiceUnavailableException(`Embedding modeli hata verdi (HTTP ${res.status})`);
            }
            const data = await res.json();
            return ((data.data as { embedding: number[] }[]) || []).map((d) => d.embedding);
        } catch (e) {
            const err = e as Error;
            if (err?.name === 'AbortError') throw new ServiceUnavailableException('Embedding zaman aşımı');
            throw e;
        } finally {
            clearTimeout(timer);
        }
    }

    static cosine(a: number[], b: number[]): number {
        let dot = 0;
        let na = 0;
        let nb = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        const denom = Math.sqrt(na) * Math.sqrt(nb);
        return denom === 0 ? 0 : dot / denom;
    }

    /**
     * queryText'e en benzer maddeleri döndürür. Embedding çağrısı başarısız olursa
     * boş dizi döner (özellik bozulmadan devam eder — benzerlik olmadan).
     */
    async rankBySimilarity<T>(
        queryText: string,
        items: { text: string; item: T }[],
        topK = 5,
    ): Promise<{ item: T; similarity: number }[]> {
        if (items.length === 0) return [];
        try {
            const vectors = await this.embed([queryText, ...items.map((i) => i.text)]);
            const [q, ...rest] = vectors;
            return items
                .map((it, idx) => ({ item: it.item, similarity: AiEmbeddingService.cosine(q, rest[idx]) }))
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, topK);
        } catch (e) {
            this.logger.warn(`Benzerlik hesaplanamadı, atlanıyor: ${(e as Error).message}`);
            return [];
        }
    }
}
