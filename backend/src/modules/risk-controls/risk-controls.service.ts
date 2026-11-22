import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { assertAllExist, definedOnly, toDateField } from '../../common/util/dto-mapping';
import { CreateRiskControlDto, UpdateRiskControlDto } from './dto/risk-control.dto';

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

    async create(data: CreateRiskControlDto, userId: string) {
        const kontrolId = await this.generateUniqueKontrolId();
        const riskIds = await assertAllExist(ids => this.prisma.risk.count({ where: { id: { in: ids } } }), data.riskIds, 'risk');
        return this.prisma.$transaction(async (tx) => {
            const created = await tx.riskControl.create({
                data: {
                    ...this.toData(data),
                    kontrolTanimi: data.kontrolTanimi,
                    kontrolId,
                    risks: riskIds?.length ? { create: riskIds.map(rId => ({ riskId: rId })) } : undefined,
                } as Prisma.RiskControlUncheckedCreateInput,
                include: { risks: { include: { risk: true } }, actions: true },
            });
            await tx.auditLog.create({ data: { userId, action: 'CREATE', entityType: 'RiskControl', entityId: created.id, newValue: { kontrolId, riskIds: riskIds ?? [] } } });
            return created;
        });
    }

    async update(id: string, data: UpdateRiskControlDto, userId: string) {
        const existing = await this.findOne(id);
        const riskIds = await assertAllExist(ids => this.prisma.risk.count({ where: { id: { in: ids } } }), data.riskIds, 'risk');
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.riskControl.update({
                where: { id },
                data: {
                    ...this.toData(data),
                    ...(riskIds !== undefined && { risks: { deleteMany: {}, create: riskIds.map(rId => ({ riskId: rId })) } }),
                } as Prisma.RiskControlUncheckedUpdateInput,
                include: { risks: { include: { risk: true } }, actions: true },
            });
            await tx.auditLog.create({
                data: { userId, action: 'UPDATE', entityType: 'RiskControl', entityId: id, oldValue: { status: existing.status, riskIds: existing.risks.map(r => r.riskId) }, newValue: definedOnly({ ...data }) as Prisma.InputJsonValue },
            });
            return updated;
        });
    }

    /** DTO → Prisma alanları (tarih dönüşümü; undefined alan dokunulmaz). */
    private toData(d: UpdateRiskControlDto) {
        const { riskIds: _r, mutabakatTarihi, ...rest } = d;
        return definedOnly({ ...rest, mutabakatTarihi: toDateField(mutabakatTarihi) });
    }

    // Bağımlılığı olmayan kayıt fiziksel olarak silinir; bağımlılık varsa 409
    // ile açık gerekçe döner (Risk Yönetimi kayıt silme politikası — madde 2).
    async delete(id: string, userId: string) {
        const rc = await this.prisma.riskControl.findUnique({
            where: { id },
            include: {
                risks: { include: { risk: { select: { riskId: true } } } },
                actions: { select: { id: true, aksiyonId: true } },
            },
        });
        if (!rc) throw new NotFoundException('Kontrol bulunamadı');
        if (rc.risks.length > 0) {
            throw new ConflictException(
                `Bu kontrol ${rc.risks.length} riske bağlı (${rc.risks.map(r => r.risk.riskId).join(', ')}). Önce risk bağlantılarını kaldırın.`,
            );
        }
        if (rc.actions.length > 0) {
            throw new ConflictException(
                `Bu kontrole bağlı ${rc.actions.length} aksiyon var (${rc.actions.map(a => a.aksiyonId).join(', ')}). Önce bu aksiyonları kaldırın.`,
            );
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.auditLog.create({
                data: { userId, action: 'DELETE', entityType: 'RiskControl', entityId: rc.id, oldValue: rc as any },
            });
            await tx.riskControl.delete({ where: { id } });
        });
        return { message: 'Kontrol silindi' };
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
