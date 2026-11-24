import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { CreateDirectorateDto, UpdateDirectorateDto } from './dto/directorate.dto';

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

    async create(data: CreateDirectorateDto, userId?: string) {
        return this.prisma.$transaction(async (tx) => {
            const created = await tx.directorate.create({
                data: { name: data.name.trim(), code: data.code?.trim() || null, gmy: data.gmy?.trim() || null, isActive: true },
            }).catch(e => this.rethrowUnique(e));
            await this.audit(userId, 'CREATE', created.id, undefined, created, tx);
            return created;
        });
    }

    async update(id: string, data: UpdateDirectorateDto, userId?: string) {
        const existing = await this.prisma.directorate.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Direktörlük bulunamadı');
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.directorate.update({
                where: { id },
                data: {
                    ...(data.name !== undefined && { name: data.name.trim() }),
                    ...(data.code !== undefined && { code: data.code.trim() || null }),
                    ...(data.gmy !== undefined && { gmy: data.gmy.trim() || null }),
                    ...(data.isActive !== undefined && { isActive: data.isActive }),
                },
            }).catch(e => this.rethrowUnique(e));
            await this.audit(userId, 'UPDATE', id, existing, updated, tx);
            return updated;
        });
    }

    async delete(id: string, userId?: string) {
        const existing = await this.prisma.directorate.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Direktörlük bulunamadı');
        // Soft delete — sadece pasif yap
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.directorate.update({ where: { id }, data: { isActive: false } });
            await this.audit(userId, 'DEACTIVATE', id, existing, updated, tx);
            return updated;
        });
    }

    /** Ad/kod tekil — Prisma P2002 kullanıcıya okunur mesaj olarak döner. */
    private rethrowUnique(e: unknown): never {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            throw new BadRequestException('Aynı ad veya kodla bir direktörlük zaten var.');
        }
        throw e;
    }

    /** Denetim kaydı ana işlemle AYNI işlemde yazılır (db = işlem istemcisi). */
    private async audit(userId: string | undefined, action: string, entityId: string, oldValue?: unknown, newValue?: unknown, db: Prisma.TransactionClient | PrismaService = this.prisma) {
        if (!userId) return;
        await db.auditLog.create({
            data: { userId, action, entityType: 'Directorate', entityId, oldValue: oldValue as Prisma.InputJsonValue, newValue: newValue as Prisma.InputJsonValue },
        });
    }
}
