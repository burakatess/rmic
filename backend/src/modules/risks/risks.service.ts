import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
    CreateRiskDto,
    UpdateRiskDto,
    AssessRiskDto,
    TreatRiskDto,
    RiskQueryDto,
} from './dto';

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

    async findAll(query: RiskQueryDto) {
        const { search, categoryId, ownerId, status, page, limit, sortBy, sortOrder } = query;
        const skip = ((page || 1) - 1) * (limit || 20);

        const where: any = {};

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { riskId: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (categoryId) where.categoryId = categoryId;
        if (ownerId) where.ownerId = ownerId;
        if (status) where.status = status;

        const [risks, total] = await Promise.all([
            this.prisma.risk.findMany({
                where,
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
                        },
                    },
                },
                skip,
                take: limit || 20,
                orderBy: { [sortBy || 'createdAt']: sortOrder || 'desc' },
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

    async findOne(id: string) {
        const risk = await this.prisma.risk.findUnique({
            where: { id },
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
                                    include: {
                                        // Include actions linked to each finding
                                        actions: {
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
                // Keep direct findings for backward compatibility
                findings: {
                    include: {
                        control: true,
                        actions: {
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
            },
        });

        if (!risk) {
            throw new NotFoundException(`Risk with ID ${id} not found`);
        }

        return risk;
    }

    async create(createRiskDto: CreateRiskDto, userId: string) {
        // If categoryId is not a UUID, try to find category by name
        let categoryId = createRiskDto.categoryId;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId);

        if (!isUUID) {
            const category = await this.prisma.riskCategory.findFirst({
                where: { name: { contains: categoryId, mode: 'insensitive' } }
            });
            if (category) {
                categoryId = category.id;
            } else {
                // Create a default category if not found
                const newCategory = await this.prisma.riskCategory.create({
                    data: { name: createRiskDto.categoryId, description: '', color: '#3b82f6' }
                });
                categoryId = newCategory.id;
            }
        }

        // Use current user as owner if not provided
        const ownerId = createRiskDto.ownerId || userId;

        const inherentRiskScore = this.calculateRiskScore(
            createRiskDto.inherentProbability,
            createRiskDto.inherentImpact,
        );

        const isAboveAppetite = createRiskDto.riskAppetite
            ? inherentRiskScore > createRiskDto.riskAppetite
            : false;

        const risk = await this.prisma.risk.create({
            data: {
                riskId: this.generateRiskId(),
                name: createRiskDto.name,
                description: createRiskDto.description || '',
                categoryId: categoryId,
                ownerId: ownerId,
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
        await this.prisma.riskHistory.create({
            data: {
                riskId: risk.id,
                version: 1,
                changeType: 'CREATE',
                changeData: risk,
                changedBy: userId,
            },
        });

        // Log the action
        await this.prisma.auditLog.create({
            data: {
                userId,
                action: 'CREATE',
                entityType: 'Risk',
                entityId: risk.id,
                newValue: risk,
            },
        });

        return risk;
    }

    async update(id: string, updateRiskDto: UpdateRiskDto, userId: string) {
        const existingRisk = await this.findOne(id);

        let categoryId = updateRiskDto.categoryId;
        if (categoryId) {
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId);
            if (!isUUID) {
                const category = await this.prisma.riskCategory.findFirst({
                    where: { name: { contains: categoryId, mode: 'insensitive' } }
                });
                if (category) {
                    categoryId = category.id;
                } else {
                    const newCategory = await this.prisma.riskCategory.create({
                        data: { name: categoryId, description: '', color: '#3b82f6' }
                    });
                    categoryId = newCategory.id;
                }
            }
            updateRiskDto.categoryId = categoryId;
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

        const risk = await this.prisma.risk.update({
            where: { id },
            data: {
                ...updateRiskDto,
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
        await this.prisma.riskHistory.create({
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
        await this.prisma.auditLog.create({
            data: {
                userId,
                action: 'UPDATE',
                entityType: 'Risk',
                entityId: risk.id,
                oldValue: existingRisk,
                newValue: risk,
            },
        });

        return risk;
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

        // Create assessment record
        const assessment = await this.prisma.riskAssessment.create({
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

        const updatedRisk = await this.prisma.risk.update({
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
        await this.prisma.riskHistory.create({
            data: {
                riskId: id,
                version: updatedRisk.version,
                changeType: 'ASSESSMENT',
                changeData: assessment,
                changedBy: userId,
            },
        });

        // Log the action
        await this.prisma.auditLog.create({
            data: {
                userId,
                action: 'ASSESSMENT',
                entityType: 'Risk',
                entityId: id,
                newValue: assessment,
            },
        });

        return { risk: updatedRisk, assessment };
    }

    async treat(id: string, treatRiskDto: TreatRiskDto, userId: string) {
        const risk = await this.findOne(id);

        if (risk.status === 'IDENTIFIED') {
            throw new BadRequestException('Risk must be assessed before treatment');
        }

        const updatedRisk = await this.prisma.risk.update({
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
        await this.prisma.riskHistory.create({
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
        await this.prisma.auditLog.create({
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

    async getFindings(id: string) {
        await this.findOne(id);

        return this.prisma.finding.findMany({
            where: { riskId: id },
            include: {
                control: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getActions(id: string) {
        await this.findOne(id);

        return this.prisma.action.findMany({
            where: { riskId: id },
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

    async getRelations(id: string) {
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
                OR: [
                    { controlId: { in: controlIds } },
                    { riskId: id },
                ],
            },
            select: { id: true, findingId: true, description: true, status: true, severity: true },
        });
        const findingIds = findings.map(f => f.id);

        // Get actions linked to these findings or directly to the risk
        const actions = await this.prisma.action.findMany({
            where: {
                OR: [
                    { findingId: { in: findingIds } },
                    { riskId: id },
                ],
            },
            select: { id: true, actionId: true, description: true, status: true, dueDate: true },
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

        // Log the action before deletion
        await this.prisma.auditLog.create({
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
        await this.prisma.action.deleteMany({
            where: { riskId: id },
        });

        // Delete findings related to this risk
        await this.prisma.finding.deleteMany({
            where: { riskId: id },
        });

        // Delete risk assessments
        await this.prisma.riskAssessment.deleteMany({
            where: { riskId: id },
        });

        // Delete control-risk mappings
        await this.prisma.controlRiskMapping.deleteMany({
            where: { riskId: id },
        });

        // Delete risk history
        await this.prisma.riskHistory.deleteMany({
            where: { riskId: id },
        });

        // Delete process-risk mappings
        await this.prisma.processRisk.deleteMany({
            where: { riskId: id },
        });

        // Delete system-risk mappings
        await this.prisma.systemRisk.deleteMany({
            where: { riskId: id },
        });

        // Delete risk-regulation mappings
        await this.prisma.riskRegulation.deleteMany({
            where: { riskId: id },
        });

        // Hard delete the risk
        await this.prisma.risk.delete({
            where: { id },
        });

        return { message: 'Risk deleted successfully' };
    }
}
