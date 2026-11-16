import {
    actionWhere, buildAccessContext, controlTestWhere, findingFullWhere, followUpWhere, hasOrgScope, riskWhere,
} from './access-scope.service';
import { projectPartialFinding } from '../../modules/audits/finding-access.projection';

// Seed varsayılanlarıyla aynı izin setleri (prisma/seed-system.ts).
const ROLE_PERMS = {
    SYSTEM_ADMIN: ['*'],
    RISK_CONTROL_MANAGER: ['finding:view', 'finding:delete', 'scope:org', 'evidence:view', 'report:org'],
    AUDITOR: ['finding:view', 'finding:delete:own', 'scope:org', 'evidence:view'],
    RISK_ANALYST: ['finding:view', 'control:view', 'scope:org:risk', 'evidence:view'],
    AUDITEE: ['finding:view', 'action:view', 'action:update', 'evidence:view'],
    VIEWER: ['finding:view', 'control:view', 'action:view'],
    // report:org kayıt kapsamı VERMEZ
    REPORT_ONLY: ['report:view', 'report:org'],
};

const ctxFor = (perms: string[], units: string[] = ['dir-A'], enforced = true) =>
    buildAccessContext({ id: 'u-1', permissions: perms }, units, enforced);

describe('AccessScopeService — kayıt kapsamı politikası', () => {
    it('uygulama kapalıyken herkes kurum geneli (mevcut davranış)', () => {
        const ctx = ctxFor(ROLE_PERMS.AUDITEE, [], false);
        expect(findingFullWhere(ctx)).toBeNull();
        expect(actionWhere(ctx)).toBeNull();
        expect(riskWhere(ctx)).toBeNull();
    });

    it.each(['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR'] as const)('%s tüm modüllerde kurum geneli', (role) => {
        const ctx = ctxFor(ROLE_PERMS[role], []);
        for (const fn of [findingFullWhere, actionWhere, followUpWhere, controlTestWhere, riskWhere]) {
            expect(fn(ctx)).toBeNull();
        }
    });

    it('report:org kayıt kapsamı vermez', () => {
        expect(hasOrgScope(ROLE_PERMS.REPORT_ONLY, 'finding')).toBe(false);
        expect(findingFullWhere(ctxFor(ROLE_PERMS.REPORT_ONLY))).not.toBeNull();
    });

    it('RISK_ANALYST: riskte kurum geneli, bulgu/test/aksiyonda birim + atama', () => {
        const ctx = ctxFor(ROLE_PERMS.RISK_ANALYST);
        expect(riskWhere(ctx)).toBeNull();
        expect(findingFullWhere(ctx)).not.toBeNull();
        expect(controlTestWhere(ctx)).not.toBeNull();
        expect(actionWhere(ctx)).not.toBeNull();
    });

    it('AUDITEE bulgu: birim (TASLAK hariç) veya bulguya atanmış; kullanıcının güncel birimi kayda uygulanmaz', () => {
        expect(findingFullWhere(ctxFor(ROLE_PERMS.AUDITEE, ['dir-A', 'dir-B']))).toEqual({
            OR: [
                { directorateId: { in: ['dir-A', 'dir-B'] }, workflowStatus: { not: 'TASLAK' } },
                { assigneeId: 'u-1' },
            ],
        });
    });

    it('üyeliği olmayan kullanıcı kurum geneline DÜŞMEZ — yalnız doğrudan atamalar kalır', () => {
        const where = findingFullWhere(ctxFor(ROLE_PERMS.VIEWER, [])) as any;
        expect(where.OR[0].directorateId).toEqual({ in: [] });
        expect(where.OR[1]).toEqual({ assigneeId: 'u-1' });
        expect(riskWhere(ctxFor(ROLE_PERMS.VIEWER, []))).toEqual({ OR: [{ directorateId: { in: [] } }, { ownerId: 'u-1' }] });
        // Birim kullanıcısı: kendi biriminin riskleri + sahibi olduğu riskler; boş direktörlük açılmaz.
        expect(riskWhere(ctxFor(ROLE_PERMS.AUDITEE, ['dir-A']))).toEqual({ OR: [{ directorateId: { in: ['dir-A'] } }, { ownerId: 'u-1' }] });
    });

    it('aksiyon: bağlı bulgunun kapsamı veya aksiyon sorumlusu', () => {
        const where = actionWhere(ctxFor(ROLE_PERMS.AUDITEE)) as any;
        expect(where.OR).toContainEqual({ ownerId: 'u-1' });
        expect(where.OR[0].finding.OR[0].directorateId).toEqual({ in: ['dir-A'] });
    });

    it('takip: bulgu kapsamı, kendi aksiyonunun takipleri ve doğrudan görev atamaları', () => {
        const where = followUpWhere(ctxFor(ROLE_PERMS.AUDITEE)) as any;
        expect(where.OR).toEqual(expect.arrayContaining([
            { action: { ownerId: 'u-1' } }, { assigneeId: 'u-1' }, { evaluatorId: 'u-1' }, { secondControllerId: 'u-1' },
        ]));
    });

    it('test: testin direktörlüğü, yoksa kontrolün direktörlüğü, veya test atamaları', () => {
        expect(controlTestWhere(ctxFor(ROLE_PERMS.VIEWER))).toEqual({
            OR: [
                { directorateId: { in: ['dir-A'] } },
                { directorateId: null, control: { directorateId: { in: ['dir-A'] } } },
                { assigneeId: 'u-1' },
                { secondControllerId: 'u-1' },
            ],
        });
    });

    it('scope:* ve modül izni org kapsamı verir; başka modülü açmaz', () => {
        expect(hasOrgScope(['scope:*'], 'finding')).toBe(true);
        expect(hasOrgScope(['scope:org:risk'], 'finding')).toBe(false);
    });
});

