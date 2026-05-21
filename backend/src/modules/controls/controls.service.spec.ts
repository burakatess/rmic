import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ControlsService } from './controls.service';
import { PrismaService } from '../../prisma';

describe('ControlsService', () => {
    let service: ControlsService;
    let prisma: Record<string, any>;

    const mockControl = {
        id: 'ctrl-1',
        controlId: 'C-2025-0001',
        name: 'Test Control',
        description: 'Control description',
        type: 'BT',
        nature: 'PREVENTIVE',
        automation: 'MANUAL',
        frequency: 'MONTHLY',
        ownerId: 'user-1',
        effectivenessStatus: 'NOT_TESTED',
        owner: { id: 'user-1', firstName: 'Admin', lastName: 'User' },
        risks: [],
        tests: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const mockControlTest = {
        id: 'test-1',
        controlId: 'ctrl-1',
        testDate: new Date(),
        tester: 'user-1',
        result: 'EFFECTIVE',
        evidenceUrls: [],
        approvalStatus: 'DRAFT',
        createdAt: new Date(),
    };

    beforeEach(async () => {
        prisma = {
            control: {
                findMany: jest.fn(),
                findUnique: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
                count: jest.fn(),
            },
            controlRiskMapping: {
                create: jest.fn(),
                upsert: jest.fn(),
                delete: jest.fn(),
                deleteMany: jest.fn(),
                findUnique: jest.fn(),
                findMany: jest.fn(),
            },
            controlTest: {
                create: jest.fn(),
                findMany: jest.fn(),
                findUnique: jest.fn(),
                update: jest.fn(),
                deleteMany: jest.fn(),
            },
            finding: {
                deleteMany: jest.fn(),
            },
            risk: {
                update: jest.fn(),
            },
            auditLog: {
                create: jest.fn(),
            },
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ControlsService,
                { provide: PrismaService, useValue: prisma },
            ],
        }).compile();

        service = module.get<ControlsService>(ControlsService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('findAll', () => {
        it('should return paginated controls', async () => {
            prisma.control.findMany.mockResolvedValue([mockControl]);
            prisma.control.count.mockResolvedValue(1);

            const result = await service.findAll({ page: 1, limit: 10 });

            expect(result).toHaveProperty('data');
            expect(result.pagination).toHaveProperty('total');
            expect(prisma.control.findMany).toHaveBeenCalled();
        });
    });

    describe('findOne', () => {
        it('should return a control with relations', async () => {
            prisma.control.findUnique.mockResolvedValue(mockControl);

            const result = await service.findOne('ctrl-1');

            expect(result).toBeDefined();
            expect(result.controlId).toBe('C-2025-0001');
        });

        it('should throw NotFoundException for non-existent control', async () => {
            prisma.control.findUnique.mockResolvedValue(null);

            await expect(service.findOne('non-existent')).rejects.toThrow(
                NotFoundException,
            );
        });
    });

    describe('create', () => {
        it('should create a control and log the action', async () => {
            prisma.control.create.mockResolvedValue(mockControl);
            prisma.auditLog.create.mockResolvedValue({});

            const result = await service.create(
                {
                    name: 'New Control',
                    description: 'Description',
                    type: 'BT',
                    nature: 'PREVENTIVE',
                    automation: 'MANUAL',
                    frequency: 'MONTHLY',
                },
                'user-1',
            );

            expect(result).toBeDefined();
            expect(prisma.control.create).toHaveBeenCalled();
            expect(prisma.auditLog.create).toHaveBeenCalled();
        });
    });

    describe('mapRisk', () => {
        it('should upsert a control-risk mapping', async () => {
            prisma.controlRiskMapping.upsert.mockResolvedValue({
                id: 'map-1',
                controlId: 'ctrl-1',
                riskId: 'risk-1',
                mappingType: 'PRIMARY',
            });

            const result = await service.mapRisk('ctrl-1', 'risk-1', 'PRIMARY');

            expect(result).toBeDefined();
            expect(prisma.controlRiskMapping.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { controlId_riskId: { controlId: 'ctrl-1', riskId: 'risk-1' } },
                    create: expect.objectContaining({ controlId: 'ctrl-1', riskId: 'risk-1' }),
                }),
            );
        });
    });

    describe('unmapRisk', () => {
        it('should delete a control-risk mapping', async () => {
            prisma.controlRiskMapping.deleteMany.mockResolvedValue({ count: 1 });

            await service.unmapRisk('ctrl-1', 'risk-1');

            expect(prisma.controlRiskMapping.deleteMany).toHaveBeenCalledWith({
                where: { controlId: 'ctrl-1', riskId: 'risk-1' },
            });
        });
    });

    describe('createTest', () => {
        it('should create a control test', async () => {
            prisma.control.findUnique.mockResolvedValue(mockControl);
            prisma.controlTest.create.mockResolvedValue(mockControlTest);
            prisma.control.update.mockResolvedValue(mockControl);

            const result = await service.createTest(
                'ctrl-1',
                {
                    testDate: new Date().toISOString(),
                    result: 'EFFECTIVE',
                    evidenceUrls: [],
                    notes: 'Test passed',
                },
                'user-1',
            );

            expect(result).toBeDefined();
            expect(prisma.controlTest.create).toHaveBeenCalled();
        });
    });

    describe('getTests', () => {
        it('should return tests for a control', async () => {
            prisma.controlTest.findMany.mockResolvedValue([mockControlTest]);

            const result = await service.getTests('ctrl-1');

            expect(result).toHaveLength(1);
            expect(prisma.controlTest.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { controlId: 'ctrl-1' },
                }),
            );
        });
    });

    describe('delete', () => {
        it('should delete control and log action', async () => {
            prisma.control.findUnique.mockResolvedValue(mockControl);
            prisma.controlTest.deleteMany.mockResolvedValue({ count: 0 });
            prisma.controlRiskMapping.deleteMany.mockResolvedValue({ count: 0 });
            prisma.finding.deleteMany.mockResolvedValue({ count: 0 });
            prisma.control.delete.mockResolvedValue(mockControl);
            prisma.auditLog.create.mockResolvedValue({});

            await service.delete('ctrl-1', 'user-1');

            expect(prisma.control.delete).toHaveBeenCalled();
            expect(prisma.auditLog.create).toHaveBeenCalled();
            expect(prisma.controlTest.deleteMany).toHaveBeenCalledWith({ where: { controlId: 'ctrl-1' } });
        });

        it('should throw NotFoundException for non-existent control', async () => {
            prisma.control.findUnique.mockResolvedValue(null);

            await expect(service.delete('non-existent', 'user-1')).rejects.toThrow(
                NotFoundException,
            );
        });
    });

    describe('approval workflow', () => {
        it('should submit test for approval', async () => {
            prisma.controlTest.findUnique.mockResolvedValue({
                ...mockControlTest,
                approvalStatus: 'DRAFT',
            });
            prisma.controlTest.update.mockResolvedValue({
                ...mockControlTest,
                approvalStatus: 'PENDING_APPROVAL',
            });

            const result = await service.submitForApproval('test-1', 'user-1');

            expect(result.approvalStatus).toBe('PENDING_APPROVAL');
        });

        it('should approve a test', async () => {
            prisma.controlTest.findUnique.mockResolvedValue({
                ...mockControlTest,
                approvalStatus: 'PENDING_APPROVAL',
            });
            prisma.controlTest.update.mockResolvedValue({
                ...mockControlTest,
                approvalStatus: 'APPROVED',
            });

            const result = await service.approveTest('test-1', 'user-1');

            expect(result.approvalStatus).toBe('APPROVED');
        });

        it('should reject a test with reason', async () => {
            prisma.controlTest.findUnique.mockResolvedValue({
                ...mockControlTest,
                approvalStatus: 'PENDING_APPROVAL',
            });
            prisma.controlTest.update.mockResolvedValue({
                ...mockControlTest,
                approvalStatus: 'REJECTED',
                rejectionReason: 'Insufficient evidence',
            });

            const result = await service.rejectTest('test-1', 'user-1', 'Insufficient evidence');

            expect(result.approvalStatus).toBe('REJECTED');
        });
    });
});
