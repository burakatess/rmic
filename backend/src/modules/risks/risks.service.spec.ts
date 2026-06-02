import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RiskStatus } from './dto';
import { RisksService } from './risks.service';
import { PrismaService } from '../../prisma';

describe('RisksService', () => {
    let service: RisksService;
    let prisma: Record<string, any>;

    const mockRisk = {
        id: 'risk-1',
        riskId: 'R-2025-0001',
        name: 'Test Risk',
        description: 'Test risk description',
        status: RiskStatus.IDENTIFIED,
        ownerId: 'user-1',
        categoryId: 'cat-1',
        inherentProbability: 3,
        inherentImpact: 4,
        inherentRiskScore: 12,
        residualProbability: null,
        residualImpact: null,
        residualRiskScore: null,
        riskAppetite: null,
        isAboveAppetite: false,
        treatmentDecision: null,
        version: 1,
        owner: { id: 'user-1', firstName: 'Admin', lastName: 'User' },
        category: { id: 'cat-1', name: 'Operasyonel', color: '#FF5733' },
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(async () => {
        prisma = {
            risk: {
                findMany: jest.fn(),
                findUnique: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
                count: jest.fn(),
            },
            riskCategory: {
                findMany: jest.fn(),
                findFirst: jest.fn(),
                create: jest.fn(),
            },
            riskAssessment: {
                create: jest.fn(),
                deleteMany: jest.fn(),
            },
            riskHistory: {
                create: jest.fn(),
                findMany: jest.fn(),
                deleteMany: jest.fn(),
            },
            riskRegulation: {
                deleteMany: jest.fn(),
            },
            controlRiskMapping: {
                findMany: jest.fn(),
                deleteMany: jest.fn(),
            },
            finding: {
                findMany: jest.fn(),
                deleteMany: jest.fn(),
            },
            action: {
                findMany: jest.fn(),
                deleteMany: jest.fn(),
            },
            processRisk: {
                findMany: jest.fn(),
                deleteMany: jest.fn(),
            },
            systemRisk: {
                findMany: jest.fn(),
                deleteMany: jest.fn(),
            },
            auditLog: {
                create: jest.fn(),
            },
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RisksService,
                { provide: PrismaService, useValue: prisma },
            ],
        }).compile();

        service = module.get<RisksService>(RisksService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('generateRiskId', () => {
        it('should generate risk ID with correct format', () => {
            // Access private method via bracket notation for testing
            const riskId = (service as any).generateRiskId();
            const year = new Date().getFullYear();

            expect(riskId).toMatch(new RegExp(`^R-${year}-\\d{4}$`));
        });
    });

    describe('calculateRiskScore', () => {
        it('should return probability * impact', () => {
            expect((service as any).calculateRiskScore(3, 4)).toBe(12);
        });

        it('should return 1 for minimum values', () => {
            expect((service as any).calculateRiskScore(1, 1)).toBe(1);
        });

        it('should return 25 for maximum values', () => {
            expect((service as any).calculateRiskScore(5, 5)).toBe(25);
        });
    });

    describe('findAll', () => {
        it('should return paginated risks', async () => {
            prisma.risk.findMany.mockResolvedValue([mockRisk]);
            prisma.risk.count.mockResolvedValue(1);

            const result = await service.findAll({ page: 1, limit: 10 });

            expect(result).toHaveProperty('data');
            expect(result.pagination).toHaveProperty('total');
            expect(prisma.risk.findMany).toHaveBeenCalled();
        });

        it('should apply status filter', async () => {
            prisma.risk.findMany.mockResolvedValue([]);
            prisma.risk.count.mockResolvedValue(0);

            await service.findAll({ status: RiskStatus.IDENTIFIED });

            const findManyCall = prisma.risk.findMany.mock.calls[0][0];
            expect(findManyCall.where).toHaveProperty('status', RiskStatus.IDENTIFIED);
        });
    });

    describe('findOne', () => {
        it('should return a risk with relations', async () => {
            prisma.risk.findUnique.mockResolvedValue(mockRisk);

            const result = await service.findOne('risk-1');

            expect(result).toBeDefined();
            expect(prisma.risk.findUnique).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'risk-1' },
                }),
            );
        });

        it('should throw NotFoundException for non-existent risk', async () => {
            prisma.risk.findUnique.mockResolvedValue(null);

            await expect(service.findOne('non-existent')).rejects.toThrow(
                NotFoundException,
            );
        });
    });

    describe('create', () => {
        it('should create a risk with calculated score', async () => {
            prisma.riskCategory.findFirst.mockResolvedValue({ id: 'cat-1' });
            prisma.risk.create.mockResolvedValue(mockRisk);
            prisma.riskHistory.create.mockResolvedValue({});
            prisma.auditLog.create.mockResolvedValue({});

            const result = await service.create(
                {
                    name: 'New Risk',
                    description: 'Description',
                    categoryId: 'cat-1',
                    inherentProbability: 3,
                    inherentImpact: 4,
                } as any,
                'user-1',
            );

            expect(result).toBeDefined();
            expect(prisma.risk.create).toHaveBeenCalled();
            // Verify score calculation
            const createCall = prisma.risk.create.mock.calls[0][0];
            expect(createCall.data.inherentRiskScore).toBe(12); // 3 * 4
        });
    });

    describe('delete', () => {
        it('should delete a risk and log the action', async () => {
            prisma.risk.findUnique.mockResolvedValue(mockRisk);
            prisma.action.deleteMany.mockResolvedValue({ count: 0 });
            prisma.finding.deleteMany.mockResolvedValue({ count: 0 });
            prisma.processRisk.deleteMany.mockResolvedValue({ count: 0 });
            prisma.systemRisk.deleteMany.mockResolvedValue({ count: 0 });
            prisma.controlRiskMapping.deleteMany.mockResolvedValue({ count: 0 });
            prisma.riskRegulation.deleteMany.mockResolvedValue({ count: 0 });
            prisma.risk.delete.mockResolvedValue(mockRisk);
            prisma.auditLog.create.mockResolvedValue({});

            await service.delete('risk-1', 'user-1');

            expect(prisma.risk.delete).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'risk-1' },
                }),
            );
            expect(prisma.auditLog.create).toHaveBeenCalled();
        });

        it('should throw NotFoundException when risk does not exist', async () => {
            prisma.risk.findUnique.mockResolvedValue(null);

            await expect(service.delete('non-existent', 'user-1')).rejects.toThrow(
                NotFoundException,
            );
        });
    });

    describe('getHistory', () => {
        it('should return risk history sorted by date', async () => {
            const mockHistory = [
                { id: 'h-1', changeType: 'CREATE', changedAt: new Date() },
            ];
            prisma.risk.findUnique.mockResolvedValue(mockRisk);
            prisma.riskHistory.findMany.mockResolvedValue(mockHistory);

            const result = await service.getHistory('risk-1');

            expect(result).toEqual(mockHistory);
            expect(prisma.riskHistory.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { riskId: 'risk-1' },
                }),
            );
        });
    });
});
