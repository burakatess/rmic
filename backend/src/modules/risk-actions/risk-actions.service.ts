import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class RiskActionsService {
    constructor(private prisma: PrismaService) {}

    private generateAksiyonId(): string {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `RA-${year}-${random}`;
    }

    async findAll(query: any = {}) {
        const { search, status, riskId, riskControlId, page = 1, limit = 50 } = query;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (status) where.status = status;
        if (riskControlId) where.riskControlId = riskControlId;
        if (riskId) where.risks = { some: { riskId } };
        if (search) {
            where.OR = [
                { aksiyonId: { contains: search, mode: 'insensitive' } },
                { aksiyonTanimi: { contains: search, mode: 'insensitive' } },
                { aksiyonSahibi: { contains: search, mode: 'insensitive' } },
                { potaNo: { contains: search, mode: 'insensitive' } },
                { bulgReferansNo: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [data, total] = await Promise.all([
            this.prisma.riskAction.findMany({
                where,
                skip,
                take: Number(limit),
                include: {
                    risks: {
                        include: {
                            risk: {
                                select: {
                                    id: true,
                                    riskId: true,
                                    name: true,
                                    ilgiliGmy: true,
                                    dogalRiskSeviyesi: true,
                                },
                            },
                        },
                    },
                    riskControl: {
                        select: {
                            id: true,
                            kontrolId: true,
                            kontrolTanimi: true,
                        },
                    },
                    _count: { select: { risks: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.riskAction.count({ where }),
        ]);

        return { data, total, page: Number(page), limit: Number(limit) };
    }

    async findOne(id: string) {
        const ra = await this.prisma.riskAction.findUnique({
            where: { id },
            include: {
                risks: { include: { risk: true } },
                riskControl: true,
            },
        });
        if (!ra) throw new NotFoundException('Aksiyon bulunamadı');
        return ra;
    }

    async create(data: any) {
        const aksiyonId = await this.generateUniqueAksiyonId();
        const { riskIds, ...rest } = data;

        const created = await this.prisma.riskAction.create({
            data: {
                ...rest,
                aksiyonId,
                risks: riskIds?.length
                    ? { create: riskIds.map((rId: string) => ({ riskId: rId })) }
                    : undefined,
            },
            include: {
                risks: { include: { risk: true } },
                riskControl: true,
            },
        });
        return created;
    }

    async update(id: string, data: any) {
        const { riskIds, ...rest } = data;
        await this.findOne(id);

        const updated = await this.prisma.riskAction.update({
            where: { id },
            data: {
                ...rest,
                ...(riskIds !== undefined && {
                    risks: {
                        deleteMany: {},
                        create: riskIds.map((rId: string) => ({ riskId: rId })),
                    },
                }),
            },
            include: {
                risks: { include: { risk: true } },
                riskControl: true,
            },
        });
        return updated;
    }

    async delete(id: string) {
        await this.findOne(id);
        await this.prisma.riskAction.update({
            where: { id },
            data: { status: 'IPTAL' },
        });
        return { message: 'Aksiyon iptal edildi' };
    }

    async linkRisk(aksiyonId: string, riskId: string) {
        const ra = await this.prisma.riskAction.findUnique({ where: { id: aksiyonId } });
        if (!ra) throw new NotFoundException('Aksiyon bulunamadı');

        await this.prisma.riskActionRisk.upsert({
            where: { riskId_riskActionId: { riskId, riskActionId: aksiyonId } },
            create: { riskId, riskActionId: aksiyonId },
            update: {},
        });
        return { message: 'Risk bağlantısı oluşturuldu' };
    }

    async unlinkRisk(aksiyonId: string, riskId: string) {
        await this.prisma.riskActionRisk.deleteMany({
            where: { riskActionId: aksiyonId, riskId },
        });
        return { message: 'Risk bağlantısı kaldırıldı' };
    }

    private async generateUniqueAksiyonId(): Promise<string> {
        let id: string;
        let exists = true;
        do {
            id = this.generateAksiyonId();
            const found = await this.prisma.riskAction.findUnique({ where: { aksiyonId: id } });
            exists = !!found;
        } while (exists);
        return id;
    }
}
