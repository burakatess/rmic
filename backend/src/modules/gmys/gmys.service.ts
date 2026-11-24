import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { CreateGmyDto, UpdateGmyDto } from './dto/gmy.dto';

const LIST_SELECT = {
    id: true, name: true, code: true, isActive: true,
    responsibleUser: { select: { id: true, firstName: true, lastName: true } },
    _count: { select: { directorates: true, risks: true } },
} satisfies Prisma.GmySelect;

@Injectable()
export class GmysService {
    constructor(private prisma: PrismaService) { }

    /** Seçim listeleri için: varsayılan yalnız aktif GMY'ler. */
    findAll(includeInactive = false) {
        return this.prisma.gmy.findMany({
            where: includeInactive ? {} : { isActive: true },
            select: LIST_SELECT,
            orderBy: { name: 'asc' },
        });
    }

    async create(dto: CreateGmyDto, userId: string) {
        if (dto.responsibleUserId) await this.assertActiveUser(dto.responsibleUserId);
        // GMY + denetim kaydı tek işlemde.
        return this.write(() => this.prisma.$transaction(async (tx) => {
            const created = await tx.gmy.create({
                data: { name: dto.name.trim(), code: dto.code?.trim() || null, responsibleUserId: dto.responsibleUserId || null },
                select: LIST_SELECT,
            });
            await this.log(userId, 'CREATE', created.id, null, created, tx);
            return created;
        }));
    }

    async update(id: string, dto: UpdateGmyDto, userId: string) {
        const existing = await this.prisma.gmy.findUnique({ where: { id }, select: LIST_SELECT });
        if (!existing) throw new NotFoundException('GMY bulunamadı');
        if (dto.responsibleUserId) await this.assertActiveUser(dto.responsibleUserId);
        const name = dto.name?.trim();
        const updated = await this.write(() => this.prisma.$transaction(async (tx) => {
            const g = await tx.gmy.update({
                where: { id },
                data: {
                    ...(name !== undefined && { name }),
                    ...(dto.code !== undefined && { code: dto.code?.trim() || null }),
                    ...(dto.responsibleUserId !== undefined && { responsibleUserId: dto.responsibleUserId || null }),
                    ...(dto.isActive !== undefined && { isActive: dto.isActive }),
                },
                select: LIST_SELECT,
            });
            // Riskteki GMY adı gösterim kopyasıdır; ad değişince bağlı riskler de güncellenir.
            if (name !== undefined && name !== existing.name) {
                await tx.risk.updateMany({ where: { gmyId: id }, data: { ilgiliGmy: name } });
            }
            await this.log(userId, 'UPDATE', id, existing, g, tx);
            return g;
        }));
        return updated;
    }

    private async assertActiveUser(id: string) {
        const u = await this.prisma.user.findUnique({ where: { id }, select: { isActive: true } });
        if (!u || !u.isActive) throw new BadRequestException('Geçersiz sorumlu: kullanıcı bulunamadı veya pasif');
    }

    private async write<T>(fn: () => Promise<T>): Promise<T> {
        try {
            return await fn();
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new ConflictException('Aynı ad veya kodla tanımlı bir GMY zaten var.');
            }
            throw e;
        }
    }

    /** Denetim kaydı ana işlemle AYNI işlemde yazılır (db = işlem istemcisi). */
    private async log(userId: string, action: string, entityId: string, oldValue: unknown, newValue: unknown, db: Prisma.TransactionClient) {
        await db.auditLog.create({
            data: { userId, action, entityType: 'Gmy', entityId, oldValue: (oldValue ?? undefined) as Prisma.InputJsonValue, newValue: newValue as Prisma.InputJsonValue },
        });
    }
}
