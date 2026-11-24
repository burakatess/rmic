import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ControlEffectivenessLevel } from '@prisma/client';
import { toDateField } from '../../common/util/dto-mapping';
import { CreateRiskManagementControlDto, CreateRmControlTestDto, UpdateRiskManagementControlDto } from './dto/risk-management-control.dto';

@Injectable()
export class RiskManagementControlsService {
    constructor(private prisma: PrismaService) { }

    // Generate next RYK control code
    private async generateControlCode(): Promise<string> {
        const prefix = 'RYK-';

        const lastControl = await this.prisma.riskManagementControl.findFirst({
            where: { controlCode: { startsWith: prefix } },
            orderBy: { controlCode: 'desc' },
        });

        let nextNumber = 1;
        if (lastControl) {
            const lastNumber = parseInt(lastControl.controlCode.replace(prefix, ''), 10);
            nextNumber = lastNumber + 1;
        }

        return `${prefix}${String(nextNumber).padStart(3, '0')}`;
    }

    // Calculate individual control score
    // Formula: (effectiveness * 0.5) + (frequency * 0.3) + (automationLevel * 0.2)
    calculateControlScore(data: {
        effectiveness: number;
        frequency: number;
        automationLevel: number;
    }): number {
        const score = (data.effectiveness * 0.5) + (data.frequency * 0.3) + (data.automationLevel * 0.2);
        return Math.round(score * 100) / 100;
    }

    // Calculate integrated control score for a risk entry
    // Formula: Σ(controlScore * applicabilityScore) / Σ(applicabilityScore)
    async calculateIntegratedControlScore(riskEntryId: string): Promise<{
        integratedScore: number;
        controlCount: number;
        controlLevel: ControlEffectivenessLevel;
    }> {
        const mappings = await this.prisma.riskEntryRMControl.findMany({
            where: { riskEntryId },
            include: { control: true },
        });

        if (mappings.length === 0) {
            return {
                integratedScore: 0,
                controlCount: 0,
                controlLevel: ControlEffectivenessLevel.ETKIN_DEGIL,
            };
        }

        let weightedSum = 0;
        let totalWeight = 0;

        for (const mapping of mappings) {
            const controlScore = mapping.control.controlScore || this.calculateControlScore({
                effectiveness: mapping.control.effectiveness,
                frequency: mapping.control.frequency,
                automationLevel: mapping.control.automationLevel,
            });
            weightedSum += controlScore * mapping.applicabilityScore;
            totalWeight += mapping.applicabilityScore;
        }

        const integratedScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;

        // Determine control level
        let controlLevel: ControlEffectivenessLevel;
        if (integratedScore >= 4) {
            controlLevel = ControlEffectivenessLevel.ETKIN;
        } else if (integratedScore >= 2.5) {
            controlLevel = ControlEffectivenessLevel.KISMEN_ETKIN;
        } else {
            controlLevel = ControlEffectivenessLevel.ETKIN_DEGIL;
        }

        return {
            integratedScore,
            controlCount: mappings.length,
            controlLevel,
        };
    }

