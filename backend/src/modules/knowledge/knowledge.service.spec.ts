import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { PrismaService } from '../../prisma';

describe('KnowledgeService', () => {
    let service: KnowledgeService;
    let prisma: Record<string, any>;

    beforeEach(async () => {
        prisma = {
            knowledgeDoc: {
                findUnique: jest.fn(),
                findMany: jest.fn().mockResolvedValue([]),
                create: jest.fn(),
                update: jest.fn(),
            },
            auditLog: { create: jest.fn().mockResolvedValue({}) },
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [KnowledgeService, { provide: PrismaService, useValue: prisma }],
        }).compile();

        service = module.get<KnowledgeService>(KnowledgeService);
    });

    afterEach(() => jest.clearAllMocks());

    it('search varsayılan olarak yalnızca aktif kayıtları getirir', async () => {
        await service.search({ q: 'erişim' });
        expect(prisma.knowledgeDoc.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ isActive: true }) }),
        );
    });

    it('create — çakışan kod BadRequestException', async () => {
        prisma.knowledgeDoc.findUnique.mockResolvedValue({ id: 'x', code: 'POL-1' });
        await expect(
            service.create(
                { kind: 'POLICY' as any, code: 'POL-1', title: 'Başlık', body: 'içerik' },
                'user-1',
            ),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.knowledgeDoc.create).not.toHaveBeenCalled();
    });

    it('create — audit log yazar', async () => {
        prisma.knowledgeDoc.findUnique.mockResolvedValue(null);
        prisma.knowledgeDoc.create.mockResolvedValue({ id: 'k-1', code: 'POL-2' });
        await service.create(
            { kind: 'POLICY' as any, code: 'POL-2', title: 'Başlık', body: 'içerik' },
            'user-1',
        );
        expect(prisma.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ action: 'CREATE', entityType: 'KnowledgeDoc', entityId: 'k-1' }),
            }),
        );
    });

    it('remove — kalıcı silmez, isActive=false yapar', async () => {
        prisma.knowledgeDoc.findUnique.mockResolvedValue({ id: 'k-1', code: 'POL-3' });
        prisma.knowledgeDoc.update.mockResolvedValue({ id: 'k-1', isActive: false });
        await service.remove('k-1', 'user-1');
        expect(prisma.knowledgeDoc.update).toHaveBeenCalledWith({ where: { id: 'k-1' }, data: { isActive: false } });
    });

    it('get — bulunamazsa NotFoundException', async () => {
        prisma.knowledgeDoc.findUnique.mockResolvedValue(null);
        await expect(service.get('yok')).rejects.toThrow(NotFoundException);
    });
});
