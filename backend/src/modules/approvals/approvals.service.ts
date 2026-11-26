import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';

/**
 * Maker-checker iş kutusu. Kalıcı tablo yok: bekleyen işler ve son kararlar her istekte
 * Action / FindingFollowUp alanlarından türetilir (bildirimlerle aynı ilke) — böylece
 * bir onay verildiğinde iş kutusundan ve bildirimden anında düşer.
 *
 * Kapsam: kayıt yalnız kullanıcının ikinci (bekleyenler) veya birinci (kararlar)
 * kontrolcü olduğu satırlardan oluşur; başka kayıt kapsamı gerekmez.
 */
export type PendingKind = 'ACTION_APPROVAL' | 'ACTION_DELETION' | 'FOLLOWUP_APPROVAL' | 'FOLLOWUP_DELETION' | 'FINDING_CLOSURE' | 'FINDING_DELETION';
export type DecisionKind =
    | 'ACTION_REJECTED' | 'ACTION_APPROVED' | 'ACTION_REVERTED' | 'ACTION_DELETED' | 'ACTION_DELETE_REJECTED'
    | 'FOLLOWUP_REJECTED' | 'FOLLOWUP_APPROVED' | 'FOLLOWUP_REVERTED' | 'FOLLOWUP_DELETED' | 'FOLLOWUP_DELETE_REJECTED'
    | 'FINDING_CLOSED' | 'FINDING_CLOSURE_RETURNED' | 'FINDING_DELETED' | 'FINDING_DELETE_REJECTED'
    | 'TEST_RETURNED' | 'TEST_APPROVED' | 'TEST_DELETED' | 'TEST_DELETE_REJECTED';

/**
 * Bulgu kapanış değerlendirmesi: 2. kontrolcüsü olduğum, kapanışa gönderilmiş (PENDING_REVIEW) bulgular.
 * Gönderen kendi değerlendirmesine karar veremez (audits.service.ts::assertClosureDecider).
 */
const closurePendingWhere = (userId: string) => ({
    secondControllerId: userId, status: 'PENDING_REVIEW' as const, deletedAt: null,
    workflowStatus: { not: 'IPTAL' as const }, NOT: { closureSubmittedById: userId },
});

export interface PendingApprovalItem {
    kind: PendingKind;
    recordId: string;
    code: string;
    description: string | null;
    finding: { id: string; findingId: string; summary: string | null } | null; // manuel aksiyon/takipte boş
    requestedBy: { id: string; name: string } | null;
    requestedAt: Date;
    reason: string | null;
    link: string;
}

export interface ApprovalDecisionItem {
    kind: DecisionKind;
    recordId: string;
    code: string;
    finding: { id: string; findingId: string; summary: string | null } | null;
    reason: string | null;
    date: Date;
    link: string;
}

/** Benim açtığım, karar bekleyen talep (onay veya silme). */
export type MyRequestKind = 'TEST_APPROVAL' | 'ACTION_APPROVAL' | 'FOLLOWUP_APPROVAL' | 'FINDING_CLOSURE' | 'PERIOD_APPROVAL' | 'DELETION';
export interface MyRequestItem {
    kind: MyRequestKind;
    /** Silme talebinde kayıt türü (CONTROL, CONTROL_TEST, PERIOD_CONTROL, FINDING, ACTION, FOLLOW_UP). */
    recordType: string;
    recordId: string;
    code: string;
    title: string | null;
    link: string;
    submittedAt: Date;
    reason: string | null;
    /** Kimin onayında: atanmış 2. kontrolcü ya da onaylayabilecek kişiler. */
    approvers: Array<{ id: string; name: string }>;
    approverNote: string | null;
    /** Geri çekme: iş akışı geçişi (WITHDRAW) veya silme talebi geri çekme ucu. */
    withdraw: { via: 'WORKFLOW'; entityType: string } | { via: 'DELETION'; type: string };
}

const MANAGER_ROLE_NAMES = ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER'];

const RECENT_DAYS = 7;
// Üst sınır YOK: bekleyen işler ve kararlar gerçek iş kuyruğudur (kontrolcünün atandığı kayıtlar);
// sınır, 200'ü aşan kuyrukta işleri sessizce gizlerdi. Kararlar zaten 7 gün + düzeltme bekleyen retlerle sınırlı.