    // CRUD Operations
    async findAll(query?: any) {
        const { page = 1, limit = 100, isActive, search } = query || {};

        const where: any = {};
        if (isActive !== undefined) where.isActive = isActive === 'true';
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { controlCode: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [data, total] = await Promise.all([
            this.prisma.riskManagementControl.findMany({
                where,
                skip: (page - 1) * limit,
                take: Number(limit),
                include: {
                    riskMappings: {
                        include: { riskEntry: { select: { id: true, riskId: true, riskTanimi: true } } },
                    },
                    _count: { select: { riskMappings: true, tests: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.riskManagementControl.count({ where }),
        ]);

        return { data, total, page, limit };
    }

    async findOne(id: string) {
        const control = await this.prisma.riskManagementControl.findUnique({
            where: { id },
            include: {
                riskMappings: {
                    include: { riskEntry: { select: { id: true, riskId: true, riskTanimi: true, dogalRiskSeviyesi: true } } },
                },
                tests: {
                    orderBy: { testDate: 'desc' },
                    take: 10,
                },
            },
        });

        if (!control) {
            throw new NotFoundException('RYK kontrol bulunamadı');
        }

        return control;
    }

    async create(data: CreateRiskManagementControlDto, userId: string) {
        const controlCode = await this.generateControlCode();
        const controlScore = this.calculateControlScore({
            effectiveness: data.effectiveness || 3,
            frequency: data.frequency || 3,
            automationLevel: data.automationLevel || 3,
        });

        const created = await this.prisma.riskManagementControl.create({
            data: {
                controlCode,
                name: data.name,
                description: data.description || '',
                effectiveness: data.effectiveness || 3,
                frequency: data.frequency || 3,
                automationLevel: data.automationLevel || 3,
                controlScore,
                ownerId: userId,
                isActive: data.isActive ?? true,
            },
        });
        await this.prisma.auditLog.create({ data: { userId, action: 'CREATE', entityType: 'RiskManagementControl', entityId: created.id, newValue: { controlCode, name: created.name } } }).catch(() => undefined);
        return created;
    }

    async update(id: string, data: UpdateRiskManagementControlDto, userId: string) {
        const existing = await this.findOne(id);

        const controlScore = this.calculateControlScore({
            effectiveness: data.effectiveness ?? existing.effectiveness,
            frequency: data.frequency ?? existing.frequency,
            automationLevel: data.automationLevel ?? existing.automationLevel,
        });

        const updated = await this.prisma.riskManagementControl.update({
            where: { id },
            data: {
                name: data.name,
                description: data.description,
                effectiveness: data.effectiveness,
                frequency: data.frequency,
                automationLevel: data.automationLevel,
                controlScore,
                isActive: data.isActive,
            },
        });
        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'RiskManagementControl', entityId: id, oldValue: { effectiveness: existing.effectiveness, frequency: existing.frequency, automationLevel: existing.automationLevel, isActive: existing.isActive }, newValue: { ...data, controlScore } as object },
        }).catch(() => undefined);
        return updated;
    }

    async delete(id: string, userId?: string) {
        const existing = await this.findOne(id); // Check exists
        const deleted = await this.prisma.riskManagementControl.delete({ where: { id } });
        if (userId) await this.prisma.auditLog.create({ data: { userId, action: 'DELETE', entityType: 'RiskManagementControl', entityId: id, oldValue: { controlCode: existing.controlCode, name: existing.name } } }).catch(() => undefined);
        return deleted;
    }

    // Risk Mapping Operations
    async mapToRiskEntry(controlId: string, riskEntryId: string, applicabilityScore: number = 3) {
        // Verify both exist
        await this.findOne(controlId);
        const riskEntry = await this.prisma.riskEntry.findUnique({ where: { id: riskEntryId } });
        if (!riskEntry) {
            throw new NotFoundException('Risk kaydı bulunamadı');
        }

        // Create mapping
        const mapping = await this.prisma.riskEntryRMControl.create({
            data: {
                controlId,
                riskEntryId,
                applicabilityScore,
            },
            include: {
                control: true,
                riskEntry: { select: { id: true, riskId: true, riskTanimi: true } },
            },
        });

        // Recalculate integrated score for the risk entry
        await this.updateRiskEntryIntegratedScore(riskEntryId);

        return mapping;
    }

    async unmapFromRiskEntry(controlId: string, riskEntryId: string) {
        await this.prisma.riskEntryRMControl.delete({
            where: {
                riskEntryId_controlId: { controlId, riskEntryId },
            },
        });

        // Recalculate integrated score for the risk entry
        await this.updateRiskEntryIntegratedScore(riskEntryId);

        return { success: true };
    }

    async updateApplicabilityScore(controlId: string, riskEntryId: string, applicabilityScore: number) {
        const mapping = await this.prisma.riskEntryRMControl.update({
            where: {
                riskEntryId_controlId: { controlId, riskEntryId },
            },
            data: { applicabilityScore },
        });

        // Recalculate integrated score
        await this.updateRiskEntryIntegratedScore(riskEntryId);

        return mapping;
    }

    // Update risk entry's integrated control score and residual risk
    private async updateRiskEntryIntegratedScore(riskEntryId: string) {
        const { integratedScore, controlLevel } = await this.calculateIntegratedControlScore(riskEntryId);

        const riskEntry = await this.prisma.riskEntry.findUnique({ where: { id: riskEntryId } });
        if (!riskEntry) return;

        // Calculate residual risk based on integrated control score
        const controlFactor = 1 - (integratedScore / 5) * 0.6; // Max 60% reduction
        const kalintiRiskPuani = Math.round((riskEntry.dogalRiskPuani || 1) * controlFactor * 100) / 100;
        const kalintiRiskSkoru = Math.round((kalintiRiskPuani / 25) * 100);

        // Determine residual risk level
        let kalintiRiskSeviyesi;
        if (kalintiRiskPuani >= 20) kalintiRiskSeviyesi = 'KRITIK';
        else if (kalintiRiskPuani >= 12) kalintiRiskSeviyesi = 'YUKSEK';
        else if (kalintiRiskPuani >= 5) kalintiRiskSeviyesi = 'ORTA';
        else kalintiRiskSeviyesi = 'DUSUK';

        await this.prisma.riskEntry.update({
            where: { id: riskEntryId },
            data: {
                butunlesikKontrolPuani: integratedScore,
                butunlesikKontrolSkoru: Math.round((integratedScore / 5) * 100),
                butunlesikKontrolSeviyesi: controlLevel,
                kalintiRiskPuani,
                kalintiRiskSkoru,
                kalintiRiskSeviyesi: kalintiRiskSeviyesi as any,
            },
        });
    }

    // Get controls for a specific risk entry
    async getControlsForRiskEntry(riskEntryId: string) {
        const mappings = await this.prisma.riskEntryRMControl.findMany({
            where: { riskEntryId },
            include: {
                control: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        const integratedData = await this.calculateIntegratedControlScore(riskEntryId);

        return {
            controls: mappings,
            integratedScore: integratedData.integratedScore,
            controlCount: integratedData.controlCount,
            controlLevel: integratedData.controlLevel,
        };
    }

    // Test operations
    async createTest(controlId: string, data: CreateRmControlTestDto, userId: string) {
        await this.findOne(controlId);

        // Testi yapan oturumdaki kullanıcıdır (istemciden "tester" kabul edilmez).
        const test = await this.prisma.rMControlTest.create({
            data: {
                controlId,
                testDate: toDateField(data.testDate) ?? new Date(),
                tester: userId,
                result: data.result,
                notes: data.notes,
            },
        });
        await this.prisma.auditLog.create({ data: { userId, action: 'CREATE', entityType: 'RMControlTest', entityId: test.id, newValue: { controlId, result: test.result } } }).catch(() => undefined);
        return test;
    }

    async getTests(controlId: string) {
        return this.prisma.rMControlTest.findMany({
            where: { controlId },
            orderBy: { testDate: 'desc' },
        });
    }
}
