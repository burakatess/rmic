import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, createTestUser, createTestDirectorate, createTestControl, E2E_TEST_PASSWORD } from './helpers/fixtures';
import { SYSTEM_ROLES } from '../prisma/system-roles';

/**
 * Paket 2 — merkezi kayıt kapsamı (RECORD_SCOPE_ENFORCEMENT=true) negatif erişim testleri.
 * Roller ÜRETİM VARSAYILAN izinleriyle (prisma/system-roles.ts) oluşturulur.
 * Ön koşul verisi (bulgu/aksiyon/takip) doğrudan fixture olarak yazılır; burada
 * iş akışı değil görünürlük test edilir.
 */
describe('E2E — Kayıt kapsamı (birim / atama / kurum geneli)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tokens: Record<string, string> = {};
    const ids: Record<string, string> = {};
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

    beforeAll(async () => {
        process.env.RECORD_SCOPE_ENFORCEMENT = 'true';
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);

        const roleIds: Record<string, string> = {};
        for (const r of SYSTEM_ROLES) {
            roleIds[r.name] = (await prisma.role.create({ data: { name: r.name, permissions: r.permissions } })).id;
        }
        const dirA = await createTestDirectorate(prisma, 'Kapsam Birim A');
        const dirB = await createTestDirectorate(prisma, 'Kapsam Birim B');
        ids.dirA = dirA.id; ids.dirB = dirB.id;

        const users: [string, string, string[]][] = [
            ['admin', 'SYSTEM_ADMIN', []],
            ['manager', 'RISK_CONTROL_MANAGER', []],
            ['auditor', 'AUDITOR', []],
            ['analystA', 'RISK_ANALYST', [dirA.id]],
            ['auditeeA', 'AUDITEE', [dirA.id]],
            ['auditeeB', 'AUDITEE', [dirB.id]],
            ['unitManagerAB', 'AUDITEE', [dirA.id, dirB.id]],
            ['viewerA', 'VIEWER', [dirA.id]],
            ['assigneeOnly', 'AUDITEE', []],
        ];
        for (const [key, role, units] of users) {
            const u = await createTestUser(prisma, roleIds[role], { email: `scope-${key.toLowerCase()}@e2e.local` });
            ids[key] = u.id;
            for (const d of units) await prisma.directorateMembership.create({ data: { userId: u.id, directorateId: d } });
        }
        for (const [key] of users) {
            tokens[key] = (await http().post('/auth/login').send({ email: `scope-${key.toLowerCase()}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        }

        const control = await createTestControl(prisma, { ownerId: ids.admin, directorateId: dirA.id });
        ids.control = control.id;
        const mkFinding = (code: string, directorateId: string, workflowStatus: string, createdById: string) =>
            prisma.finding.create({
                data: {
                    findingId: code, description: `${code} kapsam testi bulgusu`, impact: 'etki', severity: 'HIGH',
                    directorateId, workflowStatus: workflowStatus as any, controlId: control.id, createdById,
                    birimCevabi: `${code} birim cevabı (gizli alan)`,
                },
            });
        ids.fA = (await mkFinding('SC-A', dirA.id, 'MUTABAKATA_GONDERILDI', ids.admin)).id;
        ids.fADraft = (await mkFinding('SC-A-DRAFT', dirA.id, 'TASLAK', ids.admin)).id;
        ids.fB = (await mkFinding('SC-B', dirB.id, 'MUTABAKATA_GONDERILDI', ids.admin)).id;

        const due = new Date(Date.now() + 30 * 86400000);
        const mkAction = (code: string, findingId: string, ownerId: string) =>
            prisma.action.create({ data: { actionId: code, description: `${code} aksiyon`, findingId, ownerId, dueDate: due } });
        ids.a1 = (await mkAction('SC-A-1', ids.fA, ids.admin)).id;
        ids.b1 = (await mkAction('SC-B-1', ids.fB, ids.assigneeOnly)).id;
        ids.b2 = (await mkAction('SC-B-2', ids.fB, ids.admin)).id;
        ids.fuB1 = (await prisma.findingFollowUp.create({ data: { followUpId: 'SC-T-B-1', findingId: ids.fB, actionId: ids.b1 } })).id;
        ids.fuB2 = (await prisma.findingFollowUp.create({ data: { followUpId: 'SC-T-B-2', findingId: ids.fB, actionId: ids.b2 } })).id;

        const mkAtt = (actionId: string) => prisma.actionAttachment.create({
            data: { actionId, fileName: '2099/01/yok.pdf', originalName: 'kanit.pdf', mimeType: 'application/pdf', sizeBytes: 10, uploadedBy: ids.admin },
        });
        ids.attA1 = (await mkAtt(ids.a1)).id;
        ids.attB2 = (await mkAtt(ids.b2)).id;
        ids.findingAttB = (await prisma.findingAttachment.create({
            data: { findingId: ids.fB, fileName: '2099/01/yok2.pdf', originalName: 'b.pdf', mimeType: 'application/pdf', sizeBytes: 10, uploadedBy: ids.admin },
        })).id;

        const cat = await prisma.riskCategory.create({ data: { name: 'Kapsam Kategori' } });
        ids.rA = (await prisma.risk.create({ data: { riskId: 'SC-R-A', name: 'Risk A', description: 'r', ownerId: ids.auditeeA, categoryId: cat.id } })).id;
        ids.rOther = (await prisma.risk.create({ data: { riskId: 'SC-R-X', name: 'Risk X', description: 'r', ownerId: ids.admin, categoryId: cat.id } })).id;
    });

    afterAll(async () => {
        delete process.env.RECORD_SCOPE_ENFORCEMENT;
        await app.close();
    });

    const findingCodes = async (who: string) => {
        const res = await http().get('/findings').set(as(who)).expect(200);
        return { codes: res.body.data.map((f: any) => f.findingId).sort(), total: res.body.pagination.total };
    };

    describe('Bulgu listesi ve sayaç', () => {
        it('AUDITOR (merkezi iç kontrol) kurum genelini görür — üyeliği olmasa da', async () => {
            expect((await findingCodes('auditor')).codes).toEqual(['SC-A', 'SC-A-DRAFT', 'SC-B']);
        });

        it('AUDITEE yalnız kendi biriminin TASLAK olmayan bulgularını görür; sayaç aynı kapsamda', async () => {
            expect(await findingCodes('auditeeA')).toEqual({ codes: ['SC-A'], total: 1 });
            expect(await findingCodes('auditeeB')).toEqual({ codes: ['SC-B'], total: 1 });
        });

        it('çoklu üyelikli birim kullanıcısı iki birimi de görür (yönetici yetkisi kazanmaz)', async () => {
            expect((await findingCodes('unitManagerAB')).codes).toEqual(['SC-A', 'SC-B']);
            await http().delete(`/findings/${ids.fADraft}`).set(as('unitManagerAB')).expect(403);
        });

        it('üyeliği olmayan kullanıcı kurum geneline düşmez', async () => {
            expect(await findingCodes('assigneeOnly')).toEqual({ codes: [], total: 0 });
        });

        it('RISK_ANALYST bulguda birim kapsamında kalır', async () => {
            expect((await findingCodes('analystA')).codes).toEqual(['SC-A']);
        });
    });

    describe('Bulgu detayı ve kısmi erişim', () => {
        it('kapsam dışı bulgu ve birimin taslağı 404 (varlık açıklanmaz)', async () => {
            await http().get(`/findings/${ids.fB}`).set(as('auditeeA')).expect(404);
            await http().get(`/findings/${ids.fADraft}`).set(as('auditeeA')).expect(404);
        });

        it('tek aksiyona atanan kullanıcı yalnız kendi iş kalemini görür; diğer aksiyon/kanıt/sayılar sızmaz', async () => {
            const res = await http().get(`/findings/${ids.fB}`).set(as('assigneeOnly')).expect(200);
            expect(res.body.accessLevel).toBe('PARTIAL');
            expect(res.body.actions.map((a: any) => a.actionId)).toEqual(['SC-B-1']);
            expect(res.body.followUps.map((f: any) => f.followUpId)).toEqual(['SC-T-B-1']);
            expect(res.body.attachments).toEqual([]);
            expect(res.body._count).toEqual({ actions: 1, followUps: 1, linkedRisks: 0, attachments: 0 });
            expect(res.body.birimCevabi).toBeUndefined();

            const actions = await http().get(`/findings/${ids.fB}/actions`).set(as('assigneeOnly')).expect(200);
            expect(actions.body.map((a: any) => a.actionId)).toEqual(['SC-B-1']);
            await http().get(`/findings/${ids.fB}/status-history`).set(as('assigneeOnly')).expect(403);
        });

        it('aksiyon detayı: kendi aksiyonu açılır (bulgu yalnız üst bilgi), diğer aksiyon 404', async () => {
            const own = await http().get(`/actions/${ids.b1}`).set(as('assigneeOnly')).expect(200);
            expect(own.body.finding).toEqual(expect.objectContaining({ findingId: 'SC-B' }));
            expect(own.body.finding.birimCevabi).toBeUndefined();
            await http().get(`/actions/${ids.b2}`).set(as('assigneeOnly')).expect(404);
            await http().get(`/actions/${ids.b1}/relations`).set(as('assigneeOnly')).expect(403);
        });

        it('kısmi kullanıcı: yetenek bayrakları yalnız kendi aksiyon işlemlerini açar; gizli kayıt kimlikleri yanıtta yok', async () => {
            const res = await http().get(`/findings/${ids.fB}`).set(as('assigneeOnly')).expect(200);
            expect(Object.values(res.body.capabilities).every(v => v === false)).toBe(true);
            expect(res.body.actions[0].capabilities).toEqual({ canEdit: false, canComplete: true, canExtend: true, canManageAttachments: false });
            const raw = JSON.stringify(res.body);
            for (const hidden of ['SC-B-2', 'SC-T-B-2', ids.b2, ids.fuB2, ids.attB2, ids.findingAttB, 'birim cevabı']) {
                expect(raw).not.toContain(hidden);
            }
            // Tam erişimli kullanıcıda aynı bayraklar açık
            const full = await http().get(`/findings/${ids.fB}`).set(as('manager')).expect(200);
            expect(full.body.capabilities).toMatchObject({ canEditFinding: true, canCreateAction: true, canApproveWorkflow: true });
        });

        it('kısmi kullanıcı: buton gizli olsa da bulgu/aksiyon yazma uçları reddeder; kendi aksiyonunda izinli işlem yapılır', async () => {
            const who = as('assigneeOnly');
            await http().put(`/findings/${ids.fB}`).set(who).send({ description: 'x' }).expect(403);
            await http().post(`/findings/${ids.fB}/actions`).set(who).send({ description: 'x', dueDate: '2030-01-01' }).expect(403);
            await http().post(`/findings/${ids.fB}/status-logs`).set(who).send({ text: 'x' }).expect(403);
            await http().get(`/findings/${ids.fB}/relations`).set(who).expect(403);
            await http().put(`/actions/${ids.b2}`).set(who).send({ notes: 'x' }).expect(404);
            await http().post(`/actions/${ids.b2}/complete`).set(who).send({}).expect(404);
            // Sorumlu aksiyonu yeniden tanımlayamaz (termin yalnız süre uzatma ile)
            await http().put(`/actions/${ids.b1}`).set(who).send({ dueDate: '2031-01-01' }).expect(403);
            await http().put(`/actions/${ids.b1}`).set(who).send({ notes: 'İlerleme notu' }).expect(200);
            await http().post(`/actions/${ids.b1}/complete`).set(who).send({}).expect(201);
            const after = await http().get(`/findings/${ids.fB}`).set(who).expect(200);
            expect(after.body.actions[0].capabilities.canComplete).toBe(false);
        });

        it('takip listesi kapsam dışını göstermez', async () => {
            const res = await http().get('/follow-ups').set(as('auditeeA')).expect(200);
            const codes = (res.body.data ?? res.body).map((f: any) => f.followUpId);
            expect(codes).not.toContain('SC-T-B-1');
            const own = await http().get('/follow-ups').set(as('assigneeOnly')).expect(200);
            expect((own.body.data ?? own.body).map((f: any) => f.followUpId)).toEqual(['SC-T-B-1']);
        });
    });

    describe('Kişi seçim ucu', () => {
        it('seçim listesi asgari alan döner (e-posta/rol/izin yok); birim kullanıcısı erişemez', async () => {
            const res = await http().get('/admin/users/options?limit=500').set(as('auditor')).expect(200);
            const one = res.body.data[0];
            expect(Object.keys(one).sort()).toEqual(['department', 'firstName', 'id', 'isActive', 'lastName']);
            expect(JSON.stringify(res.body)).not.toMatch(/@e2e\.local|passwordHash|permissions/);
            await http().get('/admin/users/options').set(as('auditeeA')).expect(403);
            await http().get('/admin/users').set(as('auditeeA')).expect(403);
        });
    });

    describe('Kanıt erişimi', () => {
        const att = (kind: string, id: string) => `/uploads/attachments/${kind}/${id}`;

        it('VIEWER kapsamdaki kaydın kanıtını evidence:view olmadan açamaz (403)', async () => {
            await http().get(att('action', ids.attA1)).set(as('viewerA')).expect(403);
        });

        it('kapsam dışı kanıt 404 "Kanıt bulunamadı"; kapsamdaki kanıt yetkiden geçer (dosya yoksa "Dosya bulunamadı")', async () => {
            const denied = await http().get(att('action', ids.attB2)).set(as('auditeeA')).expect(404);
            expect(denied.body.message).toBe('Aksiyon bulunamadı');
            const allowed = await http().get(att('action', ids.attA1)).set(as('auditeeA')).expect(404);
            expect(allowed.body.message).toBe('Dosya bulunamadı');
        });

        it('bulgu kanıtı için tek aksiyona atanmak yetmez', async () => {
            const res = await http().get(att('finding', ids.findingAttB)).set(as('assigneeOnly')).expect(404);
            expect(res.body.message).toBe('Kanıt bulunamadı');
        });
    });

    describe('Risk, Kontrol Havuzu ve arama', () => {
        it('RISK_ANALYST riskte kurum geneli; AUDITEE yalnız kendi riski', async () => {
            const all = await http().get('/risks').set(as('analystA')).expect(200);
            expect(all.body.data.map((r: any) => r.riskId).sort()).toEqual(['SC-R-A', 'SC-R-X']);
            const own = await http().get('/risks').set(as('auditeeA')).expect(200);
            expect(own.body.data.map((r: any) => r.riskId)).toEqual(['SC-R-A']);
            await http().get(`/risks/${ids.rOther}`).set(as('auditeeA')).expect(404);
        });

        it('Kontrol Havuzu control:view ile açık (AUDITEE dahil); ilişkili bulgular ve sayıları kapsamdan geçer', async () => {
            // AUDITEE artık control:view'a sahip: havuzu görür ama başka birimin bulgularını göremez.
            // Kontrol A biriminde; bağlı bulgulardan yalnız B biriminin bulgusu (SC-B) B kullanıcısına görünür.
            const otherUnit = await http().get(`/controls/${ids.control}`).set(as('auditeeB')).expect(200);
            expect(otherUnit.body.findings.map((f: any) => f.findingId)).toEqual(['SC-B']);
            expect((await http().get('/controls').set(as('auditeeB')).expect(200)).body.data.find((c: any) => c.id === ids.control)._count.findings).toBe(1);
            // control:view kontrol düzenleme/plan uygulama yetkisi vermez.
            await http().put(`/controls/${ids.control}`).set(as('auditeeA')).send({ name: 'x' }).expect(403);
            const res = await http().get(`/controls/${ids.control}`).set(as('viewerA')).expect(200);
            expect(res.body.findings.map((f: any) => f.findingId)).toEqual(['SC-A']);
            const list = await http().get('/controls').set(as('viewerA')).expect(200);
            const row = list.body.data.find((c: any) => c.id === ids.control);
            expect(row._count.findings).toBe(1);
        });

        it('arama liste uçlarıyla aynı kapsamı uygular', async () => {
            const res = await http().get('/search').query({ q: 'kapsam testi', category: 'finding' }).set(as('auditeeA')).expect(200);
            expect(res.body.data.map((r: any) => r.code)).toEqual(['SC-A']);
        });
    });

    describe('Taslak bulgu silme (finding:delete:own)', () => {
        it('AUDITOR kendi oluşturduğu taslağı siler; başkasının taslağı 403', async () => {
            const own = await prisma.finding.create({
                data: { findingId: 'SC-OWN', description: 'kendi taslağı', impact: 'e', severity: 'LOW', workflowStatus: 'TASLAK', createdById: ids.auditor },
            });
            await http().delete(`/findings/${own.id}`).set(as('auditor')).expect(200);
            expect(await prisma.finding.count({ where: { id: own.id } })).toBe(0);
            await http().delete(`/findings/${ids.fADraft}`).set(as('auditor')).expect(403);
        });

        it('RCM her taslağı silebilir ama süreç başlamış bulgu 409', async () => {
            await http().delete(`/findings/${ids.fA}`).set(as('manager')).expect(409);
        });

        it('VIEWER silme izni olmadan 403', async () => {
            await http().delete(`/findings/${ids.fADraft}`).set(as('viewerA')).expect(403);
        });
    });

    describe('Risk ↔ direktörlük kapsamı', () => {
        const createRisk = (body: Record<string, unknown>) =>
            http().post('/risks').set(as('manager')).send({ name: 'Kapsam riski', description: 'd', categoryId: 'Kapsam Kategori', ownerId: ids.admin, inherentProbability: 2, inherentImpact: 2, ...body });

        it('yeni risk direktörlük veya kurum geneli nitelik olmadan oluşturulamaz', async () => {
            const res = await createRisk({}).expect(400);
            expect(res.body.message).toContain('direktörlük');
            await createRisk({ directorateId: ids.dirA, isOrgWide: true }).expect(400);
        });

        it('birim riski yalnız o birim ve kurum geneli kapsamlılar; kurum geneli risk birim kullanıcılarına açılmaz', async () => {
            const unitRisk = (await createRisk({ name: 'Birim B riski', directorateId: ids.dirB }).expect(201)).body;
            const orgRisk = (await createRisk({ name: 'Kurum geneli risk', isOrgWide: true }).expect(201)).body;
            const codes = async (who: string) => (await http().get('/risks').set(as(who)).expect(200)).body.data.map((r: any) => r.riskId);
            expect(await codes('auditeeB')).toContain(unitRisk.riskId);
            expect(await codes('auditeeA')).not.toContain(unitRisk.riskId);
            expect(await codes('auditeeA')).not.toContain(orgRisk.riskId);
            expect(await codes('auditeeB')).not.toContain(orgRisk.riskId);
            expect(await codes('analystA')).toEqual(expect.arrayContaining([unitRisk.riskId, orgRisk.riskId]));
            // arama aynı kapsamı uygular
            const search = await http().get('/search').query({ q: 'Birim B riski', category: 'risk' }).set(as('auditeeA')).expect(200);
            expect(search.body.data).toEqual([]);
            ids.unitRisk = unitRisk.id;
        });

        it('direktörlük değişikliği izinli kullanıcıyla ve ayrı denetim kaydıyla; erişim hemen değişir', async () => {
            await http().put(`/risks/${ids.unitRisk}`).set(as('manager')).send({ directorateId: ids.dirA }).expect(200);
            const log = await prisma.auditLog.findFirst({ where: { action: 'RISK_DIRECTORATE_CHANGE', entityId: ids.unitRisk } });
            expect(log?.oldValue).toEqual({ directorateId: ids.dirB, isOrgWide: false });
            expect(log?.newValue).toEqual({ directorateId: ids.dirA, isOrgWide: false });
            await http().get(`/risks/${ids.unitRisk}`).set(as('auditeeB')).expect(404);
            await http().get(`/risks/${ids.unitRisk}`).set(as('auditeeA')).expect(200);
        });
    });

    describe('Kontrolcü uygunluğu (ortak kural)', () => {
        const eligible = async (role: string) =>
            (await http().get('/controls/annual-plan/2027/eligible-controllers').query({ role, controlId: ids.control }).set(as('manager')).expect(200))
                .body.data.map((u: any) => u.id).sort();

        it('birinci kontrolcü: AUDITOR ve RCM dışlanmaz; test yürütme izni olmayanlar listelenmez', async () => {
            const list = await eligible('assignee');
            expect(list).toEqual(expect.arrayContaining([ids.auditor, ids.manager, ids.admin]));
            for (const u of ['viewerA', 'auditeeA', 'auditeeB', 'analystA']) expect(list).not.toContain(ids[u]);
        });

        it('ikinci kontrolcü: yalnız test onay izni olanlar', async () => {
            expect(await eligible('secondController')).toEqual([ids.admin, ids.manager].sort());
        });
    });

    describe('Takip birinci kontrolcü yeniden atama', () => {
        it('yönetici gerekçeyle yeniden atar; kendini atayamaz; denetim kaydı yazılır', async () => {
            const url = `/findings/${ids.fB}/follow-ups/${ids.fuB1}/assignee`;
            await http().post(url).set(as('manager')).send({ assigneeId: ids.manager, reason: 'self' }).expect(400);
            await http().post(url).set(as('auditor')).send({ assigneeId: ids.manager, reason: 'r' }).expect(403);
            await http().post(url).set(as('manager')).send({ assigneeId: ids.auditor, reason: 'Önceki sorumlu ayrıldı' }).expect(201);
            const fu = await prisma.findingFollowUp.findUnique({ where: { id: ids.fuB1 } });
            expect(fu?.assigneeId).toBe(ids.auditor);
            const log = await prisma.auditLog.findFirst({ where: { action: 'FOLLOWUP_REASSIGN', entityId: ids.fuB1 } });
            expect(log?.newValue).toEqual(expect.objectContaining({ assigneeId: ids.auditor, reason: 'Önceki sorumlu ayrıldı' }));
            expect(log?.actorType).toBe('USER');
        });

        it('aday listesi atama kuralıyla aynı: yalnız değerlendirme rolleri, asgari alan; yönetici dışı 403', async () => {
            const url = `/findings/${ids.fB}/follow-ups/${ids.fuB1}/assignee-candidates`;
            const res = await http().get(url).set(as('manager')).expect(200);
            const candidateIds = res.body.map((u: any) => u.id);
            expect(candidateIds).toEqual(expect.arrayContaining([ids.admin, ids.manager, ids.auditor]));
            for (const ineligible of [ids.analystA, ids.auditeeA, ids.viewerA, ids.assigneeOnly]) expect(candidateIds).not.toContain(ineligible);
            expect(Object.keys(res.body[0]).sort()).toEqual(['department', 'firstName', 'id', 'lastName']);
            await http().get(url).set(as('auditor')).expect(403);
            await http().get(url).set(as('auditeeA')).expect(403);
        });
    });
});