const findingSelect = { select: { id: true, findingId: true, summary: true } } as const;
const userName = (u?: { id: string; firstName: string | null; lastName: string | null } | null) =>
    u ? { id: u.id, name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || '—' } : null;

@Injectable()
export class ApprovalsService {
    constructor(private prisma: PrismaService) { }

    /** İkinci kontrolcü olarak kararımı bekleyen işler (en eski talep önce). */
    async pendingFor(userId: string): Promise<PendingApprovalItem[]> {
        const [actionApprovals, actionDeletions, fuApprovals, fuDeletions, closures, findingDeletions] = await Promise.all([
            this.prisma.action.findMany({
                where: { secondControllerId: userId, approvalState: 'ONAY_BEKLIYOR', deletedAt: null },
                select: {
                    id: true, actionId: true, description: true, submittedAt: true, updatedAt: true, finding: findingSelect,
                    firstController: { select: { id: true, firstName: true, lastName: true } },
                },
            }),
            this.prisma.action.findMany({
                where: { secondControllerId: userId, deletionRequestedAt: { not: null }, deletedAt: null },
                select: { id: true, actionId: true, description: true, deletionRequestedAt: true, deletionRequestedById: true, deletionReason: true, finding: findingSelect },
            }),
            this.prisma.findingFollowUp.findMany({
                where: { secondControllerId: userId, status: 'TAMAMLANDI', approvalStatus: 'BEKLIYOR', result: { not: null }, deletedAt: null },
                select: { id: true, followUpId: true, explanation: true, evaluatorId: true, evaluatedAt: true, updatedAt: true, result: true, finding: findingSelect },
            }),
            this.prisma.findingFollowUp.findMany({
                where: { secondControllerId: userId, deletionRequestedAt: { not: null }, deletedAt: null },
                select: { id: true, followUpId: true, deletionRequestedAt: true, deletionRequestedById: true, deletionReason: true, finding: findingSelect },
            }),
            this.prisma.finding.findMany({
                where: closurePendingWhere(userId),
                select: { id: true, findingId: true, summary: true, closureNote: true, closureSubmittedAt: true, closureSubmittedById: true, updatedAt: true },
            }),
            // Bulgu silme talebi: aksiyon/takip silmede olduğu gibi bulgunun 2. kontrolcüsünün kutusuna düşer;
            // karar yetkisi yönetici rolündedir (deletion-requests.service.ts::assertDecider).
            this.prisma.finding.findMany({
                where: { secondControllerId: userId, deletionRequestedAt: { not: null }, deletedAt: null, OR: [{ deletionRequestedById: null }, { deletionRequestedById: { not: userId } }] },
                select: { id: true, findingId: true, summary: true, description: true, deletionRequestedAt: true, deletionRequestedById: true, deletionReason: true },
            }),
        ]);

        const requesterIds = [...new Set([
            ...actionDeletions.map(a => a.deletionRequestedById),
            ...fuApprovals.map(f => f.evaluatorId),
            ...fuDeletions.map(f => f.deletionRequestedById),
            ...closures.map(f => f.closureSubmittedById),
            ...findingDeletions.map(f => f.deletionRequestedById),
        ].filter((x): x is string => !!x))];
        const users = requesterIds.length
            ? await this.prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, firstName: true, lastName: true } })
            : [];
        const byId = new Map(users.map(u => [u.id, userName(u)]));
        const link = (findingId: string) => `/findings/${findingId}`;
        // Aksiyon/takip kendi detay ekranına gider (manuel kayıtlarda bulgu yoktur).
        const actionLink = (id: string) => `/actions/${id}`;
        const fuLink = (id: string) => `/follow-ups/${id}`;

        const items: PendingApprovalItem[] = [
            ...actionApprovals.map(a => ({
                kind: 'ACTION_APPROVAL' as const, recordId: a.id, code: a.actionId, description: a.description,
                finding: a.finding, requestedBy: userName(a.firstController), requestedAt: a.submittedAt ?? a.updatedAt,
                reason: null, link: actionLink(a.id),
            })),
            ...actionDeletions.map(a => ({
                kind: 'ACTION_DELETION' as const, recordId: a.id, code: a.actionId, description: a.description,
                finding: a.finding, requestedBy: (a.deletionRequestedById && byId.get(a.deletionRequestedById)) || null,
                requestedAt: a.deletionRequestedAt!, reason: a.deletionReason, link: actionLink(a.id),
            })),
            ...fuApprovals.map(f => ({
                kind: 'FOLLOWUP_APPROVAL' as const, recordId: f.id, code: f.followUpId, description: f.explanation,
                finding: f.finding, requestedBy: (f.evaluatorId && byId.get(f.evaluatorId)) || null,
                requestedAt: f.evaluatedAt ?? f.updatedAt, reason: null, link: fuLink(f.id),
            })),
            ...fuDeletions.map(f => ({
                kind: 'FOLLOWUP_DELETION' as const, recordId: f.id, code: f.followUpId, description: null,
                finding: f.finding, requestedBy: (f.deletionRequestedById && byId.get(f.deletionRequestedById)) || null,
                requestedAt: f.deletionRequestedAt!, reason: f.deletionReason, link: fuLink(f.id),
            })),
            // Kapanış kararı değerlendirmenin okunmasını gerektirir: bulgu detayında verilir.
            ...closures.map(f => ({
                kind: 'FINDING_CLOSURE' as const, recordId: f.id, code: f.findingId, description: f.closureNote,
                finding: { id: f.id, findingId: f.findingId, summary: f.summary },
                requestedBy: (f.closureSubmittedById && byId.get(f.closureSubmittedById)) || null,
                requestedAt: f.closureSubmittedAt ?? f.updatedAt, reason: null, link: link(f.id),
            })),
            ...findingDeletions.map(f => ({
                kind: 'FINDING_DELETION' as const, recordId: f.id, code: f.findingId, description: f.summary || f.description.slice(0, 200),
                finding: { id: f.id, findingId: f.findingId, summary: f.summary },
                requestedBy: (f.deletionRequestedById && byId.get(f.deletionRequestedById)) || null,
                requestedAt: f.deletionRequestedAt!, reason: f.deletionReason, link: link(f.id),
            })),
        ];
        return items.sort((a, b) => +new Date(a.requestedAt) - +new Date(b.requestedAt));
    }

    async pendingCount(userId: string): Promise<number> {
        const [a, b, c, d, e, f] = await Promise.all([
            this.prisma.action.count({ where: { secondControllerId: userId, approvalState: 'ONAY_BEKLIYOR', deletedAt: null } }),
            this.prisma.action.count({ where: { secondControllerId: userId, deletionRequestedAt: { not: null }, deletedAt: null } }),
            this.prisma.findingFollowUp.count({ where: { secondControllerId: userId, status: 'TAMAMLANDI', approvalStatus: 'BEKLIYOR', result: { not: null }, deletedAt: null } }),
            this.prisma.findingFollowUp.count({ where: { secondControllerId: userId, deletionRequestedAt: { not: null }, deletedAt: null } }),
            this.prisma.finding.count({ where: closurePendingWhere(userId) }),
            this.prisma.finding.count({ where: { secondControllerId: userId, deletionRequestedAt: { not: null }, deletedAt: null, OR: [{ deletionRequestedById: null }, { deletionRequestedById: { not: userId } }] } }),
        ]);
        return a + b + c + d + e + f;
    }

    /**
     * Taleplerim: benim gönderdiğim ve karar bekleyen onay talepleri ile silme talepleri (en yeni önce).
     * Her talepte kimin onayında olduğu yazılır; karar verilene kadar geri çekilebilir.
     */
    async myRequests(userId: string): Promise<MyRequestItem[]> {
        const pendDel = { deletionRequestedById: userId, deletionRequestedAt: { not: null }, deletedAt: null } as const;
        const [tests, actions, fus, closures, periods, dControls, dTests, dScopes, dFindings, dActions, dFus, managers] = await Promise.all([
            this.prisma.controlTest.findMany({ where: { assigneeId: userId, status: 'TAMAMLANDI', deletedAt: null }, select: { id: true, testNo: true, secondControllerId: true, completedAt: true, updatedAt: true, control: { select: { name: true } } } }),
            this.prisma.action.findMany({ where: { firstControllerId: userId, approvalState: 'ONAY_BEKLIYOR', deletedAt: null }, select: { id: true, actionId: true, title: true, description: true, secondControllerId: true, submittedAt: true, updatedAt: true } }),
            this.prisma.findingFollowUp.findMany({ where: { OR: [{ assigneeId: userId }, { evaluatorId: userId }], status: 'TAMAMLANDI', approvalStatus: 'BEKLIYOR', deletedAt: null }, select: { id: true, followUpId: true, secondControllerId: true, evaluatedAt: true, updatedAt: true, finding: findingSelect } }),
            this.prisma.finding.findMany({ where: { closureSubmittedById: userId, status: 'PENDING_REVIEW', deletedAt: null }, select: { id: true, findingId: true, summary: true, secondControllerId: true, closureSubmittedAt: true, closureNote: true, updatedAt: true } }),
            this.prisma.controlYearScope.findMany({ where: { reviewSubmittedById: userId, reviewSubmittedAt: { not: null }, reviewApprovedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, year: true, snapshotName: true, secondControllerId: true, reviewSubmittedAt: true, control: { select: { controlId: true, name: true } } } }),
            this.prisma.control.findMany({ where: pendDel, select: { id: true, controlId: true, name: true, deletionRequestedAt: true, deletionReason: true } }),
            this.prisma.controlTest.findMany({ where: pendDel, select: { id: true, testNo: true, deletionRequestedAt: true, deletionReason: true, control: { select: { name: true } } } }),
            this.prisma.controlYearScope.findMany({ where: { deletionRequestedById: userId, deletionRequestedAt: { not: null }, status: 'ACTIVE' }, select: { id: true, code: true, year: true, snapshotName: true, deletionRequestedAt: true, deletionReason: true, control: { select: { controlId: true, name: true } } } }),
            this.prisma.finding.findMany({ where: pendDel, select: { id: true, findingId: true, summary: true, deletionRequestedAt: true, deletionReason: true } }),
            this.prisma.action.findMany({ where: pendDel, select: { id: true, actionId: true, title: true, description: true, deletionRequestedAt: true, deletionReason: true } }),
            this.prisma.findingFollowUp.findMany({ where: pendDel, select: { id: true, followUpId: true, deletionRequestedAt: true, deletionReason: true, finding: findingSelect } }),
            this.prisma.user.findMany({ where: { isActive: true, role: { name: { in: MANAGER_ROLE_NAMES } }, id: { not: userId } }, select: { id: true, firstName: true, lastName: true }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] }),
        ]);
        const checkerIds = [...new Set([...tests, ...actions, ...fus, ...closures, ...periods].map(r => r.secondControllerId).filter((x): x is string => !!x))];
        const checkers = checkerIds.length ? await this.prisma.user.findMany({ where: { id: { in: checkerIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
        const byId = new Map(checkers.map(u => [u.id, userName(u)!]));
        const mgrs = managers.map(u => userName(u)!);
        const checker = (id: string | null) => (id && byId.get(id) ? [byId.get(id)!] : []);
        const wf = (entityType: string) => ({ via: 'WORKFLOW' as const, entityType });
        const del = (type: string) => ({ via: 'DELETION' as const, type });
        const delNote = 'Yönetici rolündeki kişilerden biri karar verir (talep eden hariç).';

        const items: MyRequestItem[] = [
            ...tests.map(t => ({
                kind: 'TEST_APPROVAL' as const, recordType: 'CONTROL_TEST', recordId: t.id, code: t.testNo, title: t.control.name, link: `/controls/testing/${t.id}`,
                submittedAt: t.completedAt ?? t.updatedAt, reason: null,
                approvers: t.secondControllerId ? checker(t.secondControllerId) : mgrs,
                approverNote: t.secondControllerId ? null : '2. kontrolcü atanmamış; yönetici rolündeki kişiler onaylayabilir.', withdraw: wf('CONTROL_TEST'),
            })),
            ...actions.map(a => ({
                kind: 'ACTION_APPROVAL' as const, recordType: 'ACTION', recordId: a.id, code: a.actionId, title: a.title || a.description.slice(0, 120), link: `/actions/${a.id}`,
                submittedAt: a.submittedAt ?? a.updatedAt, reason: null, approvers: checker(a.secondControllerId), approverNote: null, withdraw: wf('ACTION'),
            })),
            ...fus.map(f => ({
                kind: 'FOLLOWUP_APPROVAL' as const, recordType: 'FOLLOW_UP', recordId: f.id, code: f.followUpId, title: f.finding?.summary ?? null, link: `/follow-ups/${f.id}`,
                submittedAt: f.evaluatedAt ?? f.updatedAt, reason: null, approvers: checker(f.secondControllerId), approverNote: null, withdraw: wf('FOLLOW_UP'),
            })),
            ...closures.map(f => ({
                kind: 'FINDING_CLOSURE' as const, recordType: 'FINDING', recordId: f.id, code: f.findingId, title: f.summary, link: `/findings/${f.id}`,
                submittedAt: f.closureSubmittedAt ?? f.updatedAt, reason: f.closureNote,
                approvers: f.secondControllerId ? checker(f.secondControllerId) : mgrs,
                approverNote: 'Atanmış 2. kontrolcü veya yönetici rolündeki kişiler karar verebilir.', withdraw: wf('FINDING'),
            })),
            ...periods.map(s => ({
                kind: 'PERIOD_APPROVAL' as const, recordType: 'PERIOD_CONTROL', recordId: s.id, code: s.code ?? `${s.year}.${s.control.controlId}`, title: s.snapshotName || s.control.name, link: `/controls/agenda/${s.id}`,
                submittedAt: s.reviewSubmittedAt!, reason: null, approvers: checker(s.secondControllerId), approverNote: null, withdraw: wf('PERIOD_CONTROL'),
            })),
            ...dControls.map(c => ({ kind: 'DELETION' as const, recordType: 'CONTROL', recordId: c.id, code: c.controlId, title: c.name, link: `/controls/${c.id}`, submittedAt: c.deletionRequestedAt!, reason: c.deletionReason, approvers: mgrs, approverNote: delNote, withdraw: del('CONTROL') })),
            ...dTests.map(t => ({ kind: 'DELETION' as const, recordType: 'CONTROL_TEST', recordId: t.id, code: t.testNo, title: t.control.name, link: `/controls/testing/${t.id}`, submittedAt: t.deletionRequestedAt!, reason: t.deletionReason, approvers: mgrs, approverNote: delNote, withdraw: del('CONTROL_TEST') })),
            ...dScopes.map(s => ({ kind: 'DELETION' as const, recordType: 'PERIOD_CONTROL', recordId: s.id, code: s.code ?? `${s.year}.${s.control.controlId}`, title: s.snapshotName || s.control.name, link: `/controls/agenda/${s.id}`, submittedAt: s.deletionRequestedAt!, reason: s.deletionReason, approvers: mgrs, approverNote: delNote, withdraw: del('PERIOD_CONTROL') })),
            ...dFindings.map(f => ({ kind: 'DELETION' as const, recordType: 'FINDING', recordId: f.id, code: f.findingId, title: f.summary, link: `/findings/${f.id}`, submittedAt: f.deletionRequestedAt!, reason: f.deletionReason, approvers: mgrs, approverNote: delNote, withdraw: del('FINDING') })),
            ...dActions.map(a => ({ kind: 'DELETION' as const, recordType: 'ACTION', recordId: a.id, code: a.actionId, title: a.title || a.description.slice(0, 120), link: `/actions/${a.id}`, submittedAt: a.deletionRequestedAt!, reason: a.deletionReason, approvers: mgrs, approverNote: delNote, withdraw: del('ACTION') })),
            ...dFus.map(f => ({ kind: 'DELETION' as const, recordType: 'FOLLOW_UP', recordId: f.id, code: f.followUpId, title: f.finding?.summary ?? null, link: `/follow-ups/${f.id}`, submittedAt: f.deletionRequestedAt!, reason: f.deletionReason, approvers: mgrs, approverNote: delNote, withdraw: del('FOLLOW_UP') })),
        ];
        return items.sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt));
    }

    /**
     * Birinci kontrolcü olarak kayıtlarım hakkında verilen kararlar. Ret (düzeltme bekliyor)
     * düzeltilene kadar görünür; diğerleri son 7 günle sınırlıdır.
     */
    async decisionsFor(userId: string): Promise<ApprovalDecisionItem[]> {
        const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
        const actionSelect = {
            id: true, actionId: true, approvalState: true, rejectionReason: true, approvedAt: true, revertedAt: true, revertReason: true,
            deletedAt: true, deletedById: true, deletionReason: true, deletionRejectionReason: true, deletionRequestedAt: true, updatedAt: true,
            finding: findingSelect,
        } as const;
        const fuSelect = {
            id: true, followUpId: true, status: true, approvalStatus: true, rejectionReason: true, approvedAt: true, revertedAt: true, revertReason: true,
            deletedAt: true, deletedById: true, deletionReason: true, deletionRejectionReason: true, deletionRequestedAt: true, updatedAt: true,
            finding: findingSelect,
        } as const;
        const [actions, fus, closures, tests, deletedFindings] = await Promise.all([
            this.prisma.action.findMany({
                where: {
                    firstControllerId: userId,
                    OR: [
                        { approvalState: 'REDDEDILDI', deletedAt: null },
                        { approvedAt: { gte: since } },
                        { revertedAt: { gte: since } },
                        { deletedAt: { gte: since } },
                        { deletionRejectionReason: { not: null }, deletionRequestedAt: null, updatedAt: { gte: since } },
                    ],
                },
                select: actionSelect,
            }),
            this.prisma.findingFollowUp.findMany({
                where: {
                    assigneeId: userId,
                    OR: [
                        { approvalStatus: 'REDDEDILDI', status: 'DEVAM_EDIYOR', deletedAt: null },
                        { approvedAt: { gte: since } },
                        { revertedAt: { gte: since } },
                        { deletedAt: { gte: since } },
                        { deletionRejectionReason: { not: null }, deletionRequestedAt: null, updatedAt: { gte: since } },
                    ],
                },
                select: fuSelect,
            }),
            // Kapanışa gönderdiğim bulgular hakkındaki kararlar (onay = kapatıldı, iade = açık kaldı).
            this.prisma.finding.findMany({
                where: { closureSubmittedById: userId, closureDecidedAt: { gte: since }, deletedAt: null },
                select: { id: true, findingId: true, summary: true, status: true, closureDecidedAt: true, closureReturnReason: true },
            }),
            // Kontrol testi kararları (test eden = 1. kontrolcü): geri gönderme düzeltilene kadar, diğerleri 7 gün.
            // Önceden yalnız test listesinden fark ediliyordu; ne kararlarda ne bildirimde vardı.
            this.prisma.controlTest.findMany({
                where: {
                    assigneeId: userId,
                    OR: [
                        { status: 'GERI_GONDERILDI', deletedAt: null },
                        { status: 'ONAYLANDI', approvedAt: { gte: since } },
                        { deletedAt: { gte: since } },
                        { deletionRejectionReason: { not: null }, deletionRequestedAt: null, updatedAt: { gte: since } },
                    ],
                },
                select: {
                    id: true, testNo: true, status: true, rejectionReason: true, returnedAt: true, approvedAt: true, updatedAt: true,
                    deletedAt: true, deletionReason: true, deletionRejectionReason: true, deletionRequestedAt: true,
                },
            }),
            // Bulgu silme talebi kararları (1. kontrolcüsü olduğum bulgular).
            this.prisma.finding.findMany({
                where: {
                    firstControllerId: userId,
                    OR: [
                        { deletedAt: { gte: since } },
                        { deletionRejectionReason: { not: null }, deletionRequestedAt: null, updatedAt: { gte: since } },
                    ],
                },
                select: { id: true, findingId: true, summary: true, deletedAt: true, deletionReason: true, deletionRejectionReason: true, deletionRequestedAt: true, updatedAt: true },
            }),
        ]);

        const items: ApprovalDecisionItem[] = [];
        // Manuel aksiyon planı / takibinde bulgu yoktur (finding = null): bağlantı kaydın kendi ekranına gider.
        const push = (kind: DecisionKind, r: { id: string; finding: any }, code: string, reason: string | null, date: Date | null, link?: string) =>
            date && items.push({
                kind, recordId: r.id, code, finding: r.finding ?? null, reason, date,
                link: link ?? (r.finding ? `/findings/${r.finding.id}` : kind.startsWith('ACTION_') ? `/actions/${r.id}` : `/follow-ups/${r.id}`),
            });

        for (const a of actions) {
            if (a.deletedAt && a.deletedAt >= since) { push('ACTION_DELETED', a, a.actionId, a.deletionReason, a.deletedAt); continue; }
            if (a.deletedAt) continue;
            if (a.approvalState === 'REDDEDILDI') push('ACTION_REJECTED', a, a.actionId, a.rejectionReason, a.updatedAt);
            else if (a.revertedAt && a.revertedAt >= since) push('ACTION_REVERTED', a, a.actionId, a.revertReason, a.revertedAt);
            else if (a.approvalState === 'ONAYLANDI' && a.approvedAt && a.approvedAt >= since) push('ACTION_APPROVED', a, a.actionId, null, a.approvedAt);
            if (a.deletionRejectionReason && !a.deletionRequestedAt && a.updatedAt >= since) push('ACTION_DELETE_REJECTED', a, a.actionId, a.deletionRejectionReason, a.updatedAt);
        }
        for (const f of fus) {
            if (f.deletedAt && f.deletedAt >= since) { push('FOLLOWUP_DELETED', f, f.followUpId, f.deletionReason, f.deletedAt); continue; }
            if (f.deletedAt) continue;
            if (f.approvalStatus === 'REDDEDILDI' && f.status === 'DEVAM_EDIYOR') push('FOLLOWUP_REJECTED', f, f.followUpId, f.rejectionReason, f.updatedAt);
            else if (f.revertedAt && f.revertedAt >= since) push('FOLLOWUP_REVERTED', f, f.followUpId, f.revertReason, f.revertedAt);
            else if (f.approvalStatus === 'ONAYLANDI' && f.approvedAt && f.approvedAt >= since) push('FOLLOWUP_APPROVED', f, f.followUpId, null, f.approvedAt);
            if (f.deletionRejectionReason && !f.deletionRequestedAt && f.updatedAt >= since) push('FOLLOWUP_DELETE_REJECTED', f, f.followUpId, f.deletionRejectionReason, f.updatedAt);
        }
        for (const f of closures) {
            const self = { id: f.id, finding: { id: f.id, findingId: f.findingId, summary: f.summary } };
            if (f.status === 'CLOSED') push('FINDING_CLOSED', self, f.findingId, null, f.closureDecidedAt);
            else if (f.status !== 'PENDING_REVIEW' && f.closureReturnReason) push('FINDING_CLOSURE_RETURNED', self, f.findingId, f.closureReturnReason, f.closureDecidedAt);
        }
        for (const t of tests) {
            const self = { id: t.id, finding: null }, link = `/controls/testing/${t.id}`;
            if (t.deletedAt && t.deletedAt >= since) { push('TEST_DELETED', self, t.testNo, t.deletionReason, t.deletedAt, link); continue; }
            if (t.deletedAt) continue;
            if (t.status === 'GERI_GONDERILDI') push('TEST_RETURNED', self, t.testNo, t.rejectionReason, t.returnedAt ?? t.updatedAt, link);
            else if (t.status === 'ONAYLANDI' && t.approvedAt && t.approvedAt >= since) push('TEST_APPROVED', self, t.testNo, null, t.approvedAt, link);
            if (t.deletionRejectionReason && !t.deletionRequestedAt && t.updatedAt >= since) push('TEST_DELETE_REJECTED', self, t.testNo, t.deletionRejectionReason, t.updatedAt, link);
        }
        for (const f of deletedFindings) {
            const self = { id: f.id, finding: { id: f.id, findingId: f.findingId, summary: f.summary } };
            if (f.deletedAt && f.deletedAt >= since) push('FINDING_DELETED', self, f.findingId, f.deletionReason, f.deletedAt);
            else if (f.deletionRejectionReason && !f.deletionRequestedAt && f.updatedAt >= since) push('FINDING_DELETE_REJECTED', self, f.findingId, f.deletionRejectionReason, f.updatedAt);
        }
        return items.sort((a, b) => +new Date(b.date) - +new Date(a.date));
    }
}
