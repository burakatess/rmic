import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, createTestControl, createTestControlTest, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Uçtan uca (kontrol → test → bulgu → aksiyon → takip → kapanış) kullanıcı testinde bulunan
 * hataların düzeltmeleri — gerçek veritabanına karşı:
 *  1. Kapalı / kapanış değerlendirmesindeki bulgu genel PUT ile değiştirilemez veya yeniden açılamaz.
 *  2. Bulgu kapanış onayı "Onaylarım" kutusunda, sayaçta ve bildirimlerde görünür; karar 1. kontrolcüye döner.
 *  3. Erteleme onayı aksiyon (ve bulgu) hedef tarihini yeni takip tarihine taşır; takip onayı geri alınırsa eski tarihe döner.
 *  4. Tüm aksiyonları kapanmış bulgu "Kapanışa hazır" (KAPANISA_HAZIR) olur.
 *  5. Takip gönderme / onay denetim izine ayrı olay adlarıyla yazılır.
 *  6. Mutabakat onayı çözüm durumunu değiştiremez (alan reddedilir).
 *  7. Kontrol oluşturmada ad koddan ayrıdır; direktörlük adı FK'den türetilir.
 */
describe('E2E — uçtan uca bulgu akışı düzeltmeleri', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    const id: Record<string, string> = {};
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });
    const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().split('T')[0];
    const ymd = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().split('T')[0] : null);
    const wf = (who: string, type: string, eid: string, action: string, reason?: string) =>
        http().post(`/workflow/${type}/${eid}/transition`).set(as(who)).send({ action, ...(reason ? { reason } : {}) });

    async function findingWithApprovedAction(dueInDays = 30) {
        const f = await http().post('/findings').set(as('maker')).send({
            description: 'Uçtan uca düzeltme testi için yeterince uzun bulgu metni', summary: 'Uçtan uca bulgu',
            severity: 'HIGH', firstControllerId: id.maker, secondControllerId: id.checker,
        }).expect(201);
        const a = await http().post(`/findings/${f.body.id}/actions`).set(as('maker')).send({
            description: 'Uçtan uca düzeltme testi düzeltici aksiyonu', ownerId: id.maker, dueDate: day(dueInDays),
            firstControllerId: id.maker, secondControllerId: id.checker,
        }).expect(201);
        await wf('maker', 'ACTION', a.body.id, 'COMPLETE').expect(201);
        await wf('checker', 'ACTION', a.body.id, 'APPROVE').expect(201);
        const fu = await prisma.findingFollowUp.findFirstOrThrow({ where: { actionId: a.body.id } });
        return { fId: f.body.id as string, aId: a.body.id as string, fuId: fu.id };
    }
    async function evaluateAndApprove(fuId: string, body: Record<string, unknown>) {
        await http().put(`/follow-ups/${fuId}`).set(as('maker')).send(body).expect(200);
        await http().put(`/follow-ups/${fuId}`).set(as('maker')).send({ status: 'TAMAMLANDI' }).expect(200);
        await http().put(`/follow-ups/${fuId}`).set(as('checker')).send({ status: 'ONAYLANDI' }).expect(200);
    }

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        for (const [key, role] of [['admin', 'SYSTEM_ADMIN'], ['checker', 'RISK_CONTROL_MANAGER'], ['maker', 'AUDITOR']] as const) {
            const u = await createTestUser(prisma, roles[role], { email: `e2e-fix-${key}@e2e.local`, firstName: key, lastName: 'Kişi' });
            id[key] = u.id;
            tok[key] = (await http().post('/auth/login').send({ email: `e2e-fix-${key}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        }
    });
    afterAll(async () => { await app.close(); });

    it('tam akış: erteleme hedef tarihi taşır → yeterli → Kapanışa hazır → kapanış Onaylarım/bildirimde → kapalı bulgu kilitli', async () => {
        const { fId, aId, fuId } = await findingWithApprovedAction(30);
        const due0 = ymd((await prisma.action.findUniqueOrThrow({ where: { id: aId } })).dueDate);

        // 1. takip: Yetersiz → Ertelendi (+60 gün). Onayda aksiyon ve bulgu hedef tarihi yeni tarihe taşınır.
        const postponed = day(60);
        await evaluateAndApprove(fuId, { result: 'YETERSIZ', resolutionOutcome: 'ERTELENDI', newFollowUpDate: postponed, currentStatusDetail: 'Kısmi ilerleme' });
        const action = await prisma.action.findUniqueOrThrow({ where: { id: aId } });
        expect(ymd(action.dueDate)).toBe(postponed);
        expect(ymd(action.dueDate)).not.toBe(due0);
        expect(ymd((await prisma.finding.findUniqueOrThrow({ where: { id: fId } })).targetResolutionDate)).toBe(postponed);
        const dueLog = await prisma.auditLog.findFirstOrThrow({ where: { entityId: aId, action: 'ACTION_DUE_DATE_POSTPONED' } });
        expect(ymd((dueLog.oldValue as any).dueDate)).toBe(due0);
        // Takip gönderme ve onay ayrı olay adlarıyla denetim izinde (SIEM).
        expect(await prisma.auditLog.count({ where: { entityId: fuId, action: 'FOLLOWUP_SUBMIT', userId: id.maker } })).toBe(1);
        expect(await prisma.auditLog.count({ where: { entityId: fuId, action: 'FOLLOWUP_APPROVE', userId: id.checker } })).toBe(1);

        // 2. takip: Yeterli → aksiyon kapanır; bulgu otomatik kapanmaz, "Kapanışa hazır" olur.
        const next = await prisma.findingFollowUp.findFirstOrThrow({ where: { previousFollowUpId: fuId } });
        await evaluateAndApprove(next.id, { result: 'YETERLI', currentStatusDetail: 'Tüm adımlar tamamlandı' });
        let f = await prisma.finding.findUniqueOrThrow({ where: { id: fId } });
        expect(f).toMatchObject({ status: 'PARTIALLY_CLOSED', resolutionStatus: 'KAPANISA_HAZIR' });

        // Kapanışa gönderilen bulgu 2. kontrolcünün kutusunda, sayacında ve bildirimlerinde görünür.
        await wf('maker', 'FINDING', fId, 'COMPLETE', 'İki takip sonunda aksiyon yeterli bulundu').expect(201);
        const box = (await http().get('/workflow-approvals').set(as('checker')).expect(200)).body;
        expect(box.items.find((i: any) => i.recordId === fId)).toMatchObject({ kind: 'FINDING_CLOSURE', code: f.findingId, link: `/findings/${fId}`, requestedBy: { id: id.maker } });
        expect((await http().get('/workflow-approvals/count').set(as('checker')).expect(200)).body.count).toBeGreaterThanOrEqual(1);
        const notes = (await http().get('/notifications').set(as('checker')).expect(200)).body as any[];
        expect(notes.some(n => n.title === 'Onayınızı bekleyen bulgu kapanış değerlendirmesi')).toBe(true);
        // Gönderen kendi kutusunda görmez.
        expect((await http().get('/workflow-approvals').set(as('maker')).expect(200)).body.items.some((i: any) => i.recordId === fId)).toBe(false);

        // Değerlendirmedeki bulgu genel PUT ile değiştirilemez.
        await http().put(`/findings/${fId}`).set(as('maker')).send({ summary: 'değişti' }).expect(400);

        await wf('checker', 'FINDING', fId, 'APPROVE').expect(201);
        expect((await http().get('/workflow-approvals').set(as('checker')).expect(200)).body.items.some((i: any) => i.recordId === fId)).toBe(false);
        const decisions = (await http().get('/workflow-approvals').set(as('maker')).expect(200)).body.decisions;
        expect(decisions.find((d: any) => d.recordId === fId)).toMatchObject({ kind: 'FINDING_CLOSED', link: `/findings/${fId}` });

        // Kapalı bulgu: içerik değiştirilemez, durum "Devam Ediyor"a çekilerek yeniden açılamaz; arayüz Düzenle'yi gizler.
        const r1 = await http().put(`/findings/${fId}`).set(as('maker')).send({ summary: 'KAPALI BULGU DEĞİŞTİ' }).expect(400);
        expect(r1.body.message).toContain('Kapalı bulgu düzenlenemez');
        await http().put(`/findings/${fId}`).set(as('admin')).send({ status: 'IN_PROGRESS' }).expect(400);
        f = await prisma.finding.findUniqueOrThrow({ where: { id: fId } });
        expect(f).toMatchObject({ status: 'CLOSED', resolutionStatus: 'KAPATILDI', summary: 'Uçtan uca bulgu' });
        const detail = (await http().get(`/findings/${fId}`).set(as('maker')).expect(200)).body;
        expect(detail.capabilities.canEditFinding).toBe(false);
    });

    it('erteleme onayı geri alınırsa aksiyon hedef tarihi eski değere döner; iade edilen kapanış "Kapanışa hazır"a döner', async () => {
        const { fId, aId, fuId } = await findingWithApprovedAction(20);
        const due0 = ymd((await prisma.action.findUniqueOrThrow({ where: { id: aId } })).dueDate);
        await evaluateAndApprove(fuId, { result: 'YETERSIZ', resolutionOutcome: 'ERTELENDI', newFollowUpDate: day(80), currentStatusDetail: 'Süre gerekli' });
        expect(ymd((await prisma.action.findUniqueOrThrow({ where: { id: aId } })).dueDate)).toBe(day(80));

        await http().post(`/follow-ups/${fuId}/revert`).set(as('checker')).send({ reason: 'Yanlış tarih' }).expect(201);
        expect(ymd((await prisma.action.findUniqueOrThrow({ where: { id: aId } })).dueDate)).toBe(due0);
        expect(ymd((await prisma.finding.findUniqueOrThrow({ where: { id: fId } })).targetResolutionDate)).toBe(due0);

        // Geri tarihe erteleme hedef tarihi geri çekmez (yalnız ileri taşınır).
        const fu = await prisma.findingFollowUp.findUniqueOrThrow({ where: { id: fuId } });
        expect(fu.status).toBe('DEVAM_EDIYOR');

        // Kapanış iadesi: tüm aksiyonları kapalı bulgu açık kalır ama "Kapanışa hazır" görünür.
        await evaluateAndApprove(fuId, { result: 'YETERLI', currentStatusDetail: 'Tamamlandı' });
        await wf('maker', 'FINDING', fId, 'COMPLETE', 'Kapanış önerisi').expect(201);
        await wf('checker', 'FINDING', fId, 'RETURN', 'Kanıt eksik').expect(201);
        expect(await prisma.finding.findUniqueOrThrow({ where: { id: fId } })).toMatchObject({ status: 'PARTIALLY_CLOSED', resolutionStatus: 'KAPANISA_HAZIR' });
        const decisions = (await http().get('/workflow-approvals').set(as('maker')).expect(200)).body.decisions;
        expect(decisions.find((d: any) => d.recordId === fId)).toMatchObject({ kind: 'FINDING_CLOSURE_RETURNED', reason: 'Kanıt eksik' });
    });

    it('mutabakat onayı çözüm durumu taşıyamaz (bilgi kaydı); manuel aksiyon kararı Onaylarım\'ı bozmaz', async () => {
        const { fId } = await findingWithApprovedAction(15);
        const r = await http().post(`/findings/${fId}/workflow/mutabakat-onayla`).set(as('checker')).send({ resolutionStatus: 'KAPATILDI' }).expect(400);
        expect(JSON.stringify(r.body.message)).toContain('resolutionStatus');

        // Manuel (bulgusuz) aksiyon onaylandıktan sonra 1. kontrolcünün kararlar listesi 500 vermez, kendi ekranına bağlanır.
        const m = await http().post('/actions/manual').set(as('maker')).send({
            title: 'Manuel plan', description: 'Bulgusuz manuel aksiyon planı açıklaması', ownerId: id.maker, dueDate: day(10),
            firstControllerId: id.maker, secondControllerId: id.checker,
        }).expect(201);
        await wf('maker', 'ACTION', m.body.id, 'COMPLETE').expect(201);
        await wf('checker', 'ACTION', m.body.id, 'APPROVE').expect(201);
        const decisions = (await http().get('/workflow-approvals').set(as('maker')).expect(200)).body.decisions;
        expect(decisions.find((d: any) => d.recordId === m.body.id)).toMatchObject({ kind: 'ACTION_APPROVED', finding: null, link: `/actions/${m.body.id}` });
        await http().get('/notifications').set(as('maker')).expect(200);
    });

    it('kontrol oluşturma: ad koddan ayrı kaydedilir, direktörlük adı FK\'den türetilir', async () => {
        const dir = await prisma.directorate.create({ data: { name: 'E2E Bilgi Güvenliği', code: 'E2EBG' } });
        const c = (await http().post('/controls').set(as('admin')).send({
            controlId: 'BTK.9901', name: 'Ayrıcalıklı Hesap Gözden Geçirmesi', description: 'Tanım', frequency: 'QUARTERLY', directorateId: dir.id,
        }).expect(201)).body;
        expect(c).toMatchObject({ controlId: 'BTK.9901', name: 'Ayrıcalıklı Hesap Gözden Geçirmesi', directorate: 'E2E Bilgi Güvenliği' });
    });
    it('yeni aksiyon gerekli: eski aksiyon kapanır, yeni aksiyon kapanınca bulgu kapanışa hazır olur; geri alma eski aksiyonu açar', async () => {
        const { fId, aId, fuId } = await findingWithApprovedAction(20);
        const dir = await prisma.directorate.upsert({ where: { name: 'E2E Yeni Aksiyon Birimi' }, update: {}, create: { name: 'E2E Yeni Aksiyon Birimi' } });
        await evaluateAndApprove(fuId, {
            result: 'YENI_AKSIYON_GEREKLI', resolutionOutcome: 'YENI_AKSIYON_GEREKLI', currentStatusDetail: 'Yeni aksiyon gerekli',
            newAction: { description: 'Yerine açılan yeni düzeltici aksiyon açıklaması', directorateId: dir.id, dueDate: day(90) },
        });
        const old = await prisma.action.findUniqueOrThrow({ where: { id: aId } });
        expect(old.status).toBe('KAPATILDI');
        expect(await prisma.auditLog.count({ where: { entityId: aId, action: 'ACTION_SUPERSEDED' } })).toBe(1);
        const created = await prisma.action.findFirstOrThrow({ where: { findingId: fId, id: { not: aId } } });
        expect(created.status).toBe('BEKLIYOR');
        // Bulgu, yeni aksiyon açıkken kapanışa gönderilemez (engel yalnız yeni aksiyon).
        const blocked = await wf('maker', 'FINDING', fId, 'COMPLETE', 'Erken').expect(400);
        expect(blocked.body.message).toContain(created.actionId);
        expect(blocked.body.message).not.toContain(old.actionId);

        // Geri alma: eski aksiyon önceki durumuna döner, yeni aksiyon iptal edilir.
        await http().post(`/follow-ups/${fuId}/revert`).set(as('checker')).send({ reason: 'Yanlış sonuç' }).expect(201);
        expect((await prisma.action.findUniqueOrThrow({ where: { id: aId } })).status).not.toBe('KAPATILDI');
        expect((await prisma.action.findUniqueOrThrow({ where: { id: created.id } })).status).toBe('IPTAL');

        // Yeniden: yeni aksiyon → onu yeterli bul → bulgu "Kapanışa hazır".
        await evaluateAndApprove(fuId, {
            result: 'YENI_AKSIYON_GEREKLI', resolutionOutcome: 'YENI_AKSIYON_GEREKLI', currentStatusDetail: 'Yeni aksiyon gerekli',
            newAction: { description: 'Yerine açılan yeni düzeltici aksiyon açıklaması 2', directorateId: dir.id, dueDate: day(95) },
        });
        const second = await prisma.action.findFirstOrThrow({ where: { findingId: fId, id: { notIn: [aId, created.id] } } });
        const fu2 = await prisma.findingFollowUp.findFirstOrThrow({ where: { actionId: second.id, status: { not: 'IPTAL' } } });
        await evaluateAndApprove(fu2.id, { result: 'YETERLI', currentStatusDetail: 'Tamam' });
        expect(await prisma.finding.findUniqueOrThrow({ where: { id: fId } })).toMatchObject({ resolutionStatus: 'KAPANISA_HAZIR' });
        await wf('maker', 'FINDING', fId, 'COMPLETE', 'Kapanış önerisi').expect(201);
    });

    it('kontrol testi geri gönderme ve onayı test edenin kararlarında ve bildiriminde görünür', async () => {
        const c = await createTestControl(prisma, { ownerId: id.admin });
        const t = await createTestControlTest(prisma, { controlId: c.id, assigneeId: id.maker, secondControllerId: id.checker, status: 'TAMAMLANDI' });
        await wf('checker', 'CONTROL_TEST', t.id, 'RETURN', 'Kanıt dökümü eksik').expect(201);
        let dec = (await http().get('/workflow-approvals').set(as('maker')).expect(200)).body.decisions;
        expect(dec.find((d: any) => d.recordId === t.id)).toMatchObject({ kind: 'TEST_RETURNED', reason: 'Kanıt dökümü eksik', link: `/controls/testing/${t.id}`, finding: null });
        const notes = (await http().get('/notifications').set(as('maker')).expect(200)).body as any[];
        expect(notes.some(n => n.title === 'Kontrol testiniz düzeltme için geri gönderildi' && n.link === `/controls/testing/${t.id}`)).toBe(true);

        // Sonucu girilmemiş test onaylanamaz (önceden 500 veriyordu: lastTestResult enum'u).
        await prisma.controlTest.update({ where: { id: t.id }, data: { status: 'TAMAMLANDI', findingStatus: null } });
        const noResult = await wf('checker', 'CONTROL_TEST', t.id, 'APPROVE');
        expect(noResult.status).toBe(400);
        await prisma.controlTest.update({ where: { id: t.id }, data: { findingStatus: 'BULGUSU_YOK' } });
        await wf('checker', 'CONTROL_TEST', t.id, 'APPROVE').expect(201);
        dec = (await http().get('/workflow-approvals').set(as('maker')).expect(200)).body.decisions;
        expect(dec.find((d: any) => d.recordId === t.id)).toMatchObject({ kind: 'TEST_APPROVED' });
    });

    it('tam kullanıcı listesi (/admin/users) yalnız sistem yöneticisine açık; kişi seçimi listesi denetçiye açık kalır', async () => {
        await http().get('/admin/users').set(as('maker')).expect(403);
        await http().get('/admin/users').set(as('checker')).expect(403);
        await http().get('/admin/users').set(as('admin')).expect(200);
        const opts = (await http().get('/admin/users/options').set(as('maker')).expect(200)).body;
        const rows = opts.data ?? opts;
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0].ldapDn).toBeUndefined();
    });
});
