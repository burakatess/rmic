import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Sayfalı listelerin tüm sayfaları birleştirildiğinde (ön yüz `fetchAllPages`) kayıt tekrarlanmaz,
 * atlanmaz ve toplam doğrudur — özellikle eşit sıralama değerlerinde (aynı ad, aynı oluşturma anı).
 */
describe('E2E — sayfalı listeler: tam liste, kararlı sıra', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let token: string;
    const http = () => request(app.getHttpServer());

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        await createTestUser(prisma, roles.SYSTEM_ADMIN, { email: 'paging-admin@e2e.local' });
        token = (await http().post('/auth/login').send({ email: 'paging-admin@e2e.local', password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        // 1.050 kullanıcı: hepsi AYNI ad/soyad (sıralama eşitliği) — 500'lük sayfada 3 sayfa eder.
        const me = await prisma.user.findFirstOrThrow({ where: { email: 'paging-admin@e2e.local' } });
        await prisma.user.createMany({
            data: Array.from({ length: 1050 }, (_, i) => ({
                email: `paging-${i}@e2e.local`, passwordHash: me.passwordHash, firstName: 'Aynı', lastName: 'Kişi', roleId: me.roleId,
            })),
        });
        // 130 risk aksiyonu: createMany tek deyimde aynı createdAt (eşit sıralama değeri).
        await prisma.riskAction.createMany({
            data: Array.from({ length: 130 }, (_, i) => ({ aksiyonId: `RA-9999-${String(i).padStart(4, '0')}`, aksiyonTanimi: `Sayfalama aksiyonu ${i}` })),
        });
    });
    afterAll(async () => { await app.close(); });

    async function walk(path: string, limit: number): Promise<{ ids: string[]; total: number }> {
        const ids: string[] = [];
        let total = 0;
        for (let page = 1; page < 50; page++) {
            const res = (await http().get(path).query({ page: String(page), limit: String(limit) }).set({ Authorization: `Bearer ${token}` }).expect(200)).body;
            total = res.pagination?.total ?? res.total;
            ids.push(...res.data.map((r: { id: string }) => r.id));
            if (ids.length >= total || res.data.length === 0) break;
        }
        return { ids, total };
    }

    it('kullanıcı seçenekleri: 500 sınırı aşan liste tüm sayfalarla eksiksiz ve kopyasız gelir (eşit adlarda bile)', async () => {
        const { ids, total } = await walk('/admin/users/options', 500);
        expect(total).toBe(1051);
        expect(ids).toHaveLength(1051);
        expect(new Set(ids).size).toBe(1051);
    });

    it('sunucu tek sayfada tavanı (500) aşmaz: limit=100000 → 500 kayıt', async () => {
        const res = (await http().get('/admin/users/options').query({ limit: '100000' }).set({ Authorization: `Bearer ${token}` }).expect(200)).body;
        expect(res.data).toHaveLength(500);
        expect(res.pagination).toMatchObject({ total: 1051, limit: 500, totalPages: 3 });
    });

    it('risk aksiyonları: eşit oluşturma anında küçük sayfalarla gezmek kayıt tekrarlamaz/atlamaz', async () => {
        const { ids, total } = await walk('/risk-actions', 37);
        expect(total).toBe(130);
        expect(ids).toHaveLength(130);
        expect(new Set(ids).size).toBe(130);
    });
});
