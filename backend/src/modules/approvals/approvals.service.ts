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
export type PendingKind = 'ACTION_APPROVAL' | 'ACTION_DELETION' | 'FOLLOWUP_APPROVAL' | 'FOLLOWUP_DELETION';
export type DecisionKind =
    | 'ACTION_REJECTED' | 'ACTION_APPROVED' | 'ACTION_REVERTED' | 'ACTION_DELETED' | 'ACTION_DELETE_REJECTED'
    | 'FOLLOWUP_REJECTED' | 'FOLLOWUP_APPROVED' | 'FOLLOWUP_REVERTED' | 'FOLLOWUP_DELETED' | 'FOLLOWUP_DELETE_REJECTED';

export interface PendingApprovalItem {
    kind: PendingKind;
    recordId: string;
    code: string;
    description: string | null;
    finding: { id: string; findingId: string; summary: string | null };
    requestedBy: { id: string; name: string } | null;
    requestedAt: Date;
    reason: string | null;
    link: string;
}

export interface ApprovalDecisionItem {
    kind: DecisionKind;
    recordId: string;
    code: string;
    finding: { id: string; findingId: string; summary: string | null };
    reason: string | null;
    date: Date;
    link: string;
}

const RECENT_DAYS = 7;
const LIMIT = 200;

const findingSelect = { select: { id: true, findingId: true, summary: true } } as const;
const userName = (u?: { id: string; firstName: string | null; lastName: string | null } | null) =>
    u ? { id: u.id, name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || '—' } : null;

@Injectable()
export class ApprovalsService {
    constructor(private prisma: PrismaService) { }

    /** İkinci kontrolcü olarak kararımı bekleyen işler (en eski talep önce). */
    async pendingFor(userId: string): Promise<PendingApprovalItem[]> {
        const [actionApprovals, actionDeletions, fuApprovals, fuDeletions] = await Promise.all([
            this.prisma.action.findMany({
                where: { secondControllerId: userId, approvalState: 'ONAY_BEKLIYOR', deletedAt: null },
                select: {
                    id: true, actionId: true, description: true, submittedAt: true, updatedAt: true, finding: findingSelect,
                    firstController: { select: { id: true, firstName: true, lastName: true } },
                },
                take: LIMIT,
            }),
            this.prisma.action.findMany({
                where: { secondControllerId: userId, deletionRequestedAt: { not: null }, deletedAt: null },
                select: { id: true, actionId: true, description: true, deletionRequestedAt: true, deletionRequestedById: true, deletionReason: true, finding: findingSelect },
                take: LIMIT,
            }),
            this.prisma.findingFollowUp.findMany({
                where: { secondControllerId: userId, status: 'TAMAMLANDI', approvalStatus: 'BEKLIYOR', result: { not: null }, deletedAt: null },
                select: { id: true, followUpId: true, explanation: true, evaluatorId: true, evaluatedAt: true, updatedAt: true, result: true, finding: findingSelect },
                take: LIMIT,
            }),
            this.prisma.findingFollowUp.findMany({
                where: { secondControllerId: userId, deletionRequestedAt: { not: null }, deletedAt: null },
                select: { id: true, followUpId: true, deletionRequestedAt: true, deletionRequestedById: true, deletionReason: true, finding: findingSelect },
                take: LIMIT,
            }),
        ]);

        const requesterIds = [...new Set([
            ...actionDeletions.map(a => a.deletionRequestedById),
            ...fuApprovals.map(f => f.evaluatorId),
            ...fuDeletions.map(f => f.deletionRequestedById),
        ].filter((x): x is string => !!x))];
        const users = requesterIds.length
            ? await this.prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, firstName: true, lastName: true } })
            : [];
        const byId = new Map(users.map(u => [u.id, userName(u)]));
        const link = (findingId: string) => `/findings/${findingId}`;

        const items: PendingApprovalItem[] = [
            ...actionApprovals.map(a => ({
                kind: 'ACTION_APPROVAL' as const, recordId: a.id, code: a.actionId, description: a.description,
                finding: a.finding, requestedBy: userName(a.firstController), requestedAt: a.submittedAt ?? a.updatedAt,
                reason: null, link: link(a.finding.id),
            })),
            ...actionDeletions.map(a => ({
                kind: 'ACTION_DELETION' as const, recordId: a.id, code: a.actionId, description: a.description,
                finding: a.finding, requestedBy: (a.deletionRequestedById && byId.get(a.deletionRequestedById)) || null,
                requestedAt: a.deletionRequestedAt!, reason: a.deletionReason, link: link(a.finding.id),
            })),
            ...fuApprovals.map(f => ({
                kind: 'FOLLOWUP_APPROVAL' as const, recordId: f.id, code: f.followUpId, description: f.explanation,
                finding: f.finding, requestedBy: (f.evaluatorId && byId.get(f.evaluatorId)) || null,
                requestedAt: f.evaluatedAt ?? f.updatedAt, reason: null, link: link(f.finding.id),
            })),
            ...fuDeletions.map(f => ({
                kind: 'FOLLOWUP_DELETION' as const, recordId: f.id, code: f.followUpId, description: null,
                finding: f.finding, requestedBy: (f.deletionRequestedById && byId.get(f.deletionRequestedById)) || null,
                requestedAt: f.deletionRequestedAt!, reason: f.deletionReason, link: link(f.finding.id),
            })),
        ];
        return items.sort((a, b) => +new Date(a.requestedAt) - +new Date(b.requestedAt));
    }

    async pendingCount(userId: string): Promise<number> {
        const [a, b, c, d] = await Promise.all([
            this.prisma.action.count({ where: { secondControllerId: userId, approvalState: 'ONAY_BEKLIYOR', deletedAt: null } }),
            this.prisma.action.count({ where: { secondControllerId: userId, deletionRequestedAt: { not: null }, deletedAt: null } }),
            this.prisma.findingFollowUp.count({ where: { secondControllerId: userId, status: 'TAMAMLANDI', approvalStatus: 'BEKLIYOR', result: { not: null }, deletedAt: null } }),
            this.prisma.findingFollowUp.count({ where: { secondControllerId: userId, deletionRequestedAt: { not: null }, deletedAt: null } }),
        ]);
        return a + b + c + d;
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
        const [actions, fus] = await Promise.all([
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
                take: LIMIT,
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
                take: LIMIT,
            }),
        ]);

        const items: ApprovalDecisionItem[] = [];
        const push = (kind: DecisionKind, r: { id: string; finding: any }, code: string, reason: string | null, date: Date | null) =>
            date && items.push({ kind, recordId: r.id, code, finding: r.finding, reason, date, link: `/findings/${r.finding.id}` });

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
        return items.sort((a, b) => +new Date(b.date) - +new Date(a.date));
    }
}
