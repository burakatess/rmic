import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
    CreateRiskDto,
    UpdateRiskDto,
    AssessRiskDto,
    TreatRiskDto,
    RiskQueryDto,
} from './dto';
import { parsePaging, safeOrderBy } from '../../common/util/list-query';
import { Prisma } from '@prisma/client';
import { matchesPermission } from '../../common/util/permission-match';
import { computeRiskScores, RISK_SCORING_FIELDS } from './risk-scoring.util';

@Injectable()
export class RisksService {
    constructor(private prisma: PrismaService) { }

    private generateRiskId(): string {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000)
            .toString()
            .padStart(4, '0');
        return `R-${year}-${random}`;
    }

    private calculateRiskScore(probability: number, impact: number): number {
        return probability * impact;
    }

    async findAll(query: RiskQueryDto, riskScope?: Prisma.RiskWhereInput | null) {
        const { search, categoryId, ownerId, status, page, limit, sortBy, sortOrder } = query;
        const skip = ((page || 1) - 1) * (limit || 20);

        const where: any = riskScope ? { AND: [riskScope] } : {};

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { riskId: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (categoryId) where.categoryId = categoryId;
        if (ownerId) where.ownerId = ownerId;
        if (query.directorateId) where.directorateId = query.directorateId;
        if (status) where.status = status;

        const [risks, total] = await Promise.all([
            this.prisma.risk.findMany({
                where,
                include: {
                    directorate: { select: { id: true, name: true } },
                    category: true,
                    owner: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            department: true,
                        },
                    },
                    // Include linked controls with details
                    controls: {
                        include: {
                            control: {
                                select: {
                                    id: true,
                                    controlId: true,
                                    name: true,
                                    // Include findings linked to these controls
                                    findings: {
                                        select: {
                                            id: true,
                                            findingId: true,
                                            description: true,
                                            status: true,
                                        },
                                        take: 5,
                                    },
                                },
                            },
                        },
                    },
                    // Also include direct findings for backward compatibility
                    findings: {
                        select: {
                            id: true,
                            findingId: true,
                            description: true,
                            status: true,
                        },
                        take: 5,
                    },
                    _count: {
                        select: {
                            controls: true,
                            findings: true,
                            actions: true,
                            riskControls: true,
                            riskActions: true,
                        },
                    },
                    riskControls: {
                        include: {
                            riskControl: {
                                select: {
                                    id: true,
                                    kontrolId: true,
                                    kontrolTanimi: true,
                                    status: true,
                                    butunlesikKontrolSeviyesi: true,
                                },
                            },
                        },
                    },
                    riskActions: {
                        include: {
                            riskAction: {
                                select: {
                                    id: true,
                                    aksiyonId: true,
                                    status: true,
                                    aksiyonTanimi: true,
                                },
                            },
                        },
                    },
                },
                skip,
                take: limit || 20,
                orderBy: safeOrderBy(sortBy, sortOrder, Prisma.RiskScalarFieldEnum, 'createdAt', 'desc'),
            }),
            this.prisma.risk.count({ where }),
        ]);

        return {
            data: risks,
            pagination: {
                total,
                page: page || 1,
                limit: limit || 20,
                totalPages: Math.ceil(total / (limit || 20)),
            },
        };
    }

    async findOne(id: string, sc: RiskRelatedScopes = {}) {
        const risk = await this.prisma.risk.findUnique({
            where: { id },
            include: {
                directorate: { select: { id: true, name: true } },
                category: true,
                owner: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        department: true,
                    },
                },
                controls: {
                    include: {
                        control: {
                            include: {
                                owner: {
                                    select: {
                                        id: true,
                                        firstName: true,
                                        lastName: true,
                                    },
                                },
                                // Include findings linked to this control
                                findings: {
                                    where: sc.finding ?? undefined,
                                    include: {
                                        // Include actions linked to each finding
                                        actions: {
                                            where: sc.action ?? undefined,
                                            include: {
                                                owner: {
                                                    select: {
                                                        id: true,
                                                        firstName: true,
                                                        lastName: true,
                                                    },
                                                },
                                            },
                                            orderBy: { createdAt: 'desc' },
                                        },
                                    },
                                    orderBy: { createdAt: 'desc' },
                                },
                            },
                        },
                    },
                },
                // Bulgu ekranından yapılan doğrudan risk eşleştirmeleri (çoktan çoğa, iki yönlü görünüm).
                linkedFindings: {
                    where: sc.finding ?? undefined,
                    select: { id: true, findingId: true, summary: true, description: true, severity: true, status: true, workflowStatus: true, resolutionStatus: true, control: { select: { controlId: true, name: true } } },
                },
                // Keep direct findings for backward compatibility
                findings: {
                    where: sc.finding ?? undefined,
                    include: {
                        control: true,
                        actions: {
                            where: sc.action ?? undefined,
                            include: {
                                owner: {
                                    select: {
                                        id: true,
                                        firstName: true,
                                        lastName: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                },
                // Keep direct actions for backward compatibility
                actions: {
                    where: sc.action ?? undefined,
                    include: {
                        owner: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                            },
                        },
                        finding: true,
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                },
                assessments: {
                    orderBy: { assessmentDate: 'desc' },
                    take: 5,
                },
                regulations: {
                    include: {
                        article: {
                            include: {
                                regulation: true,
                            },
                        },
                    },
                },
                riskEntries: {
                    include: {
                        riskManagementControls: {
                            include: {
                                control: true,
                            },
                        },
                    },
                    orderBy: { olusturmaTarihi: 'desc' },
                },
                riskControls: {
                    include: {
                        riskControl: true,
                    },
                },
                riskActions: {
                    include: {
                        riskAction: true,
                    },
                },
            },
        });

        if (!risk) {
            throw new NotFoundException(`Risk with ID ${id} not found`);
        }

        return risk;
    }

    async create(createRiskDto: CreateRiskDto, userId: string) {
        const categoryId = await this.resolveCategoryId(createRiskDto.categoryId);

        // Use current user as owner if not provided
        const ownerId = createRiskDto.ownerId || userId;
        if (createRiskDto.ownerId) await this.assertActiveUser(createRiskDto.ownerId, 'risk sahibi');
        const placement = await this.resolveRiskPlacement(createRiskDto.directorateId, createRiskDto.isOrgWide);
        const assignment = await this.resolveRiskAssignment(createRiskDto.gmyId, createRiskDto.riskSorumlusuId);

        const inherentRiskScore = this.calculateRiskScore(
            createRiskDto.inherentProbability,
            createRiskDto.inherentImpact,
        );

        const isAboveAppetite = createRiskDto.riskAppetite
            ? inherentRiskScore > createRiskDto.riskAppetite
            : false;

        // Risk + ilk tarihçe + denetim izi tek transaction'da (yarım kayıt kalmaz).
        return this.prisma.$transaction(async (tx) => {
        const risk = await tx.risk.create({
            data: {
                riskId: this.generateRiskId(),
                name: createRiskDto.name,
                description: createRiskDto.description || '',
                categoryId: categoryId,
                ownerId: ownerId,
                directorateId: placement.directorateId,
                isOrgWide: placement.isOrgWide,
                ozet: createRiskDto.ozet,
                ...assignment,
                surec: createRiskDto.surec,
                altSurec: createRiskDto.altSurec,
                flagForIT: createRiskDto.flagForIT ?? false,
                riskIsleme: createRiskDto.riskIsleme,
                finansalEtki: createRiskDto.finansalEtki,
                itibarEtkisi: createRiskDto.itibarEtkisi,
                regulasyonEtkisi: createRiskDto.regulasyonEtkisi,
                musteriEtkisi: createRiskDto.musteriEtkisi,
                gizlilikEtkisi: createRiskDto.gizlilikEtkisi,
                butunlukEtkisi: createRiskDto.butunlukEtkisi,
                erisilebilirlikEtkisi: createRiskDto.erisilebilirlikEtkisi,
                olasilik: createRiskDto.olasilik,
                ...computeRiskScores(createRiskDto),
                inherentProbability: createRiskDto.inherentProbability,
                inherentImpact: createRiskDto.inherentImpact,
                inherentRiskScore,
                riskAppetite: createRiskDto.riskAppetite,
                isAboveAppetite,
            },
            include: {
                category: true,
                owner: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        department: true,
                    },
                },
            },
        });

        // Create initial history entry
        await tx.riskHistory.create({
            data: {
                riskId: risk.id,
                version: 1,
                changeType: 'CREATE',
                changeData: risk,
                changedBy: userId,
            },
        });

        // Log the action
        await tx.auditLog.create({
            data: {
                userId,
                action: 'CREATE',
                entityType: 'Risk',
                entityId: risk.id,
                newValue: risk,
            },
        });

        return risk;
        });
    }

    /**
     * Riskin organizasyon yerleşimi: birim riski (directorateId) XOR kurum geneli risk
     * (isOrgWide=true). Direktörlük var ve aktif olmalı.
     */
    private async resolveRiskPlacement(directorateId: string | null | undefined, isOrgWide: boolean | undefined) {
        const orgWide = isOrgWide === true;
        if (orgWide && directorateId) {
            throw new BadRequestException('Kurum geneli risk bir direktörlüğe bağlanamaz; birini seçin.');
        }
        if (!orgWide && !directorateId) {
            throw new BadRequestException('Risk için sorumlu direktörlük seçin veya riski "kurum geneli" olarak işaretleyin.');
        }
        if (directorateId) {
            const dir = await this.prisma.directorate.findUnique({ where: { id: directorateId }, select: { isActive: true } });
            if (!dir || !dir.isActive) throw new BadRequestException('Geçersiz direktörlük: seçilen direktörlük bulunamadı veya pasif');
        }
        return { directorateId: directorateId || null, isOrgWide: orgWide };
    }

    /**
     * Kategori: önce KİMLİKLE (cuid) aranır, yoksa adla (geriye uyum: Excel/serbest metin).
     * Önceki kod kimliği UUID sanıp bulamayınca kimlik metniyle yeni kategori üretiyordu.
     * Adla da bulunamazsa yeni kategori oluşturulur (mevcut davranış).
     */
    private async resolveCategoryId(input: string): Promise<string> {
        const byId = await this.prisma.riskCategory.findUnique({ where: { id: input }, select: { id: true } });
        if (byId) return byId.id;
        const byName = await this.prisma.riskCategory.findFirst({ where: { name: { equals: input, mode: 'insensitive' } }, select: { id: true } });
        if (byName) return byName.id;
        const created = await this.prisma.riskCategory.create({ data: { name: input, description: '', color: '#3b82f6' } });
        return created.id;
    }

    /**
     * İlgili GMY ve Risk Sorumlusu: veritabanında tanımlı, aktif kayıt olmalı. Gösterim adları
     * (ilgiliGmy / riskSorumlusu) kimlikten türetilir. undefined = dokunma, null = kaldır.
     */
    private async resolveRiskAssignment(gmyId: string | null | undefined, riskSorumlusuId: string | null | undefined) {
        const out: { gmyId?: string | null; ilgiliGmy?: string | null; riskSorumlusuId?: string | null; riskSorumlusu?: string | null } = {};
        if (gmyId === null) Object.assign(out, { gmyId: null, ilgiliGmy: null });
        else if (gmyId !== undefined) {
            const g = await this.prisma.gmy.findUnique({ where: { id: gmyId }, select: { name: true, isActive: true } });
            if (!g || !g.isActive) throw new BadRequestException('Geçersiz GMY: seçilen GMY bulunamadı veya pasif');
            Object.assign(out, { gmyId, ilgiliGmy: g.name });
        }
        if (riskSorumlusuId === null) Object.assign(out, { riskSorumlusuId: null, riskSorumlusu: null });
        else if (riskSorumlusuId !== undefined) {
            const u = await this.prisma.user.findUnique({ where: { id: riskSorumlusuId }, select: { firstName: true, lastName: true, isActive: true } });
            if (!u || !u.isActive) throw new BadRequestException('Geçersiz risk sorumlusu: kullanıcı bulunamadı veya pasif');
            Object.assign(out, { riskSorumlusuId, riskSorumlusu: `${u.firstName} ${u.lastName}` });
        }
        return out;
    }

    private async assertActiveUser(id: string, label: string) {
        const u = await this.prisma.user.findUnique({ where: { id }, select: { isActive: true } });
        if (!u || !u.isActive) throw new BadRequestException(`Geçersiz ${label}: kullanıcı bulunamadı veya pasif`);
    }

    async update(id: string, updateRiskDto: UpdateRiskDto, userId: string, permissions: string[] = []) {
        const existingRisk = await this.findOne(id);

        // Direktörlük/nitelik değişikliği erişimi etkiler → ayrı izin + ayrı denetim olayı.
        const { directorateId: nextDirectorateId, isOrgWide: nextOrgWide, gmyId, riskSorumlusuId, ...restDto } = updateRiskDto;
        const assignment = await this.resolveRiskAssignment(gmyId, riskSorumlusuId);
        const placementChanged =
            (nextDirectorateId !== undefined && (nextDirectorateId || null) !== (existingRisk.directorateId ?? null))
            || (nextOrgWide !== undefined && nextOrgWide !== existingRisk.isOrgWide);
        let placement: { directorateId: string | null; isOrgWide: boolean } | null = null;
        if (placementChanged) {
            if (!matchesPermission(permissions, 'risk:directorate:change')) {
                throw new ForbiddenException('Riskin direktörlüğünü değiştirme yetkiniz yok (risk:directorate:change).');
            }
            placement = await this.resolveRiskPlacement(
                nextDirectorateId !== undefined ? nextDirectorateId : existingRisk.directorateId,
                nextOrgWide !== undefined ? nextOrgWide : existingRisk.isOrgWide,
            );
        }
        if (restDto.ownerId && restDto.ownerId !== existingRisk.ownerId) await this.assertActiveUser(restDto.ownerId, 'risk sahibi');
        updateRiskDto = restDto as UpdateRiskDto;

        if (updateRiskDto.categoryId) {
            updateRiskDto.categoryId = await this.resolveCategoryId(updateRiskDto.categoryId);
        }

        // Calculate new scores if probability/impact changed
        let inherentRiskScore = existingRisk.inherentRiskScore;
        let isAboveAppetite = existingRisk.isAboveAppetite;

        if (updateRiskDto.inherentProbability || updateRiskDto.inherentImpact || updateRiskDto.riskAppetite !== undefined) {
            const prob = updateRiskDto.inherentProbability || existingRisk.inherentProbability;
            const impact = updateRiskDto.inherentImpact || existingRisk.inherentImpact;
            inherentRiskScore = this.calculateRiskScore(prob, impact);

            const appetite = updateRiskDto.riskAppetite !== undefined ? updateRiskDto.riskAppetite : existingRisk.riskAppetite;
            isAboveAppetite = appetite ? inherentRiskScore > appetite : false;
        }

        return this.prisma.$transaction(async (tx) => {
        // Puanlama girdisi değiştiyse doğal puan/seviye mevcut + yeni değerlerden yeniden hesaplanır.
        const scoringChanged = RISK_SCORING_FIELDS.some(f => (updateRiskDto as Record<string, unknown>)[f] !== undefined);
        const recomputed = scoringChanged
            ? computeRiskScores({ ...(existingRisk as Record<string, any>), ...updateRiskDto })
            : {};
        const risk = await tx.risk.update({
            where: { id },
            data: {
                ...updateRiskDto,
                ...recomputed,
                ...(placement ?? {}),
                ...assignment,
                inherentRiskScore,
                isAboveAppetite,
                version: { increment: 1 },
            },
            include: {
                category: true,
                owner: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        department: true,
                    },
                },
            },
        });

        // Create history entry
        await tx.riskHistory.create({
            data: {
                riskId: risk.id,
                version: risk.version,
                changeType: 'UPDATE',
                changeData: {
                    before: existingRisk,
                    after: risk,
                },
                changedBy: userId,
            },
        });

        // Log the action
        await tx.auditLog.create({
            data: {
                userId,
                action: 'UPDATE',
                entityType: 'Risk',
                entityId: risk.id,
                oldValue: existingRisk,
                newValue: risk,
            },
        });

        if (placement) {
            await tx.auditLog.create({
                data: {
                    userId,
                    action: 'RISK_DIRECTORATE_CHANGE',
                    entityType: 'Risk',
                    entityId: risk.id,
                    oldValue: { directorateId: existingRisk.directorateId ?? null, isOrgWide: existingRisk.isOrgWide },
                    newValue: placement,
                },
            });
        }

        return risk;
        });
    }

    async assess(id: string, assessRiskDto: AssessRiskDto, userId: string) {
        const risk = await this.findOne(id);

        const inherentScore = this.calculateRiskScore(
            assessRiskDto.probability,
            assessRiskDto.impact,
        );

        let residualScore: number | null = null;
        if (assessRiskDto.residualProbability && assessRiskDto.residualImpact) {
            residualScore = this.calculateRiskScore(
                assessRiskDto.residualProbability,
                assessRiskDto.residualImpact,
            );
        }

        return this.prisma.$transaction(async (tx) => {
            // Create assessment record
            const assessment = await tx.riskAssessment.create({
                data: {
                    riskId: id,
                    assessor: userId,
                    probability: assessRiskDto.probability,
                    impact: assessRiskDto.impact,
                    inherentScore,
                    mitigatingControlIds: assessRiskDto.mitigatingControlIds || [],
                    residualProbability: assessRiskDto.residualProbability,
                    residualImpact: assessRiskDto.residualImpact,
                    residualScore,
                    treatmentDecision: assessRiskDto.treatmentDecision,
                    justification: assessRiskDto.justification,
                },
            });

            // Update risk with latest assessment values
            const isAboveAppetite = risk.riskAppetite
                ? (residualScore || inherentScore) > risk.riskAppetite
                : false;

            const updatedRisk = await tx.risk.update({
                where: { id },
                data: {
                    inherentProbability: assessRiskDto.probability,
                    inherentImpact: assessRiskDto.impact,
                    inherentRiskScore: inherentScore,
                    residualProbability: assessRiskDto.residualProbability,
                    residualImpact: assessRiskDto.residualImpact,
                    residualRiskScore: residualScore,
                    isAboveAppetite,
                    treatmentDecision: assessRiskDto.treatmentDecision,
                    status: 'ASSESSED',
                    version: { increment: 1 },
                },
                include: {
                    category: true,
                    owner: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            department: true,
                        },
                    },
                },
            });

            // Create history entry
            await tx.riskHistory.create({
                data: {
                    riskId: id,
                    version: updatedRisk.version,
                    changeType: 'ASSESSMENT',
                    changeData: assessment,
                    changedBy: userId,
                },
            });

            // Log the action
            await tx.auditLog.create({
                data: {
                    userId,
                    action: 'ASSESSMENT',
                    entityType: 'Risk',
                    entityId: id,
                    newValue: assessment,
                },
            });

            return { risk: updatedRisk, assessment };
        });
    }

    async treat(id: string, treatRiskDto: TreatRiskDto, userId: string) {
        const risk = await this.findOne(id);

        if (risk.status === 'IDENTIFIED') {
            throw new BadRequestException('Risk must be assessed before treatment');
        }

        return this.prisma.$transaction(async (tx) => {
            const updatedRisk = await tx.risk.update({
                where: { id },
                data: {
                    treatmentDecision: treatRiskDto.treatmentDecision,
                    status: treatRiskDto.treatmentDecision === 'ACCEPT' ? 'ACCEPTED' : 'TREATED',
                    version: { increment: 1 },
                },
                include: {
                    category: true,
                    owner: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            department: true,
                        },
                    },
                },
            });

            // Create history entry
            await tx.riskHistory.create({
                data: {
                    riskId: id,
                    version: updatedRisk.version,
                    changeType: 'TREATMENT',
                    changeData: {
                        decision: treatRiskDto.treatmentDecision,
                        justification: treatRiskDto.justification,
                    },
                    changedBy: userId,
                },
            });

            // Log the action
            await tx.auditLog.create({
                data: {
                    userId,
                    action: 'TREATMENT',
                    entityType: 'Risk',
                    entityId: id,
                    newValue: {
                        decision: treatRiskDto.treatmentDecision,
                        justification: treatRiskDto.justification,
                    },
                },
            });

            return updatedRisk;
        });
    }

    async approveTreatment(id: string, userId: string) {
        const risk = await this.findOne(id);
        if (!risk.treatmentDecision) {
            throw new BadRequestException('Onaylamadan önce bir tedavi kararı verilmelidir');
        }

        const approver = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { firstName: true, lastName: true },
        });

        return this.prisma.$transaction(async (tx) => {
            const updatedRisk = await tx.risk.update({
                where: { id },
                data: {
                    treatmentApproval: true,
                    treatmentApprovedBy: approver ? `${approver.firstName} ${approver.lastName}` : userId,
                    treatmentApprovedAt: new Date(),
                    version: { increment: 1 },
                },
                include: {
                    category: true,
                    owner: { select: { id: true, firstName: true, lastName: true, email: true, department: true } },
                },
            });

            await tx.riskHistory.create({
                data: {
                    riskId: id,
                    version: updatedRisk.version,
                    changeType: 'TREATMENT_APPROVAL',
                    changeData: { approvedBy: userId },
                    changedBy: userId,
                },
            });

            await tx.auditLog.create({
                data: { userId, action: 'UPDATE', entityType: 'Risk', entityId: id, newValue: { treatmentApproval: true } },
            });

            return updatedRisk;
        });
    }

    async getHistory(id: string) {
        await this.findOne(id); // Verify risk exists

        return this.prisma.riskHistory.findMany({
            where: { riskId: id },
            orderBy: { changedAt: 'desc' },
        });
    }

    async getControls(id: string) {
        await this.findOne(id);

        return this.prisma.controlRiskMapping.findMany({
            where: { riskId: id },
            include: {
                control: {
                    include: {
                        owner: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                            },
                        },
                    },
                },
            },
        });
    }

    async getFindings(id: string, sc: RiskRelatedScopes = {}) {
        await this.findOne(id, sc);

        return this.prisma.finding.findMany({
            where: sc.finding ? { AND: [{ riskId: id }, sc.finding] } : { riskId: id },
            include: {
                control: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getActions(id: string, sc: RiskRelatedScopes = {}) {
        await this.findOne(id, sc);

        return this.prisma.action.findMany({
            where: sc.action ? { AND: [{ riskId: id }, sc.action] } : { riskId: id },
            include: {
                owner: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
                effectivenessReview: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getRelations(id: string, sc: RiskRelatedScopes = {}) {
        const risk = await this.prisma.risk.findUnique({
            where: { id },
            include: {
                category: true,
                owner: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        if (!risk) throw new NotFoundException(`Risk with ID ${id} not found`);

        // Get linked controls via mapping
        const controlMappings = await this.prisma.controlRiskMapping.findMany({
            where: { riskId: id },
            include: {
                control: {
                    select: { id: true, controlId: true, name: true, effectivenessStatus: true, type: true },
                },
            },
        });
        const controls = controlMappings.map(m => m.control);
        const controlIds = controls.map(c => c.id);

        // Get findings linked to these controls or directly to the risk
        const findings = await this.prisma.finding.findMany({
            where: {
                AND: [
                    { OR: [{ controlId: { in: controlIds } }, { riskId: id }] },
                    ...(sc.finding ? [sc.finding] : []),
                ],
            },
            select: { id: true, findingId: true, description: true, status: true, severity: true, controlId: true },
        });
        const findingIds = findings.map(f => f.id);

        // Get actions linked to these findings or directly to the risk
        const actions = await this.prisma.action.findMany({
            where: {
                AND: [
                    { OR: [{ findingId: { in: findingIds } }, { riskId: id }] },
                    ...(sc.action ? [sc.action] : []),
                ],
            },
            select: {
                id: true, actionId: true, description: true, status: true, dueDate: true, findingId: true,
                owner: { select: { id: true, firstName: true, lastName: true } },
            },
        });

        return {
            risk: {
                id: risk.id,
                riskId: risk.riskId,
                name: risk.name,
                status: risk.status,
                inherentRiskScore: risk.inherentRiskScore,
                residualRiskScore: risk.residualRiskScore,
                category: risk.category,
                owner: risk.owner,
            },
            controls,
            findings,
            actions,
        };
    }

    async delete(id: string, userId: string) {
        const risk = await this.findOne(id);

        return this.prisma.$transaction(async (tx) => {
            // Log the action before deletion
            await tx.auditLog.create({
                data: {
                    userId,
                    action: 'DELETE',
                    entityType: 'Risk',
                    entityId: id,
                    oldValue: risk,
                },
            });

            // Delete related records first (cascade)
            // Delete actions related to this risk
            await tx.action.deleteMany({
                where: { riskId: id },
            });

            // Delete findings related to this risk
            await tx.finding.deleteMany({
                where: { riskId: id },
            });

            // Delete risk assessments
            await tx.riskAssessment.deleteMany({
                where: { riskId: id },
            });

            // Delete control-risk mappings
            await tx.controlRiskMapping.deleteMany({
                where: { riskId: id },
            });

            // Delete risk history
            await tx.riskHistory.deleteMany({
                where: { riskId: id },
            });

            // Delete process-risk mappings
            await tx.processRisk.deleteMany({
                where: { riskId: id },
            });

            // Delete system-risk mappings
            await tx.systemRisk.deleteMany({
                where: { riskId: id },
            });

            // Delete risk-regulation mappings
            await tx.riskRegulation.deleteMany({
                where: { riskId: id },
            });

            // Hard delete the risk
            await tx.risk.delete({
                where: { id },
            });

            return { message: 'Risk deleted successfully' };
        }, { timeout: 30000 });
    }

    async getCategories() {
        return this.prisma.riskCategory.findMany({
            orderBy: { name: 'asc' },
        });
    }
}

export interface RiskRelatedScopes {
    finding?: Prisma.FindingWhereInput | null;
    action?: Prisma.ActionWhereInput | null;
}
