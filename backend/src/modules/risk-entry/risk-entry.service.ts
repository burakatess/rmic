import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, RiskEntryRecordType, RiskEntryStatus, RiskEntryLevel, ControlEffectivenessLevel, RiskTreatmentOption } from '@prisma/client';
import { definedOnly, toDateField } from '../../common/util/dto-mapping';
import { CreateRiskEntryDto, UpdateRiskEntryDto } from './dto/risk-entry.dto';

@Injectable()
export class RiskEntryService {
    constructor(private prisma: PrismaService) { }

    // Generate next Risk ID
    private async generateRiskId(): Promise<string> {
        const year = new Date().getFullYear();
        const prefix = `R-${year}-`;

        const lastEntry = await this.prisma.riskEntry.findFirst({
            where: { riskId: { startsWith: prefix } },
            orderBy: { riskId: 'desc' },
        });

        let nextNumber = 1;
        if (lastEntry) {
            const lastNumber = parseInt(lastEntry.riskId.replace(prefix, ''), 10);
            nextNumber = lastNumber + 1;
        }

        return `${prefix}${String(nextNumber).padStart(4, '0')}`;
    }

    // Calculate weighted impact (Etki)
    private calculateEtki(data: {
        finansalEtki?: number;
        itibarEtkisi?: number;
        regulasyonEtkisi?: number;
        musteriEtkisi?: number;
        flagForIT?: boolean;
        gizlilikEtkisi?: number;
        butunlukEtkisi?: number;
        erisebilirlikEtkisi?: number;
    }): number {
        if (data.flagForIT) {
            // CIA Triad weights for IT risks
            const gizlilik = (data.gizlilikEtkisi || 1) * 0.35;
            const butunluk = (data.butunlukEtkisi || 1) * 0.30;
            const erisebilirlik = (data.erisebilirlikEtkisi || 1) * 0.35;
            return Math.round((gizlilik + butunluk + erisebilirlik) * 100) / 100;
        } else {
            // Business impact weights for non-IT risks
            const finansal = (data.finansalEtki || 1) * 0.30;
            const itibar = (data.itibarEtkisi || 1) * 0.30;
            const regulasyon = (data.regulasyonEtkisi || 1) * 0.20;
            const musteri = (data.musteriEtkisi || 1) * 0.20;
            return Math.round((finansal + itibar + regulasyon + musteri) * 100) / 100;
        }
    }

    // Calculate risk level based on score
    private calculateRiskLevel(score: number): RiskEntryLevel {
        if (score >= 20) return RiskEntryLevel.KRITIK;
        if (score >= 12) return RiskEntryLevel.YUKSEK;
        if (score >= 5) return RiskEntryLevel.ORTA;
        return RiskEntryLevel.DUSUK;
    }

    // Calculate control effectiveness level
    private calculateControlLevel(score: number): ControlEffectivenessLevel {
        if (score >= 4) return ControlEffectivenessLevel.ETKIN;
        if (score >= 2.5) return ControlEffectivenessLevel.KISMEN_ETKIN;
        return ControlEffectivenessLevel.ETKIN_DEGIL;
    }

    // Full calculation for all derived fields
    private calculateFields(data: any) {
        const etki = this.calculateEtki(data);
        const olasilik = data.olasilik || 1;
        const dogalRiskPuani = etki * olasilik;
        const dogalRiskSkoru = Math.round((dogalRiskPuani / 25) * 100); // Normalized to 0-100
        const dogalRiskSeviyesi = this.calculateRiskLevel(dogalRiskPuani);

        const butunlesikKontrolPuani = data.butunlesikKontrolPuani || 1;
        const butunlesikKontrolSkoru = Math.round((butunlesikKontrolPuani / 5) * 100);
        const butunlesikKontrolSeviyesi = this.calculateControlLevel(butunlesikKontrolPuani);

        // Residual risk = Inherent risk adjusted by control effectiveness
        const controlFactor = 1 - (butunlesikKontrolPuani / 5) * 0.6; // Max 60% reduction
        const kalintiRiskPuani = Math.round(dogalRiskPuani * controlFactor * 100) / 100;
        const kalintiRiskSkoru = Math.round((kalintiRiskPuani / 25) * 100);
        const kalintiRiskSeviyesi = this.calculateRiskLevel(kalintiRiskPuani);

        return {
            etki,
            dogalRiskPuani,
            dogalRiskSkoru,
            dogalRiskSeviyesi,
            butunlesikKontrolSkoru,
            butunlesikKontrolSeviyesi,
            kalintiRiskPuani,
            kalintiRiskSkoru,
            kalintiRiskSeviyesi,
        };
    }