describe('projectPartialFinding — tek aksiyona atanmış kullanıcı', () => {
    const finding = {
        id: 'f-1', findingId: 'B-1', summary: 's', description: 'd', severity: 'HIGH', workflowStatus: 'MUTABAKAT_YAPILDI',
        birimCevabi: 'gizli', internalControlAssessment: 'gizli',
        control: { id: 'c', controlId: 'BTK.1', name: 'K', description: 'uzun' },
        actions: [{ id: 'a-1', ownerId: 'u-1' }, { id: 'a-2', ownerId: 'other' }],
        followUps: [{ id: 'fu-1', actionId: 'a-1' }, { id: 'fu-2', actionId: 'a-2' }, { id: 'fu-3', actionId: 'a-2', secondControllerId: 'u-1' }],
        attachments: [{ id: 'att' }], statusLogs: [{ id: 'log' }], linkedRisks: [{ id: 'r' }],
        _count: { actions: 2, followUps: 3, linkedRisks: 1, attachments: 1 },
    };

    it('yalnız kendi aksiyonu ve ilgili takipleri görünür; sayılar ve kanıtlar sızmaz', () => {
        const p: any = projectPartialFinding(finding, 'u-1');
        expect(p.actions.map((a: any) => a.id)).toEqual(['a-1']);
        expect(p.followUps.map((f: any) => f.id)).toEqual(['fu-1', 'fu-3']);
        expect(p.attachments).toEqual([]);
        expect(p.statusLogs).toEqual([]);
        expect(p.linkedRisks).toEqual([]);
        expect(p._count).toEqual({ actions: 1, followUps: 2, linkedRisks: 0, attachments: 0 });
        expect(p.birimCevabi).toBeUndefined();
        expect(p.internalControlAssessment).toBeUndefined();
        expect(p.control).toEqual({ id: 'c', controlId: 'BTK.1', name: 'K' });
        expect(p.accessLevel).toBe('PARTIAL');
    });
});
