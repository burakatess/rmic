import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, createTestUser, createTestDirectorate, E2E_TEST_PASSWORD } from './helpers/fixtures';
import { METHODOLOGY_V1 } from '../src/modules/risk-simulation/calculation-engine';

/**
 * Risk simülasyonu çalışma alanı: kapsamdaki riskler + Kontrol Alanı kontrolleri tek
 * simülasyonda; mevcut metodoloji; gerçek envanter değişmez.
 */
describe('E2E — Risk simülasyonu çalışma alanı', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    const ids: Record<string, string> = {};
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });

    beforeAll(async () => {
        process.env.RECORD_SCOPE_ENFORCEMENT = 'true';
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const admin = await prisma.role.create({ data: { name: 'SYSTEM_ADMIN', permissions: ['*'] } });
        const analyst = await prisma.role.create({ data: { name: 'RISK_ANALYST', permissions: ['risk:sim:view', 'risk:sim:create', 'risk:sim:edit'] } });
        const dirA = await createTestDirectorate(prisma, 'Sim Birim A');
        const dirB = await createTestDirectorate(prisma, 'Sim Birim B');
        for (const [key, roleId] of [['admin', admin.id], ['analyst', analyst.id]] as const) {
            const u = await createTestUser(prisma, roleId, { email: `simws-${key}@e2e.local` });
            ids[key] = u.id;
            tok[key] = (await http().post('/auth/login').send({ email: `simws-${key}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        }
        await prisma.directorateMembership.create({ data: { userId: ids.analyst, directorateId: dirA.id } });
        await prisma.simulationMethodology.create({ data: { version: 1, config: METHODOLOGY_V1 as any, isActive: true, createdById: ids.admin } });

        const cat = await prisma.riskCategory.create({ data: { name: 'Sim Kategori' } });
        const mkRisk = (riskId: string, directorateId: string, extra: object) => prisma.risk.create({
            data: {
                riskId, name: `${riskId} riski`, description: 'd', ownerId: ids.admin, categoryId: cat.id, directorateId,
                surec: 'SOC Yönetimi', olasilik: 4, finansalEtki: 4, itibarEtkisi: 4, regulasyonEtkisi: 4, musteriEtkisi: 4, ...extra,
            },
        });
        const rA = await mkRisk('RE-1', dirA.id, { dogalRiskPuani: 16, kalintiRiskPuani: 16 });
        const rB = await mkRisk('RE-2', dirB.id, { dogalRiskPuani: 99 });
        ids.rA = rA.id; ids.rB = rB.id;
        const rc = (kontrolId: string, status: 'AKTIF' | 'PASIF') => prisma.riskControl.create({
            data: {
                kontrolId, status, kontrolTanimi: `${kontrolId} tanımı`, kontrolTuru: 'Otomatik', kontrolIslevi: 'Önleyici',
                kontrolIsletimeSekli: 'İşlem elektronik imza ile gerçekleştirilmektedir.',
                kontrolIsletimDenetimi: 'Her ikisi de yapılmaktadır.', kontrolIsletimRaporlama: 'Bulunmamaktadır.',
            },
        });
        const k1 = await rc('KE-1', 'AKTIF');
        const k2 = await rc('KE-2', 'PASIF');
        await prisma.riskControlRisk.createMany({ data: [{ riskId: rA.id, riskControlId: k1.id }, { riskId: rA.id, riskControlId: k2.id }] });
    });

    afterAll(async () => {
        delete process.env.RECORD_SCOPE_ENFORCEMENT;
        await app.close();
    });

    it('çalışma alanı kayıt kapsamındaki risklerle oluşur', async () => {
        const mine = await http().post('/risk-simulations/workspaces').set(as('analyst')).send({ name: 'Analist çalışması' }).expect(201);
        expect(mine.body).toMatchObject({ mode: 'WORKSPACE', riskCount: 1, unmatched: [] });
        const all = await http().post('/risk-simulations/workspaces').set(as('admin')).send({ name: 'Tüm kütük' }).expect(201);
        expect(all.body.riskCount).toBe(2);
        ids.ws = all.body.id;
    });

    it('satırlar mevcut metodolojiyle hesaplanır; KTS boşken kalıntı bilinmiyor; kayıttan sapma işaretlenir', async () => {
        const res = await http().get(`/risk-simulations/workspaces/${ids.ws}`).set(as('admin')).expect(200);
        const [a, b] = res.body.rows;
        expect(a).toMatchObject({ riskId: 'RE-1', surec: 'SOC Yönetimi', controls: { active: 1, total: 2 }, changed: false });
        expect(a.natural).toMatchObject({ probability: 4, impact: 4, puan: 16, level: 'Yüksek' });
        expect(a.bkp).toMatchObject({ value: null, unknownKts: true });
        expect(a.residual).toBeNull();
        expect(a.deviation).toEqual({ natural: false, residual: false });
        expect(b).toMatchObject({ riskId: 'RE-2', deviation: { natural: true, residual: false } });
        expect(res.body.summary).toMatchObject({ riskCount: 2, activeControls: 1, deviationCount: 1, changedCount: 0, unknownResidual: 1 });
        // Kontrol Alanı metinleri P1–P5'e eşlendi; PASIF kontrol onaysız ve ağırlıksız başlar.
        const sc = await prisma.riskSimulationControl.findMany({ where: { scenario: { simulationId: ids.ws } }, orderBy: { name: 'asc' } });
        expect(sc.map(c => [c.name, c.p1, c.p2, c.p3, c.p4, c.p5, c.isApproved, c.weight])).toEqual([
            ['KE-1', 'OTOMATIK', 'ONLEYICI', 'ELEKTRONIK_IMZA', 'HER_IKISI', 'YOK', true, 1],
            ['KE-2', 'OTOMATIK', 'ONLEYICI', 'ELEKTRONIK_IMZA', 'HER_IKISI', 'YOK', false, 0],
        ]);
        ids.scenarioA = a.scenarioId; ids.ke1 = sc[0].id;
    });

    it('KTS girilince kalıntı hesaplanır ve satır "değişti" sayılır; envanter değişmez', async () => {
        const before = await prisma.risk.findUniqueOrThrow({ where: { id: ids.rA } });
        await http().patch(`/risk-simulations/scenarios/${ids.scenarioA}/controls/${ids.ke1}`).set(as('admin')).send({ ktsManualValue: 90 }).expect(200);
        const res = await http().get(`/risk-simulations/workspaces/${ids.ws}`).set(as('admin')).expect(200);
        const a = res.body.rows[0];
        expect(a.changed).toBe(true);
        expect(a.bkp.value).toBeGreaterThan(80);
        expect(a.residual).toMatchObject({ probability: 1, impact: 1, risk: 1, level: 'Çok Düşük' });
        expect(res.body.summary.changedCount).toBe(1);
        const after = await prisma.risk.findUniqueOrThrow({ where: { id: ids.rA } });
        expect(after.version).toBe(before.version);
        expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    });

    it('senaryo türü simülasyon çalışma alanı olarak açılamaz', async () => {
        const sim = await http().post('/risk-simulations').set(as('admin')).send({ name: 'Klasik' }).expect(201);
        await http().get(`/risk-simulations/workspaces/${sim.body.id}`).set(as('admin')).expect(400);
    });

    describe('Excel tabloları', () => {
        const riskRow = (riskId: string, extra: object = {}) => ({
            riskId, kayitId: '313673', status: 'Onaylı', surec: 'SOC', tanim: `${riskId} tanımı`,
            finansalEtki: 4, itibarEtkisi: 4, regulasyonEtkisi: 4, musteriEtkisi: 4, olasilik: 4,
            dogalRiskPuani: 16, kalintiRiskPuani: 4, ...extra,
        });
        const ctrl = (kontrolId: string, riskId: string, extra: object = {}) => ({
            kontrolId, riskId, tanim: `${kontrolId} tanımı`, kontrolTuru: 'Otomatik', kontrolIslevi: 'Önleyici',
            isletimSekli: 'Elektronik imza ile gerçekleştiriliyor', isletimDenetimi: 'Her ikisi de yapılmaktadır.',
            isletimRaporlama: 'Bulunmamaktadır.', ...extra,
        });
        const body = (dryRun: boolean) => ({
            name: 'Excel kütüğü', dryRun, sourceFileName: 'risk.xlsx',
            risks: [
                riskRow('RE-1', { rowNumber: 2 }),
                riskRow('X-9', { rowNumber: 3, flagForIT: true, gizlilikEtkisi: 5, butunlukEtkisi: null, erisilebilirlikEtkisi: 3 }),
                riskRow('X-9', { rowNumber: 4 }),
                riskRow('X-10', { rowNumber: 5, olasilik: null }),
                riskRow('X-11', { rowNumber: 6, status: 'İptal' }),
            ],
            controls: [
                ctrl('KE-1', 'RE-1', { rowNumber: 2, kts: 80, agirlik: 60 }),
                ctrl('KX-2', 'RE-1', { rowNumber: 3, kts: 50, agirlik: 40, etkiAlani: 'Yalnız olasılık', isletimRaporlama: 'garip metin' }),
                ctrl('KX-3', 'RE-1', { rowNumber: 4, status: 'İptal' }),
                ctrl('KX-4', 'YOK-1', { rowNumber: 5 }),
                ctrl('KX-5', 'X-9', { rowNumber: 6 }),
            ],
        });

        it('kontrol raporu (dryRun) hiçbir şey yazmaz; hatalı satırları ve uyarıları listeler', async () => {
            const before = await prisma.riskSimulation.count();
            const res = await http().post('/risk-simulations/workspaces/import').set(as('admin')).send(body(true)).expect(201);
            expect(await prisma.riskSimulation.count()).toBe(before);
            const r = res.body.report;
            expect(r.risks).toEqual({ total: 5, accepted: 2, skipped: 2, cancelled: 1 });
            expect(r.controls).toMatchObject({ total: 5, accepted: 4, skipped: 1, approved: 3, withKts: 2, unmatchedTexts: 1 });
            const msgs = r.issues.map((i: any) => `${i.sheet}:${i.row}:${i.level}`);
            expect(msgs).toEqual(expect.arrayContaining(['Risk:4:error', 'Risk:5:error', 'Risk:6:warning', 'Risk:3:warning', 'Kontrol:5:error', 'Kontrol:3:warning']));
        });

        it('içe aktarım yeni çalışma alanı oluşturur; platform riski Risk ID ile bağlanır; envanter değişmez', async () => {
            const before = await prisma.risk.findUniqueOrThrow({ where: { id: ids.rA } });
            const res = await http().post('/risk-simulations/workspaces/import').set(as('admin')).send(body(false)).expect(201);
            expect(res.body).toMatchObject({ dryRun: false, linkedRisks: 1 });
            ids.xws = res.body.simulation.id;
            const ws = await http().get(`/risk-simulations/workspaces/${ids.xws}`).set(as('admin')).expect(200);
            expect(ws.body.source).toBe('EXCEL');
            const re1 = ws.body.rows.find((x: any) => x.riskId === 'RE-1');
            // KEP: KE-1 (6/7,5→80)×0,4+80×0,6=80; KX-2 (6/7,5→80)×0,4+50×0,6=62 → BKP 80×0,6+62×0,4=72,8
            expect(re1.bkp.value).toBeCloseTo(72.8, 5);
            expect(re1.controls).toEqual({ active: 2, total: 3 });
            expect(re1.deviation).toEqual({ natural: false, residual: true });
            const sc = await prisma.riskSimulationScenario.findFirstOrThrow({ where: { simulationId: ids.xws, name: 'RE-1' } });
            expect(sc).toMatchObject({ sourceType: 'EXISTING_RISK', sourceRiskId: ids.rA });
            const x9 = await prisma.riskSimulationScenario.findFirstOrThrow({ where: { simulationId: ids.xws, name: 'X-9' }, include: { controls: true } });
            expect(x9).toMatchObject({ sourceType: 'HYPOTHETICAL', sourceRiskId: null, finalImpactChoice: 'INFOSEC', butunlukEtkisi: null });
            expect(x9.controls[0]).toMatchObject({ weight: 1, ktsManualValue: null, isApproved: true });
            const after = await prisma.risk.findUniqueOrThrow({ where: { id: ids.rA } });
            expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
            const log = await prisma.auditLog.findFirst({ where: { action: 'IMPORT', entityId: ids.xws } });
            expect(log).not.toBeNull();
        });

        it('tablolar GRC kolonlarıyla döner ve dışa aktarılan değerler tekrar içe aktarılınca aynı sonucu verir', async () => {
            const t = await http().get(`/risk-simulations/workspaces/${ids.xws}/tables`).set(as('admin')).expect(200);
            const r = t.body.risks.find((x: any) => x.riskId === 'RE-1');
            expect(r).toMatchObject({ kayitId: '313673', etki: 4, olasilik: 4, dogalRiskPuani: 16, dogalRiskSkoru: 4, dogalRiskSeviyesi: 'Yüksek', bkpSeviyesi: 'Güçlü' });
            const c = t.body.controls.filter((x: any) => x.riskId === 'RE-1');
            expect(c.map((x: any) => [x.kontrolId, x.onayli, x.kts, x.agirlik, x.etkiAlani, x.isletimRaporlama])).toEqual([
                ['KE-1', true, 80, 60, 'Olasılık ve etki', 'Bulunmamaktadır.'],
                ['KX-2', true, 50, 40, 'Yalnız olasılık', 'Bulunmamaktadır.'],
                ['KX-3', false, null, 0, 'Olasılık ve etki', 'Bulunmamaktadır.'],
            ]);
            expect(c[0]).toMatchObject({ kontrolPuani: 6, kontrolSkoru: 80, kontrolTuru: 'Otomatik', isletimSekli: 'Elektronik imza ile gerçekleştiriliyor' });

            // Gidiş-dönüş: tablolardaki girdi kolonları yeniden içe aktarılır.
            const pick = (o: any, keys: string[]) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
            const riskKeys = ['riskId', 'kayitId', 'status', 'surec', 'tanim', 'flagForIT', 'finansalEtki', 'itibarEtkisi', 'regulasyonEtkisi', 'musteriEtkisi', 'gizlilikEtkisi', 'butunlukEtkisi', 'erisilebilirlikEtkisi', 'olasilik'];
            const ctrlKeys = ['kontrolId', 'riskId', 'tanim', 'kontrolTuru', 'kontrolIslevi', 'isletimSekli', 'isletimDenetimi', 'isletimRaporlama', 'onayli', 'kts', 'agirlik', 'etkiAlani'];
            const again = await http().post('/risk-simulations/workspaces/import').set(as('admin')).send({
                name: 'Gidiş-dönüş', risks: t.body.risks.map((x: any) => pick(x, riskKeys)), controls: t.body.controls.map((x: any) => pick(x, ctrlKeys)),
            }).expect(201);
            expect(again.body.report.warningCount).toBe(1); // X-9'un boş BT etki boyutu
            const t2 = await http().get(`/risk-simulations/workspaces/${again.body.simulation.id}/tables`).set(as('admin')).expect(200);
            const strip = (rows: any[]) => rows.map(({ scenarioId, controlId, record, kayitId, status, olusturmaTarihi, guncelleme, mutabakatTarihi, ...rest }: any) => rest);
            expect(strip(t2.body.controls)).toEqual(strip(t.body.controls));
            expect(t2.body.risks.map((x: any) => [x.riskId, x.dogalRiskPuani, x.bkpPuani, x.kalintiRiskPuani]))
                .toEqual(t.body.risks.map((x: any) => [x.riskId, x.dogalRiskPuani, x.bkpPuani, x.kalintiRiskPuani]));
        });

        it('geçersiz satırlar DTO ile reddedilir', async () => {
            await http().post('/risk-simulations/workspaces/import').set(as('admin'))
                .send({ name: 'x', risks: [riskRow('A', { olasilik: 7 })], controls: [] }).expect(400);
            await http().post('/risk-simulations/workspaces/import').set(as('admin'))
                .send({ name: 'x', risks: [riskRow('A', { bilinmeyen: 1 })], controls: [] }).expect(400);
            await http().post('/risk-simulations/workspaces/import').set(as('admin'))
                .send({ name: 'x', risks: [], controls: [ctrl('K', 'A', { kts: 120 })] }).expect(400);
        });
    });

    describe('Simülasyon testi', () => {
        const base = () => `/risk-simulations/workspaces/${ids.xws}/tests`;
        const scen = async (name: string) => prisma.riskSimulationScenario.findFirstOrThrow({ where: { simulationId: ids.xws, name }, include: { controls: { orderBy: { sortOrder: 'asc' } } } });

        it('başlatılır; aynı anda ikinci test açılamaz', async () => {
            const t = await http().post(base()).set(as('admin')).send({ name: 'KTS denemesi' }).expect(201);
            ids.test = t.body.id;
            await http().post(base()).set(as('admin')).send({ name: 'ikinci' }).expect(409);
            const ws = await http().get(`/risk-simulations/workspaces/${ids.xws}`).set(as('admin')).expect(200);
            expect(ws.body.activeTest).toMatchObject({ id: ids.test, name: 'KTS denemesi' });
            expect(ws.body.riskLevels).toHaveLength(5);
            const empty = await http().get(`${base()}/${ids.test}/report`).set(as('admin')).expect(200);
            expect(empty.body.summary.changedRisks).toBe(0);
        });

        it('rapor değişiklikleri, sonuç etkisini ve günlüğü gösterir', async () => {
            const re1 = await scen('RE-1');
            const [ke1, kx2] = re1.controls;
            await http().patch(`/risk-simulations/scenarios/${re1.id}/controls/${ke1.id}`).set(as('admin')).send({ ktsManualValue: 100 }).expect(200);
            await http().delete(`/risk-simulations/scenarios/${re1.id}/controls/${kx2.id}`).set(as('admin')).expect(200);
            await http().post(`/risk-simulations/scenarios/${re1.id}/controls`).set(as('admin')).send({
                name: 'YENİ-1', p1: 'OTOMATIK', p2: 'ONLEYICI', p3: 'ELEKTRONIK_IMZA', p4: 'HER_IKISI', p5: 'FARKLI_BIRIM_GOZETIM', ktsMode: 'MANUAL', ktsManualValue: 100, weight: 0.4, impactArea: 'BOTH',
            }).expect(201);
            const fresh = await scen('RE-1');
            await http().patch(`/risk-simulations/scenarios/${re1.id}`).set(as('admin')).send({ naturalProbability: 5, expectedContentVersion: fresh.contentVersion }).expect(200);

            const r = await http().get(`${base()}/${ids.test}/report`).set(as('admin')).expect(200);
            expect(r.body.summary).toMatchObject({ changedRisks: 1, ctrlsAdded: 1, ctrlsDeleted: 1, ctrlsChanged: 1, risksAdded: 0, risksDeleted: 0 });
            const row = r.body.risks[0];
            expect(row).toMatchObject({ riskId: 'RE-1', status: 'changed' });
            expect(row.changes).toEqual([{ field: 'naturalProbability', label: 'Olasılık', before: '4', after: '5' }]);
            expect(row.controls.map((c: any) => [c.name, c.status])).toEqual(expect.arrayContaining([['KE-1', 'changed'], ['KX-2', 'deleted'], ['YENİ-1', 'added']]));
            const ke1Diff = row.controls.find((c: any) => c.name === 'KE-1');
            expect(ke1Diff.changes).toEqual([{ field: 'ktsManualValue', label: 'KTS', before: '80', after: '100' }]);
            expect(ke1Diff.kepAfter).toBeGreaterThan(ke1Diff.kepBefore);
            expect(row.before.natural.puan).toBe(16);
            expect(row.after.natural.puan).toBe(20);
            expect(r.body.log.entries.map((e: any) => [e.recordType, e.recordId, e.action, e.field])).toEqual([
                ['Kontrol', 'KE-1', 'Değişti', 'KTS'],
                ['Kontrol', 'KX-2', 'Silindi', null],
                ['Kontrol', 'YENİ-1', 'Eklendi', null],
                ['Risk', 'RE-1', 'Değişti', 'Olasılık'],
            ]);
        });

        it('başlangıca dön: silinen kontrol aynı kimlikle geri gelir, eklenen kaldırılır; envanter değişmez', async () => {
            const before = await prisma.risk.findUniqueOrThrow({ where: { id: ids.rA } });
            await http().post(`${base()}/${ids.test}/reset`).set(as('admin')).expect(201);
            const re1 = await scen('RE-1');
            expect(re1.naturalProbability).toBe(4);
            expect(re1.controls.map(c => [c.name, c.ktsManualValue])).toEqual([['KE-1', 80], ['KX-2', 50], ['KX-3', null]]);
            const r = await http().get(`${base()}/${ids.test}/report`).set(as('admin')).expect(200);
            expect(r.body.summary.changedRisks).toBe(0);
            expect(r.body.log.entries.at(-1).action).toBe('Başlangıca dönüldü');
            const after = await prisma.risk.findUniqueOrThrow({ where: { id: ids.rA } });
            expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
        });

        it('bitirilen testin raporu dondurulur; yeni test başlatılabilir; yetkisiz rol test başlatamaz', async () => {
            const re1 = await scen('RE-1');
            await http().patch(`/risk-simulations/scenarios/${re1.id}/controls/${re1.controls[0].id}`).set(as('admin')).send({ ktsManualValue: 10 }).expect(200);
            await http().post(`${base()}/${ids.test}/finish`).set(as('admin')).expect(201);
            await http().patch(`/risk-simulations/scenarios/${re1.id}/controls/${re1.controls[0].id}`).set(as('admin')).send({ ktsManualValue: 99 }).expect(200);
            const r = await http().get(`${base()}/${ids.test}/report`).set(as('admin')).expect(200);
            expect(r.body.test.status).toBe('FINISHED');
            expect(r.body.risks[0].controls[0].changes[0]).toMatchObject({ before: '80', after: '10' });
            // Günlük testin tamamını kapsar; bitişten sonraki değişiklik (99) görünmez.
            expect(r.body.log.entries).toHaveLength(6);
            expect(r.body.log.entries.at(-1)).toMatchObject({ field: 'KTS', before: '80', after: '10' });
            await http().post(`${base()}/${ids.test}/reset`).set(as('admin')).expect(400);
            const second = await http().post(base()).set(as('admin')).send({ name: 'İkinci tur' }).expect(201);
            // Test içinde eklenip silinen kontrol hiçbir anlık görüntüde yoktur; günlükte yine görünür.
            const tmp = await http().post(`/risk-simulations/scenarios/${re1.id}/controls`).set(as('admin')).send({
                name: 'GEÇİCİ', p1: 'MANUEL', p2: 'TESPIT_EDICI', p3: 'IZ_KAYDI_YOK', p4: 'YOK', p5: 'YOK', ktsMode: 'MANUAL', weight: 0, impactArea: 'BOTH',
            }).expect(201);
            await http().delete(`/risk-simulations/scenarios/${re1.id}/controls/${tmp.body.id}`).set(as('admin')).expect(200);
            const r2 = await http().get(`${base()}/${second.body.id}/report`).set(as('admin')).expect(200);
            expect(r2.body.log.entries.map((e: any) => [e.recordId, e.action])).toEqual([['GEÇİCİ', 'Eklendi'], ['GEÇİCİ', 'Silindi']]);
            expect(r2.body.summary.changedRisks).toBe(0);
            const list = await http().get(base()).set(as('admin')).expect(200);
            expect(list.body.map((t: any) => t.status)).toEqual(['ACTIVE', 'FINISHED']);

            // Risk Yönetimi modülünü (risk:view) gören herkes simülasyonu kullanır; risk izni olmayan erişemez.
            const login = async (name: string, permissions: string[]) => {
                const role = await prisma.role.create({ data: { name, permissions } });
                await createTestUser(prisma, role.id, { email: `simws-${name.toLowerCase()}@e2e.local` });
                return (await http().post('/auth/login').send({ email: `simws-${name.toLowerCase()}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken as string;
            };
            const riskViewer = { Authorization: `Bearer ${await login('RISK_VIEWER', ['risk:view', 'scope:org:risk'])}` };
            const outsider = { Authorization: `Bearer ${await login('NO_RISK', ['finding:view'])}` };
            await http().get(base()).set(riskViewer).expect(200);
            await http().get('/risk-simulations').set(riskViewer).expect(200);
            await http().post('/risk-simulations/workspaces/live').set(riskViewer).send({}).expect(201);
            await http().get(base()).set(outsider).expect(403);
            await http().post('/risk-simulations/workspaces/live').set(outsider).send({}).expect(403);
            // Envantere aktarma kısıtlı kalır.
            await http().post(`/risk-simulations/scenarios/${re1.id}/transfer/preview`).set(riskViewer).expect(403);
        });
    });

    describe('Güncel simülatör, kayıt ve toplu silme', () => {
        const live = (who = 'admin', body: object = {}) => http().post('/risk-simulations/workspaces/live').set(as(who)).send(body);

        it('güncel simülatör taslak olarak kurulur, listede görünmez; değişiklik yoksa her açılışta yeniden kurulur', async () => {
            const a = await live().expect(201);
            expect(a.body).toMatchObject({ rebuilt: true, hasUnsavedChanges: false });
            const list = await http().get('/risk-simulations').set(as('admin')).expect(200);
            expect(list.body.some((x: any) => x.id === a.body.id)).toBe(false);
            const ws = await http().get(`/risk-simulations/workspaces/${a.body.id}`).set(as('admin')).expect(200);
            expect(ws.body.simulation.isDraft).toBe(true);
            const b = await live().expect(201);
            expect(b.body.rebuilt).toBe(true);
            expect(b.body.id).not.toBe(a.body.id);
            expect(await prisma.riskSimulation.findUnique({ where: { id: a.body.id } })).toBeNull();
            ids.draft = b.body.id;
        });

        it('kaydedilmemiş değişiklik varsa taslak korunur; refresh ile atılır', async () => {
            const sc = await prisma.riskSimulationScenario.findFirstOrThrow({ where: { simulationId: ids.draft, name: 'RE-1' }, include: { controls: true } });
            const ke1 = sc.controls.find(c => c.name === 'KE-1')!;
            await http().patch(`/risk-simulations/scenarios/${sc.id}/controls/${ke1.id}`).set(as('admin')).send({ ktsManualValue: 70 }).expect(200);
            const kept = await live().expect(201);
            expect(kept.body).toMatchObject({ id: ids.draft, rebuilt: false, hasUnsavedChanges: true });
            const fresh = await live('admin', { refresh: true }).expect(201);
            expect(fresh.body.rebuilt).toBe(true);
            ids.draft = fresh.body.id;
        });

        it('simülasyon başlatılıp kaydedilir: test bitirilir, kayıt listeye girer, yeni açılış yeni taslak kurar', async () => {
            const t = await http().post(`/risk-simulations/workspaces/${ids.draft}/tests`).set(as('admin')).send({ name: 'KTS 90 denemesi' }).expect(201);
            const sc = await prisma.riskSimulationScenario.findFirstOrThrow({ where: { simulationId: ids.draft, name: 'RE-1' }, include: { controls: true } });
            await http().patch(`/risk-simulations/scenarios/${sc.id}/controls/${sc.controls.find(c => c.name === 'KE-1')!.id}`).set(as('admin')).send({ ktsManualValue: 90 }).expect(200);
            // Başkasının taslağı kaydedilemez.
            await http().post(`/risk-simulations/workspaces/${ids.draft}/save`).set(as('analyst')).send({ name: 'x' }).expect(403);
            const saved = await http().post(`/risk-simulations/workspaces/${ids.draft}/save`).set(as('admin')).send({ name: 'KTS 90 senaryosu', description: 'Ana kontrol iyileşirse' }).expect(201);
            expect(saved.body).toMatchObject({ isDraft: false, draftOwnerId: null, name: 'KTS 90 senaryosu' });
            const test = await prisma.riskSimulationTest.findUniqueOrThrow({ where: { id: t.body.id } });
            expect(test.status).toBe('FINISHED');
            const report = await http().get(`/risk-simulations/workspaces/${ids.draft}/tests/${t.body.id}/report`).set(as('admin')).expect(200);
            expect(report.body.summary.changedRisks).toBe(1);
            const list = await http().get('/risk-simulations').set(as('admin')).expect(200);
            expect(list.body.find((x: any) => x.id === ids.draft)).toMatchObject({ name: 'KTS 90 senaryosu', _count: { tests: 1 } });
            await http().post(`/risk-simulations/workspaces/${ids.draft}/save`).set(as('admin')).send({ name: 'tekrar' }).expect(400);
            // Kayıtlı simülasyonda yeniden değişiklik yapılıp yeni test başlatılabilir.
            await http().post(`/risk-simulations/workspaces/${ids.draft}/tests`).set(as('admin')).send({ name: 'İkinci deneme' }).expect(201);
            const next = await live().expect(201);
            expect(next.body).toMatchObject({ rebuilt: true });
            expect(next.body.id).not.toBe(ids.draft);
            ids.saved = ids.draft; ids.draft = next.body.id;
        });

        it('toplu silme: yetkisiz rol 403; kayıtlı ve eski senaryo simülasyonları silinir; aktarım yapılmış olan atlanır', async () => {
            // Analist rolünde risk:view / risk:sim:delete yok → 403.
            await http().post('/risk-simulations/bulk-delete').set(as('analyst')).send({ ids: [ids.saved] }).expect(403);
            const old = await http().post('/risk-simulations').set(as('admin')).send({ name: 'Eski senaryo' }).expect(201);
            // Aktarım yapılmış simülasyon (denetim izi) silinmez.
            const withTransfer = ids.xws;
            const sc = await prisma.riskSimulationScenario.findFirstOrThrow({ where: { simulationId: withTransfer } });
            await prisma.riskSimulationTransfer.create({
                data: { transferId: 'TRF-E2E-1', scenarioId: sc.id, scenarioVersionAtTransfer: 1, performedById: ids.admin, resultSummary: {} },
            });
            const res = await http().post('/risk-simulations/bulk-delete').set(as('admin')).send({ ids: [ids.saved, old.body.id, withTransfer, 'yok-boyle-bir-id'] }).expect(201);
            expect(res.body.deleted).toHaveLength(2);
            expect(res.body.skipped).toEqual(expect.arrayContaining([
                expect.objectContaining({ id: 'yok-boyle-bir-id', reason: 'Bulunamadı' }),
                expect.objectContaining({ id: withTransfer, reason: expect.stringContaining('aktarım') }),
            ]));
            expect(await prisma.riskSimulation.findUnique({ where: { id: ids.saved } })).toBeNull();
            expect(await prisma.auditLog.count({ where: { action: 'DELETE', entityType: 'RiskSimulation', entityId: ids.saved } })).toBe(1);
        });
    });

    describe('Metodoloji ayarları ve envantere aktarım', () => {
        const settings = async () => (await http().get('/risk-simulations/methodologies').set(as('admin')).expect(200)).body.active.settings;
        const scenarioOf = (simId: string, name: string) => prisma.riskSimulationScenario.findFirstOrThrow({ where: { simulationId: simId, name }, include: { controls: true, methodology: true } });

        it('deneme ayarı yalnız o simülasyonu etkiler; resmî ayara dönülebilir; tutarsız ayar reddedilir', async () => {
            const base = await settings();
            expect(base).toMatchObject({ kypWeightPct: 40, riskLevelUpperBounds: [1, 4, 10, 16] });
            const before = (await http().get(`/risk-simulations/workspaces/${ids.ws}`).set(as('admin')).expect(200)).body.rows.find((r: any) => r.riskId === 'RE-1');
            const trial = await http().post(`/risk-simulations/workspaces/${ids.ws}/methodology/trial`).set(as('analyst'))
                .send({ settings: { ...base, kypWeightPct: 100 }, note: 'Yalnız P puanı' }).expect(201);
            expect(trial.body).toMatchObject({ current: { isTrial: true, basedOnVersion: 1, settings: { kypWeightPct: 100 } }, usesLatestOfficial: false });
            const after = (await http().get(`/risk-simulations/workspaces/${ids.ws}`).set(as('admin')).expect(200)).body.rows.find((r: any) => r.riskId === 'RE-1');
            expect(after.bkp.value).not.toBeCloseTo(before.bkp.value, 3);
            expect((await settings()).kypWeightPct).toBe(40); // resmî ayar değişmedi
            await http().post(`/risk-simulations/workspaces/${ids.ws}/methodology/trial`).set(as('analyst'))
                .send({ settings: { ...base, businessWeightsPct: { ...base.businessWeightsPct, financial: 10 } } }).expect(400);
            const back = await http().post(`/risk-simulations/workspaces/${ids.ws}/methodology/official`).set(as('analyst')).expect(201);
            expect(back.body).toMatchObject({ current: { isTrial: false, version: 1 }, usesLatestOfficial: true });
            expect(await prisma.simulationMethodology.count({ where: { isTrial: true, trialSimulationId: ids.ws } })).toBe(0);
        });

        it('resmî ayarı yalnız Sistem Yöneticisi yayınlar; yeni sürüm yeni simülasyonlarda kullanılır, eskiler sürümünde kalır', async () => {
            const base = await settings();
            await http().post('/risk-simulations/methodologies').set(as('analyst')).send({ settings: base, changeNote: 'x' }).expect(403);
            const pub = await http().post('/risk-simulations/methodologies').set(as('admin')).send({ settings: { ...base, rounding: 'CEIL' }, changeNote: 'Etki yukarı yuvarlansın' }).expect(201);
            expect(pub.body.version).toBe(2);
            const m = await http().get(`/risk-simulations/workspaces/${ids.ws}/methodology`).set(as('admin')).expect(200);
            expect(m.body).toMatchObject({ current: { version: 1 }, official: { version: 2 }, usesLatestOfficial: false });
            const fresh = await http().post('/risk-simulations/workspaces').set(as('admin')).send({ name: 'v2 kütük' }).expect(201);
            expect((await scenarioOf(fresh.body.id, 'RE-1')).methodology.version).toBe(2);
            ids.ws2 = fresh.body.id;
        });

        it('aktarım: taslaktan yapılamaz; talep önizlemeyle oluşur; talep eden onaylayamaz; onayla envanter ve Kontrol Alanı güncellenir', async () => {
            const draft = await http().post('/risk-simulations/workspaces/live').set(as('admin')).send({}).expect(201);
            await http().post(`/risk-simulations/workspaces/${draft.body.id}/transfer-preview`).set(as('admin')).send({}).expect(400);

            const sc = await scenarioOf(ids.ws2, 'RE-1');
            await http().patch(`/risk-simulations/scenarios/${sc.id}`).set(as('admin')).send({ naturalProbability: 5, expectedContentVersion: sc.contentVersion }).expect(200);
            await http().post(`/risk-simulations/scenarios/${sc.id}/controls`).set(as('admin')).send({
                name: 'YENİ-KONTROL', description: 'Yeni otomatik kontrol', p1: 'OTOMATIK', p2: 'ONLEYICI', p3: 'ELEKTRONIK_IMZA', p4: 'HER_IKISI', p5: 'DUZENLI_UST_AMIR',
                ktsMode: 'MANUAL', ktsManualValue: 80, weight: 0, impactArea: 'BOTH',
            }).expect(201);

            const pv = await http().post(`/risk-simulations/workspaces/${ids.ws2}/transfer-preview`).set(as('analyst')).send({}).expect(201);
            // Simülasyonda değiştirilmeyen riskler (RE-2) aktarım adayı olmaz.
            expect(pv.body.rows.map((r: any) => r.riskId)).toEqual(['RE-1']);
            const row = pv.body.rows.find((r: any) => r.riskId === 'RE-1');
            expect(row.fields.map((f: any) => f.field)).toEqual(expect.arrayContaining(['olasilik', 'dogalRiskPuani', 'dogalRiskSeviyesi']));
            expect(row.fields.find((f: any) => f.field === 'olasilik')).toMatchObject({ before: 4, after: 5 });
            expect(row.controls.map((c: any) => [c.action, c.name ?? c.kontrolId])).toEqual(expect.arrayContaining([['CREATE', 'YENİ-KONTROL']]));

            const req = await http().post(`/risk-simulations/workspaces/${ids.ws2}/transfer-requests`).set(as('analyst')).send({ scenarioIds: [row.scenarioId], note: 'Olasılık güncellemesi' }).expect(201);
            expect(req.body).toMatchObject({ status: 'PENDING' });
            await http().post(`/risk-simulations/workspaces/${ids.ws2}/transfer-requests`).set(as('analyst')).send({ scenarioIds: [row.scenarioId] }).expect(409);
            await http().post(`/risk-simulations/transfer-requests/${req.body.id}/approve`).set(as('analyst')).send({}).expect(403); // rol yok
            const del = await http().post('/risk-simulations/bulk-delete').set(as('admin')).send({ ids: [ids.ws2] }).expect(201);
            expect(del.body.skipped[0].reason).toContain('Bekleyen');

            const before = await prisma.risk.findUniqueOrThrow({ where: { id: ids.rA } });
            const ok = await http().post(`/risk-simulations/transfer-requests/${req.body.id}/approve`).set(as('admin')).send({ note: 'Uygun' }).expect(201);
            expect(ok.body).toMatchObject({ status: 'APPROVED', risksUpdated: 1, controlsCreated: 1 });
            const after = await prisma.risk.findUniqueOrThrow({ where: { id: ids.rA }, include: { riskControls: { include: { riskControl: true } } } });
            expect(after).toMatchObject({ olasilik: 5, dogalRiskPuani: 20, dogalRiskSeviyesi: 'KRİTİK', version: before.version + 1 });
            const created = after.riskControls.map(l => l.riskControl).find(c => c.kontrolTanimi === 'Yeni otomatik kontrol')!;
            expect(created).toMatchObject({ status: 'AKTIF', kontrolIslevi: 'Otomatik', kontrolTuru: 'Önleyici' });
            const simCtrl = await prisma.riskSimulationControl.findFirstOrThrow({ where: { scenarioId: sc.id, name: 'YENİ-KONTROL' } });
            expect(simCtrl.sourceRiskControlId).toBe(created.id);
            expect(await prisma.auditLog.count({ where: { action: 'SIM_TRANSFER_APPROVE', entityId: req.body.id } })).toBe(1);
            // Simülasyon artık güncel envanterle aynı: yeni önizlemede RE-1 için risk alanı farkı kalmaz.
            const pv2 = await http().post(`/risk-simulations/workspaces/${ids.ws2}/transfer-preview`).set(as('admin')).send({ scenarioIds: [row.scenarioId] }).expect(201);
            expect(pv2.body.rows[0].fields.filter((f: any) => ['olasilik', 'dogalRiskPuani'].includes(f.field))).toEqual([]);
        });

        it('envanter talepten sonra değişirse onay reddedilir; kendi talebini onaylayamaz; iptal ve ret', async () => {
            const sc = await scenarioOf(ids.ws2, 'RE-1');
            await http().patch(`/risk-simulations/scenarios/${sc.id}`).set(as('admin')).send({ naturalProbability: 3, expectedContentVersion: sc.contentVersion }).expect(200);
            const mine = await http().post(`/risk-simulations/workspaces/${ids.ws2}/transfer-requests`).set(as('admin')).send({ scenarioIds: [sc.id] }).expect(201);
            await http().post(`/risk-simulations/transfer-requests/${mine.body.id}/approve`).set(as('admin')).send({}).expect(403);
            await http().post(`/risk-simulations/transfer-requests/${mine.body.id}/cancel`).set(as('analyst')).expect(403);
            await http().post(`/risk-simulations/transfer-requests/${mine.body.id}/cancel`).set(as('admin')).expect(201);

            const req = await http().post(`/risk-simulations/workspaces/${ids.ws2}/transfer-requests`).set(as('analyst')).send({ scenarioIds: [sc.id] }).expect(201);
            await prisma.risk.update({ where: { id: ids.rA }, data: { version: { increment: 1 } } });
            const stale = await http().post(`/risk-simulations/transfer-requests/${req.body.id}/approve`).set(as('admin')).send({}).expect(409);
            expect(stale.body.message).toContain('talepten sonra');
            expect((await prisma.risk.findUniqueOrThrow({ where: { id: ids.rA } })).olasilik).toBe(5);
            await http().post(`/risk-simulations/transfer-requests/${req.body.id}/reject`).set(as('admin')).send({ note: 'Eski veri' }).expect(201);
            const list = await http().get('/risk-simulations/transfer-requests').set(as('analyst')).expect(200);
            expect(list.body.slice(0, 3).map((r: any) => r.status)).toEqual(['REJECTED', 'CANCELLED', 'APPROVED']);
        });
    });
});
