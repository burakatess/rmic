import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
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
            directorate: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
            gmy: { findUnique: jest.fn().mockResolvedValue({ name: 'GMY-1', isActive: true }) },
            user: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
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
                findUnique: jest.fn().mockResolvedValue(null),
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
        prisma.$transaction = jest.fn((fn: any) => fn(prisma));

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
                    directorateId: 'dir-1',
                },
                'user-1',
            );

            expect(result).toBeDefined();
            expect(prisma.risk.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ directorateId: 'dir-1', isOrgWide: false }));
            expect(prisma.risk.create).toHaveBeenCalled();
            // Verify score calculation
            const createCall = prisma.risk.create.mock.calls[0][0];
            expect(createCall.data.inherentRiskScore).toBe(12); // 3 * 4
        });
    });

    describe('create — organizasyon yerleşimi', () => {
        const base = { name: 'R', description: 'd', categoryId: 'cat-1', inherentProbability: 1, inherentImpact: 1 };
        beforeEach(() => {
            prisma.riskCategory.findFirst.mockResolvedValue({ id: 'cat-1' });
            prisma.risk.create.mockResolvedValue(mockRisk);
        });

        it('direktörlük de kurum geneli işareti de yoksa 400', async () => {
            await expect(service.create(base as any, 'u')).rejects.toThrow('direktörlük');
            expect(prisma.risk.create).not.toHaveBeenCalled();
        });

        it('kurum geneli risk direktörlüğe bağlanamaz', async () => {
            await expect(service.create({ ...base, isOrgWide: true, directorateId: 'dir-1' } as any, 'u')).rejects.toThrow('Kurum geneli');
        });

        it('kurum geneli risk direktörlüksüz oluşur', async () => {
            await service.create({ ...base, isOrgWide: true } as any, 'u');
            expect(prisma.risk.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ directorateId: null, isOrgWide: true }));
        });

        it('pasif/bulunmayan direktörlük reddedilir', async () => {
            prisma.directorate.findUnique.mockResolvedValue(null);
            await expect(service.create({ ...base, directorateId: 'x' } as any, 'u')).rejects.toThrow('Geçersiz direktörlük');
        });
    });

    describe('İlgili GMY ve Risk Sorumlusu — yalnız tanımlı kayıtlardan', () => {
        const base = { name: 'R', description: 'd', categoryId: 'cat-1', inherentProbability: 1, inherentImpact: 1, directorateId: 'dir-1' };
        beforeEach(() => {
            prisma.riskCategory.findUnique.mockResolvedValue({ id: 'cat-1' });
            prisma.risk.create.mockResolvedValue({ ...mockRisk });
        });

        it('seçilen GMY ve kullanıcıdan gösterim adları sunucuda türetilir', async () => {
            prisma.user.findUnique.mockResolvedValue({ firstName: 'Ayşe', lastName: 'Şahin', isActive: true });
            await service.create({ ...base, gmyId: 'g-1', riskSorumlusuId: 'u-9' } as any, 'u');
            expect(prisma.risk.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
                gmyId: 'g-1', ilgiliGmy: 'GMY-1', riskSorumlusuId: 'u-9', riskSorumlusu: 'Ayşe Şahin',
            }));
        });

        it('pasif/bulunmayan GMY veya sorumlu reddedilir, kayıt yazılmaz', async () => {
            prisma.gmy.findUnique.mockResolvedValueOnce({ name: 'Eski', isActive: false });
            await expect(service.create({ ...base, gmyId: 'g-x' } as any, 'u')).rejects.toThrow('Geçersiz GMY');
            prisma.user.findUnique.mockResolvedValueOnce(null);
            await expect(service.create({ ...base, riskSorumlusuId: 'u-x' } as any, 'u')).rejects.toThrow('Geçersiz risk sorumlusu');
            expect(prisma.risk.create).not.toHaveBeenCalled();
        });

        it('güncellemede null seçimi kaldırır; alan gönderilmezse dokunulmaz', async () => {
            jest.spyOn(service, 'findOne').mockResolvedValue({ ...mockRisk, directorateId: 'dir-1' } as any);
            prisma.risk.update.mockResolvedValue({ ...mockRisk });
            await service.update('risk-1', { gmyId: null, riskSorumlusuId: null } as any, 'u');
            expect(prisma.risk.update.mock.calls[0][0].data).toEqual(expect.objectContaining({ gmyId: null, ilgiliGmy: null, riskSorumlusuId: null, riskSorumlusu: null }));
            await service.update('risk-1', { name: 'Yeni ad' } as any, 'u');
            expect(prisma.risk.update.mock.calls[1][0].data).not.toHaveProperty('gmyId');
            expect(prisma.risk.update.mock.calls[1][0].data).not.toHaveProperty('riskSorumlusu');
        });
    });

    describe('update — direktörlük değişikliği', () => {
        beforeEach(() => {
            jest.spyOn(service, 'findOne').mockResolvedValue({ ...mockRisk, directorateId: 'dir-1', isOrgWide: false } as any);
            prisma.risk.update.mockResolvedValue({ ...mockRisk, directorateId: 'dir-2', version: 2 });
        });

        it('risk:directorate:change izni yoksa 403, hiçbir şey yazılmaz', async () => {
            await expect(service.update('risk-1', { directorateId: 'dir-2' } as any, 'u', ['risk:view'])).rejects.toThrow('direktörlüğünü değiştirme');
            expect(prisma.risk.update).not.toHaveBeenCalled();
        });

        it('izinle değişir ve ayrı RISK_DIRECTORATE_CHANGE denetim kaydı aynı transaction\'da yazılır', async () => {
            await service.update('risk-1', { directorateId: 'dir-2' } as any, 'u', ['risk:directorate:change']);
            expect(prisma.risk.update.mock.calls[0][0].data).toEqual(expect.objectContaining({ directorateId: 'dir-2', isOrgWide: false }));
            expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
                action: 'RISK_DIRECTORATE_CHANGE',
                oldValue: { directorateId: 'dir-1', isOrgWide: false },
                newValue: { directorateId: 'dir-2', isOrgWide: false },
            }) });
            expect(prisma.$transaction).toHaveBeenCalled();
        });

        it('direktörlük aynı kalıyorsa izin gerekmez', async () => {
            await service.update('risk-1', { name: 'yeni ad', directorateId: 'dir-1' } as any, 'u', []);
            expect(prisma.auditLog.create).not.toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'RISK_DIRECTORATE_CHANGE' }) });
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

    describe('treat', () => {
        it('IDENTIFIED statüsündeki riski tedaviye almaya izin vermez (önce değerlendirilmeli)', async () => {
            prisma.risk.findUnique.mockResolvedValue({ ...mockRisk, status: RiskStatus.IDENTIFIED });

            await expect(
                service.treat('risk-1', { treatmentDecision: 'MITIGATE' } as any, 'user-1'),
            ).rejects.toThrow('Risk must be assessed before treatment');
            expect(prisma.risk.update).not.toHaveBeenCalled();
        });

        it('ACCEPT kararında statüyü ACCEPTED yapar', async () => {
            prisma.risk.findUnique.mockResolvedValue({ ...mockRisk, status: RiskStatus.ASSESSED });
            prisma.risk.update.mockResolvedValue({ ...mockRisk, status: 'ACCEPTED', version: 2 });
            prisma.riskHistory.create.mockResolvedValue({});
            prisma.auditLog.create.mockResolvedValue({});

            await service.treat('risk-1', { treatmentDecision: 'ACCEPT' } as any, 'user-1');

            expect(prisma.risk.update).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ status: 'ACCEPTED', treatmentDecision: 'ACCEPT' }) }),
            );
        });

        it('MITIGATE gibi ACCEPT dışı kararlarda statüyü TREATED yapar', async () => {
            prisma.risk.findUnique.mockResolvedValue({ ...mockRisk, status: RiskStatus.ASSESSED });
            prisma.risk.update.mockResolvedValue({ ...mockRisk, status: 'TREATED', version: 2 });
            prisma.riskHistory.create.mockResolvedValue({});
            prisma.auditLog.create.mockResolvedValue({});

            await service.treat('risk-1', { treatmentDecision: 'MITIGATE' } as any, 'user-1');

            expect(prisma.risk.update).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ status: 'TREATED' }) }),
            );
        });
    });

    describe('approveTreatment', () => {
        it('tedavi kararı olmayan riski onaylamaya izin vermez', async () => {
            prisma.risk.findUnique.mockResolvedValue({ ...mockRisk, treatmentDecision: null });

            await expect(service.approveTreatment('risk-1', 'user-1')).rejects.toThrow(BadRequestException);
            expect(prisma.risk.update).not.toHaveBeenCalled();
        });

        it('onaylayan kullanıcının ad-soyadını treatmentApprovedBy olarak yazar (userId değil)', async () => {
            prisma.risk.findUnique.mockResolvedValue({ ...mockRisk, treatmentDecision: 'MITIGATE' });
            prisma.user.findUnique.mockResolvedValue({ firstName: 'Ahmet', lastName: 'Yılmaz' });
            prisma.risk.update.mockResolvedValue({ ...mockRisk, version: 2 });
            prisma.riskHistory.create.mockResolvedValue({});
            prisma.auditLog.create.mockResolvedValue({});

            await service.approveTreatment('risk-1', 'user-1');

            expect(prisma.risk.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ treatmentApproval: true, treatmentApprovedBy: 'Ahmet Yılmaz' }),
                }),
            );
        });

        it('kullanıcı bulunamazsa userId\'yi fallback olarak kullanır', async () => {
            prisma.risk.findUnique.mockResolvedValue({ ...mockRisk, treatmentDecision: 'MITIGATE' });
            prisma.user.findUnique.mockResolvedValue(null);
            prisma.risk.update.mockResolvedValue({ ...mockRisk, version: 2 });
            prisma.riskHistory.create.mockResolvedValue({});
            prisma.auditLog.create.mockResolvedValue({});

            await service.approveTreatment('risk-1', 'user-1');

            expect(prisma.risk.update).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ treatmentApprovedBy: 'user-1' }) }),
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

    describe('kategori çözümleme', () => {
        it('gerçek kategori kimliği (cuid) ile seçilen kategori kullanılır; kimlik adıyla yeni kategori üretilmez', async () => {
            prisma.riskCategory.findUnique.mockResolvedValue({ id: 'cmabc123' });
            prisma.risk.create.mockResolvedValue(mockRisk);
            await service.create({ name: 'R', description: 'd', categoryId: 'cmabc123', inherentProbability: 1, inherentImpact: 1, directorateId: 'dir-1' } as any, 'u');
            expect(prisma.riskCategory.create).not.toHaveBeenCalled();
            expect(prisma.risk.create.mock.calls[0][0].data.categoryId).toBe('cmabc123');
        });
    });
});
