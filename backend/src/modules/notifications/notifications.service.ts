import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { ApprovalsService, DecisionKind, PendingKind } from '../approvals/approvals.service';

export interface NotificationItem {
    id: string;
    type: 'OVERDUE_ACTION' | 'UPCOMING_FOLLOWUP' | 'NEW_FINDING' | 'APPROVAL_PENDING' | 'APPROVAL_DECISION';
    title: string;
    message: string;
    date: Date;
    link: string;
}

/**
 * Bildirimler kalıcı bir tabloda tutulmuyor — kullanıcının o an için ilgili
 * olan durumu (gecikmiş aksiyon, yaklaşan takip, yeni atanmış bulgu) her
 * istekte gerçek veriden hesaplanıyor. Böylece "okunmadı" durumu asla
 * gerçekle çelişmez (ör. bir aksiyon kapatıldığında bildirim de anında kaybolur).
 */
const PENDING_TITLE: Record<PendingKind, string> = {
    ACTION_APPROVAL: 'Onayınızı bekleyen aksiyon',
    ACTION_DELETION: 'Onayınızı bekleyen aksiyon silme talebi',
    FOLLOWUP_APPROVAL: 'Onayınızı bekleyen takip çalışması',
    FOLLOWUP_DELETION: 'Onayınızı bekleyen takip silme talebi',
    FINDING_CLOSURE: 'Onayınızı bekleyen bulgu kapanış değerlendirmesi',
    FINDING_DELETION: 'Onayınızı bekleyen bulgu silme talebi',
};

const DECISION_TITLE: Record<DecisionKind, string> = {
    ACTION_REJECTED: 'Aksiyonunuz reddedildi',
    ACTION_APPROVED: 'Aksiyonunuz onaylandı',
    ACTION_REVERTED: 'Aksiyon onayı geri alındı',
    ACTION_DELETED: 'Aksiyon silme talebiniz onaylandı',
    ACTION_DELETE_REJECTED: 'Aksiyon silme talebiniz reddedildi',
    FOLLOWUP_REJECTED: 'Takip çalışmanız reddedildi',
    FOLLOWUP_APPROVED: 'Takip çalışmanız onaylandı',
    FOLLOWUP_REVERTED: 'Takip onayı geri alındı',
    FOLLOWUP_DELETED: 'Takip silme talebiniz onaylandı',
    FOLLOWUP_DELETE_REJECTED: 'Takip silme talebiniz reddedildi',
    FINDING_CLOSED: 'Bulgu kapanışı onaylandı',
    FINDING_CLOSURE_RETURNED: 'Bulgu kapanışı iade edildi',
    FINDING_DELETED: 'Bulgu silme talebiniz onaylandı',
    FINDING_DELETE_REJECTED: 'Bulgu silme talebiniz reddedildi',
    TEST_RETURNED: 'Kontrol testiniz düzeltme için geri gönderildi',
    TEST_APPROVED: 'Kontrol testiniz onaylandı',
    TEST_DELETED: 'Kontrol testi silme talebiniz onaylandı',
    TEST_DELETE_REJECTED: 'Kontrol testi silme talebiniz reddedildi',
};

@Injectable()
export class NotificationsService {
    constructor(private prisma: PrismaService, private approvals: ApprovalsService) { }

    async getForUser(userId: string): Promise<NotificationItem[]> {
        const now = new Date();
        const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const [overdueActions, upcomingFollowUps, recentFindings, pendingApprovals, decisions] = await Promise.all([
            this.prisma.action.findMany({
                where: {
                    ownerId: userId,
                    status: { notIn: ['TAMAMLANDI', 'KAPATILDI'] as any },
                    dueDate: { lt: now },
                },
                select: { id: true, actionId: true, description: true, dueDate: true },
                orderBy: { dueDate: 'asc' },
                take: 20,
            }),
            this.prisma.findingFollowUp.findMany({
                where: {
                    status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR'] as any },
                    plannedDate: { gte: now, lte: in3Days },
                    OR: [
                        { assigneeId: userId },
                        { finding: { assigneeId: userId } },
                        { action: { ownerId: userId } },
                    ],
                },
                select: {
                    id: true, followUpId: true, plannedDate: true,
                    finding: { select: { id: true, findingId: true, summary: true } },
                },
                orderBy: { plannedDate: 'asc' },
                take: 20,
            }),
            this.prisma.finding.findMany({
                where: {
                    assigneeId: userId,
                    status: { not: 'CLOSED' },
                    createdAt: { gte: last7Days },
                },
                select: { id: true, findingId: true, summary: true, description: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 20,
            }),
            this.approvals.pendingFor(userId),
            this.approvals.decisionsFor(userId),
        ]);

        const items: NotificationItem[] = [
            ...overdueActions.map((a) => ({
                id: `action-${a.id}`,
                type: 'OVERDUE_ACTION' as const,
                title: 'Gecikmiş aksiyon',
                message: `${a.actionId}: ${a.description}`.slice(0, 140),
                date: a.dueDate,
                link: `/actions/${a.id}`,
            })),
            ...upcomingFollowUps.map((fu) => ({
                id: `followup-${fu.id}`,
                type: 'UPCOMING_FOLLOWUP' as const,
                title: 'Yaklaşan takip çalışması',
                message: `${fu.followUpId}: ${fu.finding?.summary || fu.finding?.findingId || ''}`.slice(0, 140),
                date: fu.plannedDate!,
                link: fu.finding ? `/findings/${fu.finding.id}` : '/follow-ups',
            })),
            ...recentFindings.map((f) => ({
                id: `finding-${f.id}`,
                type: 'NEW_FINDING' as const,
                title: 'Size atanan yeni bulgu',
                message: `${f.findingId}: ${f.summary || f.description}`.slice(0, 140),
                date: f.createdAt,
                link: `/findings/${f.id}`,
            })),
            ...pendingApprovals.slice(0, 30).map((p) => ({
                id: `approval-${p.kind}-${p.recordId}`,
                type: 'APPROVAL_PENDING' as const,
                title: PENDING_TITLE[p.kind],
                message: `${p.code} — ${p.finding?.findingId ?? "Manuel aksiyon planı"}${p.requestedBy ? ` (${p.requestedBy.name})` : ''}`.slice(0, 140),
                date: p.requestedAt,
                link: p.link,
            })),
            ...decisions.slice(0, 30).map((d) => ({
                id: `decision-${d.kind}-${d.recordId}`,
                type: 'APPROVAL_DECISION' as const,
                title: DECISION_TITLE[d.kind],
                message: `${d.code}${d.reason ? `: ${d.reason}` : ''}`.slice(0, 140),
                date: d.date,
                link: d.link,
            })),
        ];

        return items.sort((a, b) => +new Date(b.date) - +new Date(a.date));
    }
}
