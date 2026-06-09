import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class RiskControlsService {
    constructor(private prisma: PrismaService) {}

    private generateKontrolId(): string {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `RC-${year}-${random}`;
    }

    async findAll(query: any = {}) {
        const { search, status, riskId, page = 1, limit = 50 } = query;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (status) where.status = status;
        if (search) {
            where.OR = [
                { kontrolId: { contains: search, mode: 'insensitive' } },
                { kontrolTanimi: { contains: search, mode: 'insensitive' } },
                { ilgiliGmy: { contains: search, mode: 'insensitive' } },
                { surec: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (riskId) {
            where.risks = { some: { riskId } };
        }

        const [data, total] = await Promise.all([
            this.prisma.riskControl.findMany({
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
                                    dogalRiskSeviyesi: true,
                                    kalintiRiskSeviyesi: true,
                                },
                            },
                        },
                    },
                    actions: {
                        select: {
                            id: true,
                            aksiyonId: true,
                            status: true,
                            aksiyonTanimi: true,
                        },
                    },
                    _count: { select: { risks: true, actions: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.riskControl.count({ where }),
        ]);

        return { data, total, page: Number(page), limit: Number(limit) };
    }

    async findOne(id: string) {
        const rc = await this.prisma.riskControl.findUnique({
            where: { id },
            include: {
                risks: {
                    include: {
                        risk: true,
                    },
                },
                actions: true,
            },
        });
        if (!rc) throw new NotFoundException('Kontrol bulunamadı');
        return rc;
    }

    async create(data: any) {
        const kontrolId = await this.generateUniqueKontrolId();
        const { riskIds, ...rest } = data;

        const created = await this.prisma.riskControl.create({
            data: {
                ...rest,
                kontrolId,
                risks: riskIds?.length
                    ? { create: riskIds.map((rId: string) => ({ riskId: rId })) }
                    : undefined,
            },
            include: {
                risks: { include: { risk: true } },
                actions: true,
            },
        });
        return created;
    }

    async update(id: string, data: any) {
        const { riskIds, ...rest } = data;
        await this.findOne(id);

        const updated = await this.prisma.riskControl.update({
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
                actions: true,
            },
        });
        return updated;
    }

    async delete(id: string) {
        await this.findOne(id);
        await this.prisma.riskControl.update({
            where: { id },
            data: { status: 'PASIF' },
        });
        return { message: 'Kontrol pasifleştirildi' };
    }

    async linkRisk(kontrolId: string, riskId: string) {
        const rc = await this.prisma.riskControl.findUnique({ where: { id: kontrolId } });
        if (!rc) throw new NotFoundException('Kontrol bulunamadı');

        await this.prisma.riskControlRisk.upsert({
            where: { riskId_riskControlId: { riskId, riskControlId: kontrolId } },
            create: { riskId, riskControlId: kontrolId },
            update: {},
        });
        return { message: 'Risk bağlantısı oluşturuldu' };
    }

    async unlinkRisk(kontrolId: string, riskId: string) {
        await this.prisma.riskControlRisk.deleteMany({
            where: { riskControlId: kontrolId, riskId },
        });
        return { message: 'Risk bağlantısı kaldırıldı' };
    }

    private async generateUniqueKontrolId(): Promise<string> {
        let id: string;
        let exists = true;
        do {
            id = this.generateKontrolId();
            const found = await this.prisma.riskControl.findUnique({ where: { kontrolId: id } });
            exists = !!found;
        } while (exists);
        return id;
    }
}
