import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class ComplianceService {
    constructor(private prisma: PrismaService) { }

    // Regulations
    async findAllRegulations() {
        return this.prisma.regulation.findMany({
            include: {
                _count: {
                    select: { articles: true },
                },
            },
            orderBy: { code: 'asc' },
        });
    }

    async findRegulationById(id: string) {
        const regulation = await this.prisma.regulation.findUnique({
            where: { id },
            include: {
                articles: {
                    orderBy: { articleCode: 'asc' },
                },
            },
        });

        if (!regulation) {
            throw new NotFoundException('Regulation not found');
        }

        return regulation;
    }

    async createRegulation(data: {
        code: string;
        name: string;
        description?: string;
    }) {
        return this.prisma.regulation.create({
            data: {
                code: data.code,
                name: data.name,
                description: data.description,
            },
        });
    }

    async updateRegulation(
        id: string,
        data: {
            code?: string;
            name?: string;
            description?: string;
            isActive?: boolean;
        },
    ) {
        return this.prisma.regulation.update({
            where: { id },
            data,
        });
    }

    // Regulation Articles
    async createArticle(data: {
        regulationId: string;
        articleCode: string;
        title: string;
        description: string;
    }) {
        return this.prisma.regulationArticle.create({
            data: {
                regulationId: data.regulationId,
                articleCode: data.articleCode,
                title: data.title,
                description: data.description,
            },
        });
    }

    async findArticlesByRegulation(regulationId: string) {
        return this.prisma.regulationArticle.findMany({
            where: { regulationId },
            orderBy: { articleCode: 'asc' },
            include: {
                crossRefsFrom: {
                    include: { target: { include: { regulation: { select: { id: true, code: true, name: true } } } } },
                },
                crossRefsTo: {
                    include: { source: { include: { regulation: { select: { id: true, code: true, name: true } } } } },
                },
            },
        });
    }

    async searchArticles(q: string, regulationId?: string, category?: string) {
        const where: any = {};
        if (regulationId) where.regulationId = regulationId;
        if (category) where.category = category;
        if (q) {
            where.OR = [
                { articleCode: { contains: q, mode: 'insensitive' } },
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
            ];
        }
        return this.prisma.regulationArticle.findMany({
            where,
            orderBy: [{ regulationId: 'asc' }, { articleCode: 'asc' }],
            include: {
                regulation: { select: { id: true, code: true, name: true } },
                crossRefsFrom: {
                    include: { target: { include: { regulation: { select: { id: true, code: true, name: true } } } } },
                },
                crossRefsTo: {
                    include: { source: { include: { regulation: { select: { id: true, code: true, name: true } } } } },
                },
            },
        });
    }

    // Risk-Article Mapping
    async mapRiskToArticle(riskId: string, articleId: string, userId?: string) {
        const mapping = await this.prisma.riskRegulation.create({
            data: {
                riskId,
                articleId,
            },
        });

        if (userId) {
            await this.prisma.auditLog.create({
                data: {
                    userId,
                    action: 'MAP',
                    entityType: 'RiskRegulation',
                    entityId: mapping.id,
                    newValue: { riskId, articleId },
                },
            });
        }

        return mapping;
    }

    async unmapRiskFromArticle(riskId: string, articleId: string) {
        return this.prisma.riskRegulation.deleteMany({
            where: { riskId, articleId },
        });
    }

    // Control-Article Mapping
    async mapControlToArticle(controlId: string, articleId: string, userId?: string) {
        const mapping = await this.prisma.controlRegulation.create({
            data: {
                controlId,
                articleId,
            },
        });

        if (userId) {
            await this.prisma.auditLog.create({
                data: {
                    userId,
                    action: 'MAP',
                    entityType: 'ControlRegulation',
                    entityId: mapping.id,
                    newValue: { controlId, articleId },
                },
            });
        }

        return mapping;
    }

    async unmapControlFromArticle(controlId: string, articleId: string) {
        return this.prisma.controlRegulation.deleteMany({
            where: { controlId, articleId },
        });
    }

    // Compliance Overview
    async getComplianceOverview() {
        const regulations = await this.prisma.regulation.findMany({
            where: { isActive: true },
            include: {
                articles: {
                    include: {
                        _count: {
                            select: {
                                risks: true,
                                controls: true,
                            },
                        },
                    },
                },
            },
        });

        return regulations.map((reg) => {
            const totalArticles = reg.articles.length;
            const articlesWithRisks = reg.articles.filter((a) => a._count.risks > 0).length;
            const articlesWithControls = reg.articles.filter((a) => a._count.controls > 0).length;

            return {
                id: reg.id,
                code: reg.code,
                name: reg.name,
                totalArticles,
                riskCoverage: totalArticles > 0 ? (articlesWithRisks / totalArticles) * 100 : 0,
                controlCoverage: totalArticles > 0 ? (articlesWithControls / totalArticles) * 100 : 0,
                overallCompliance:
                    totalArticles > 0
                        ? ((articlesWithRisks + articlesWithControls) / (totalArticles * 2)) * 100
                        : 0,
            };
        });
    }
}
