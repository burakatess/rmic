import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class RiskProposalsService {
    constructor(private prisma: PrismaService) {}

    async create(
        dto: { findingId?: string; directorateId?: string; riskTanimi: string },
        userId: string,
    ) {
        if (!dto.riskTanimi || dto.riskTanimi.trim().length < 10) {
            throw new BadRequestException('Risk tanımı en az 10 karakter olmalıdır.');
        }
        const proposal = await this.prisma.riskProposal.create({
            data: {
                findingId: dto.findingId || null,
                directorateId: dto.directorateId || null,
                riskTanimi: dto.riskTanimi.trim(),
                requestedById: userId,
                status: 'PENDING',
            },
            include: {
                finding: { select: { id: true, findingId: true, summary: true } },
                directorate: { select: { id: true, name: true } },
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'RiskProposal', entityId: proposal.id, newValue: { riskTanimi: dto.riskTanimi } },
        });

        return proposal;
    }

    async findAll(status?: string) {
        return this.prisma.riskProposal.findMany({
            where: status ? { status: status as any } : {},
            include: {
                finding: { select: { id: true, findingId: true, summary: true, severity: true } },
                directorate: { select: { id: true, name: true } },
                requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
            orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        });
    }

    async findMine(userId: string) {
        return this.prisma.riskProposal.findMany({
            where: { requestedById: userId },
            include: {
                finding: { select: { id: true, findingId: true, summary: true } },
                directorate: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async approve(id: string, userId: string) {
        const proposal = await this.prisma.riskProposal.findUnique({ where: { id } });
        if (!proposal) throw new NotFoundException('Talep bulunamadı');
        if (proposal.status !== 'PENDING') throw new BadRequestException('Talep zaten sonuçlandırılmış.');

        const updated = await this.prisma.riskProposal.update({
            where: { id },
            data: { status: 'APPROVED', reviewedById: userId, reviewedAt: new Date() },
        });
        await this.prisma.auditLog.create({
            data: { userId, action: 'APPROVE', entityType: 'RiskProposal', entityId: id },
        });
        return updated;
    }

    async reject(id: string, reviewNote: string, userId: string) {
        const proposal = await this.prisma.riskProposal.findUnique({ where: { id } });
        if (!proposal) throw new NotFoundException('Talep bulunamadı');
        if (proposal.status !== 'PENDING') throw new BadRequestException('Talep zaten sonuçlandırılmış.');

        const updated = await this.prisma.riskProposal.update({
            where: { id },
            data: { status: 'REJECTED', reviewedById: userId, reviewedAt: new Date(), reviewNote: reviewNote || null },
        });
        await this.prisma.auditLog.create({
            data: { userId, action: 'REJECT', entityType: 'RiskProposal', entityId: id, newValue: { reviewNote } },
        });
        return updated;
    }
}
