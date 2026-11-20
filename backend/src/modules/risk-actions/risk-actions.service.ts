import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { assertAllExist, definedOnly, toDateField } from '../../common/util/dto-mapping';
import { CreateRiskActionDto, UpdateRiskActionDto } from './dto/risk-action.dto';

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

    async create(data: CreateRiskActionDto, userId: string) {
        const aksiyonId = await this.generateUniqueAksiyonId();
        const riskIds = await this.validateRefs(data);
        const created = await this.prisma.riskAction.create({
            data: {
                ...this.toData(data),
                aksiyonTanimi: data.aksiyonTanimi,
                aksiyonId,
                risks: riskIds?.length ? { create: riskIds.map(rId => ({ riskId: rId })) } : undefined,
            } as Prisma.RiskActionUncheckedCreateInput,
            include: { risks: { include: { risk: true } }, riskControl: true },
        });
        await this.prisma.auditLog.create({ data: { userId, action: 'CREATE', entityType: 'RiskAction', entityId: created.id, newValue: { aksiyonId, riskIds: riskIds ?? [] } } }).catch(() => undefined);
        return created;
    }

    async update(id: string, data: UpdateRiskActionDto, userId: string) {
        const existing = await this.findOne(id);
        const riskIds = await this.validateRefs(data);
        const updated = await this.prisma.riskAction.update({
            where: { id },
            data: {
                ...this.toData(data),
                ...(riskIds !== undefined && { risks: { deleteMany: {}, create: riskIds.map(rId => ({ riskId: rId })) } }),
            } as Prisma.RiskActionUncheckedUpdateInput,
            include: { risks: { include: { risk: true } }, riskControl: true },
        });
        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'RiskAction', entityId: id, oldValue: { status: existing.status, riskIds: existing.risks.map(r => r.riskId) }, newValue: definedOnly({ ...data }) as Prisma.InputJsonValue },
        }).catch(() => undefined);
        return updated;
    }

    /** DTO → Prisma alanları (tarih dönüşümü; undefined alan dokunulmaz). */
    private toData(d: UpdateRiskActionDto) {
        return definedOnly({
            aksiyonTanimi: d.aksiyonTanimi, status: d.status, kayitId: d.kayitId,
            aksiyonSahibi: d.aksiyonSahibi, aksiyonSorumlusu: d.aksiyonSorumlusu, atanan: d.atanan, ilgiliGmy: d.ilgiliGmy,
            ozet: d.ozet, potaNo: d.potaNo, bulgReferansNo: d.bulgReferansNo,
            mutabakatTarihi: toDateField(d.mutabakatTarihi),
            hedeflenenTamamlanmaTarihi: toDateField(d.hedeflenenTamamlanmaTarihi),
            tamamlanmaTarihi: toDateField(d.tamamlanmaTarihi),
            riskControlId: d.riskControlId === undefined ? undefined : (d.riskControlId || null),
        });
    }

    /** FK doğrulaması: bağlı kontrol ve riskler var olmalı. */
    private async validateRefs(d: UpdateRiskActionDto) {
        if (d.riskControlId) {
            const rc = await this.prisma.riskControl.findUnique({ where: { id: d.riskControlId }, select: { id: true } });
            if (!rc) throw new BadRequestException('Geçersiz kontrol: seçilen risk kontrolü bulunamadı');
        }
        return assertAllExist(ids => this.prisma.risk.count({ where: { id: { in: ids } } }), d.riskIds, 'risk');
    }

    // Bağımlılığı olmayan kayıt fiziksel olarak silinir; bağımlılık varsa 409
    // ile açık gerekçe döner (Risk Yönetimi kayıt silme politikası — madde 2).
    async delete(id: string, userId: string) {
        const ra = await this.prisma.riskAction.findUnique({
            where: { id },
            include: { risks: { include: { risk: { select: { riskId: true } } } } },
        });
        if (!ra) throw new NotFoundException('Aksiyon bulunamadı');
        if (ra.risks.length > 0) {
            throw new ConflictException(
                `Bu aksiyon ${ra.risks.length} riske bağlı (${ra.risks.map(r => r.risk.riskId).join(', ')}). Önce risk bağlantılarını kaldırın.`,
            );
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.auditLog.create({
                data: { userId, action: 'DELETE', entityType: 'RiskAction', entityId: ra.id, oldValue: ra as any },
            });
            await tx.riskAction.delete({ where: { id } });
        });
        return { message: 'Aksiyon silindi' };
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
