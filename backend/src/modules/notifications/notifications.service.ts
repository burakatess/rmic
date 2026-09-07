import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';

export interface NotificationItem {
    id: string;
    type: 'OVERDUE_ACTION' | 'UPCOMING_FOLLOWUP' | 'NEW_FINDING';
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
@Injectable()
export class NotificationsService {
    constructor(private prisma: PrismaService) { }

    async getForUser(userId: string): Promise<NotificationItem[]> {
        const now = new Date();
        const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const [overdueActions, upcomingFollowUps, recentFindings] = await Promise.all([
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
        ];

        return items.sort((a, b) => +new Date(b.date) - +new Date(a.date));
    }
}