    async findAll(query?: any) {
        const { page = 1, limit = 100, status, surec, seviye } = query || {};

        const where: any = {};
        if (status) where.riskStatus = status;
        if (surec) where.surec = { contains: surec, mode: 'insensitive' };
        if (seviye) where.dogalRiskSeviyesi = seviye;

        const [data, total] = await Promise.all([
            this.prisma.riskEntry.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { olusturmaTarihi: 'desc' },
            }),
            this.prisma.riskEntry.count({ where }),
        ]);

        return { data, total, page, limit };
    }

    async findOne(id: string) {
        const entry = await this.prisma.riskEntry.findUnique({ where: { id } });
        if (!entry) throw new NotFoundException('Risk kaydı bulunamadı');
        return entry;
    }

    async create(data: CreateRiskEntryDto, userId: string) {
        const riskId = await this.generateRiskId();
        const calculated = this.calculateFields(data);

        return this.prisma.$transaction(async (tx) => {
            const created = await tx.riskEntry.create({
                data: {
                    riskId,
                    kayitId: data.kayitId || riskId,
                    kayitTipi: data.kayitTipi || RiskEntryRecordType.RISK,
                    riskStatus: data.riskStatus || RiskEntryStatus.AKTIF,
                    riskSahibi: data.riskSahibi,
                    surec: data.surec,
                    altSurec: data.altSurec,
                    riskTanimi: data.riskTanimi,
                    flagForIT: data.flagForIT || false,
                    finansalEtki: data.finansalEtki,
                    itibarEtkisi: data.itibarEtkisi,
                    regulasyonEtkisi: data.regulasyonEtkisi,
                    musteriEtkisi: data.musteriEtkisi,
                    gizlilikEtkisi: data.gizlilikEtkisi,
                    butunlukEtkisi: data.butunlukEtkisi,
                    erisebilirlikEtkisi: data.erisebilirlikEtkisi,
                    olasilik: data.olasilik,
                    butunlesikKontrolPuani: data.butunlesikKontrolPuani,
                    riskIsleme: data.riskIsleme,
                    mutabakatTarihi: toDateField(data.mutabakatTarihi) ?? null,
                    riskSorumlusu: data.riskSorumlusu,
                    atanan: data.atanan,
                    olusturan: userId,
                    kaydiAcan: userId,
                    ...calculated,
                },
            }).catch(e => this.rethrowUnique(e));
            await tx.auditLog.create({ data: { userId, action: 'CREATE', entityType: 'RiskEntry', entityId: created.id, newValue: { riskId, kayitId: created.kayitId } } });
            return created;
        });
    }

    /**
     * Kısmi güncelleme: gönderilmeyen alan DOKUNULMAZ (önceden mutabakat tarihi vb. null'a
     * çekiliyordu). Hesaplanan skorlar mevcut kayıtla birleştirilmiş değerlerden üretilir.
     */
    async update(id: string, data: UpdateRiskEntryDto, userId: string) {
        const existing = await this.prisma.riskEntry.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Risk kaydı bulunamadı');
        const { mutabakatTarihi, ...rest } = data;
        const patch = definedOnly({ ...rest, mutabakatTarihi: toDateField(mutabakatTarihi) });
        const calculated = this.calculateFields({ ...existing, ...patch });

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.riskEntry.update({
                where: { id },
                data: { ...patch, version: { increment: 1 }, ...calculated },
            }).catch(e => this.rethrowUnique(e));
            await tx.auditLog.create({
                data: { userId, action: 'UPDATE', entityType: 'RiskEntry', entityId: id, oldValue: { version: existing.version, dogalRiskPuani: existing.dogalRiskPuani, kalintiRiskPuani: existing.kalintiRiskPuani }, newValue: { ...(patch as object), version: updated.version } as Prisma.InputJsonValue },
            });
            return updated;
        });
    }

    async delete(id: string, userId?: string) {
        const existing = await this.prisma.riskEntry.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Risk kaydı bulunamadı');
        return this.prisma.$transaction(async (tx) => {
            await tx.riskEntry.delete({ where: { id } });
            if (userId) await tx.auditLog.create({ data: { userId, action: 'DELETE', entityType: 'RiskEntry', entityId: id, oldValue: { riskId: existing.riskId, kayitId: existing.kayitId } } });
            return { message: 'Risk kaydı silindi' };
        });
    }

    /** kayitId tekil — Prisma P2002 okunur 400 olarak döner. */
    private rethrowUnique(e: unknown): never {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            throw new BadRequestException('Bu kayıt ID ile bir risk kaydı zaten var.');
        }
        throw e;
    }

    async bulkCreate(entries: CreateRiskEntryDto[], userId: string) {
        const results = [];
        for (const entry of entries) {
            try {
                const created = await this.create(entry, userId);
                results.push({ success: true, data: created });
            } catch (error) {
                // İç hata mesajı istemciye sızdırılmaz; okunur Nest istisnaları korunur.
                const message = error instanceof BadRequestException ? error.message : 'Kayıt oluşturulamadı';
                results.push({ success: false, error: message, data: entry });
            }
        }
        return results;
    }

    // Sync selected entries to Risk Inventory
    async syncToRiskInventory(ids: string[], userId: string) {
        const entries = await this.prisma.riskEntry.findMany({
            where: { id: { in: ids } },
        });

        const results = [];
        for (const entry of entries) {
            // Check if already synced
            if (entry.syncedRiskId) {
                results.push({ id: entry.id, status: 'already_synced', riskId: entry.syncedRiskId });
                continue;
            }

            // Create Risk in main inventory
            const risk = await this.prisma.risk.create({
                data: {
                    riskId: entry.riskId,
                    name: entry.riskTanimi.substring(0, 200),
                    description: entry.riskTanimi,
                    status: entry.riskStatus === RiskEntryStatus.AKTIF ? 'IDENTIFIED' : 'CLOSED',
                    ownerId: userId, // Fallback to current user
                    categoryId: (await this.getDefaultCategory()).id,
                    inherentProbability: entry.olasilik || 1,
                    inherentImpact: Math.round(entry.etki || 1),
                    inherentRiskScore: Math.round(entry.dogalRiskPuani || 1),
                    residualProbability: entry.olasilik,
                    residualImpact: Math.round((entry.kalintiRiskPuani || 1) / (entry.olasilik || 1)),
                    residualRiskScore: Math.round(entry.kalintiRiskPuani || 1),
                },
            });

            // Link entry to risk
            await this.prisma.riskEntry.update({
                where: { id: entry.id },
                data: { syncedRiskId: risk.id },
            });

            results.push({ id: entry.id, status: 'synced', riskId: risk.id });
        }

        return results;
    }

    private async getDefaultCategory() {
        let category = await this.prisma.riskCategory.findFirst();
        if (!category) {
            category = await this.prisma.riskCategory.create({
                data: { name: 'Genel Risk', description: 'Genel Risk Kategorisi' },
            });
        }
        return category;
    }
}
