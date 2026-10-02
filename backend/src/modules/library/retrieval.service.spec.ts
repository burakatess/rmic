import { BadRequestException } from '@nestjs/common';
import { RetrievalService } from './retrieval.service';

function make(opts: { approval?: string; rag?: string; embedFails?: boolean; units?: number } = {}) {
    const chunks: any[] = [];
    const units = Array.from({ length: opts.units ?? 3 }, (_, i) => ({
        id: `u${i + 1}`, stableKey: `k${i + 1}`, unitCode: `BIGR-1.1.${i + 1}`, title: `Başlık ${i + 1}`,
        originalText: `Metin ${i + 1}`, metadata: i === 0 ? { denetimSorusu: 'Şifreleme uygulanıyor mu?' } : null,
    }));
    const version = {
        id: 'v1', approvalStatus: opts.approval ?? 'APPROVED', indexAttempts: 0, fullText: null, units,
        source: { rightRag: opts.rag ?? 'ALLOWED', rightsVerifiedAt: new Date() },
    };
    const tx = {
        sourceChunk: {
            deleteMany: jest.fn(async () => { chunks.length = 0; }),
            createMany: jest.fn(async ({ data }: any) => { chunks.push(...data); }),
        },
    };
    const prisma: any = {
        sourceVersion: { findUnique: jest.fn(async () => version), update: jest.fn(async () => ({})) },
        sourceIndexJob: { create: jest.fn(async () => ({ id: 'j1' })), update: jest.fn(async () => ({})) },
        auditLog: { create: jest.fn(async () => ({})) },
        $transaction: jest.fn(async (fn: any, options: any) => fn(tx, options)),
    };
    const embeddings: any = {
        enabled: true, modelName: 'test-embed-model',
        embed: jest.fn(async (texts: string[]) => {
            if (opts.embedFails) throw new Error('sağlayıcı hatası');
            return texts.map((_, i) => [i + 1, 0, 0]);
        }),
    };
    return { svc: new RetrievalService(prisma, embeddings), prisma, embeddings, tx, chunks };
}

describe('RetrievalService.buildIndex — idempotent chunk/embedding üretimi', () => {
    it('iki kez çalıştırıldığında mükerrer chunk oluşmaz (eski chunk silinir, aynı sayı yazılır)', async () => {
        const { svc, tx, chunks } = make();
        const r1 = await svc.buildIndex('v1', 'admin');
        expect(chunks).toHaveLength(3);
        const r2 = await svc.buildIndex('v1', 'admin');
        expect(r1.chunks).toBe(3);
        expect(r2.chunks).toBe(3);
        expect(chunks).toHaveLength(3); // ikinci çalışmada birikmedi
        expect(tx.sourceChunk.deleteMany).toHaveBeenCalledTimes(2);
        expect(new Set(chunks.map((c) => c.ordinal)).size).toBe(3);
    });

    it('gerçek embedding model adı saklanır (önceden literal "configured")', async () => {
        const { svc, chunks } = make();
        await svc.buildIndex('v1', 'admin');
        expect(chunks.every((c) => c.embedModel === 'test-embed-model')).toBe(true);
    });

    it('denetim sorusu chunk metnine katılır ve pasaj olarak gömülür', async () => {
        const { svc, embeddings, chunks } = make();
        await svc.buildIndex('v1', 'admin');
        expect(chunks[0].text).toContain('Denetim sorusu: Şifreleme uygulanıyor mu?');
        expect(embeddings.embed).toHaveBeenCalledWith(expect.any(Array), 'passage');
    });

    it('büyük sürüm için transaction zaman aşımı yükseltilir', async () => {
        const { svc, prisma } = make();
        await svc.buildIndex('v1', 'admin');
        expect(prisma.$transaction.mock.calls[0][1]).toMatchObject({ timeout: 120_000 });
    });

    it('embedding hatasında eski chunk\'lar SİLİNMEZ ve iş ERROR olarak işaretlenir', async () => {
        const { svc, tx, prisma } = make({ embedFails: true });
        await expect(svc.buildIndex('v1', 'admin')).rejects.toBeInstanceOf(BadRequestException);
        expect(tx.sourceChunk.deleteMany).not.toHaveBeenCalled();
        expect(prisma.sourceIndexJob.update.mock.calls.pop()[0].data.status).toBe('ERROR');
    });

    it('onaysız sürüm veya RAG hakkı doğrulanmamış kaynak indekslenmez', async () => {
        await expect(make({ approval: 'DRAFT' }).svc.buildIndex('v1', 'a')).rejects.toThrow(/APPROVED/);
        await expect(make({ rag: 'UNKNOWN' }).svc.buildIndex('v1', 'a')).rejects.toThrow(/RAG kullanım hakkı/);
    });
});
