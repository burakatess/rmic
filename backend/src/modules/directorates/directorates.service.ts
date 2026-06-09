import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class DirectoratesService {
    constructor(private prisma: PrismaService) {}

    async findAll(query?: { isActive?: string }) {
        const where: any = {};
        if (query?.isActive === 'true') where.isActive = true;
        if (query?.isActive === 'false') where.isActive = false;

        return this.prisma.directorate.findMany({
            where,
            orderBy: { name: 'asc' },
            include: {
                _count: { select: { controls: true, findings: true, actions: true } },
            },
        });
    }

    async findOne(id: string) {
        const d = await this.prisma.directorate.findUnique({
            where: { id },
            include: {
                controls: { select: { id: true, controlId: true, name: true, status: true }, take: 20 },
                findings: { select: { id: true, findingId: true, severity: true, resolutionStatus: true }, take: 20 },
                _count: { select: { controls: true, findings: true, actions: true, followUps: true } },
            },
        });
        if (!d) throw new NotFoundException(`Directorate ${id} not found`);
        return d;
    }

    async create(data: { name: string; code?: string; gmy?: string }, userId?: string) {
        return this.prisma.directorate.create({
            data: {
                name: data.name,
                code: data.code || null,
                gmy: data.gmy || null,
                isActive: true,
            },
        });
    }

    async update(id: string, data: Partial<{ name: string; code: string; gmy: string; isActive: boolean }>) {
        return this.prisma.directorate.update({
            where: { id },
            data,
        });
    }

    async delete(id: string) {
        // Soft delete — sadece pasif yap
        return this.prisma.directorate.update({
            where: { id },
            data: { isActive: false },
        });
    }
}
