import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../../prisma';

describe('AdminService.updateUser — oturum iptali', () => {
    let service: AdminService;
    let prisma: Record<string, any>;

    const user = (over: Record<string, unknown> = {}) => ({
        id: 'u-1', firstName: 'A', lastName: 'B', department: null, isActive: true,
        roleId: 'r-1', role: { name: 'AUDITEE' }, passwordHash: 'h', ...over,
    });

    beforeEach(async () => {
        prisma = {
            user: { findUnique: jest.fn(), update: jest.fn() },
            refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
            auditLog: { create: jest.fn() },
        };
        prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));

        const module: TestingModule = await Test.createTestingModule({
            providers: [AdminService, { provide: PrismaService, useValue: prisma }],
        }).compile();
        service = module.get(AdminService);
    });

    it('kullanıcı pasife alınınca tüm refresh token\'ları aynı transaction\'da silinir', async () => {
        prisma.user.findUnique.mockResolvedValue(user());
        prisma.user.update.mockResolvedValue(user({ isActive: false }));

        const result = await service.updateUser('u-1', { isActive: false }, 'admin-1');

        expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
        expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ action: 'USER_ACTIVATION_CHANGE' }),
        }));
        expect(result).not.toHaveProperty('passwordHash');
    });

    it('aktiflik değişmeyen güncellemede oturumlar korunur', async () => {
        prisma.user.findUnique.mockResolvedValue(user());
        prisma.user.update.mockResolvedValue(user({ firstName: 'C' }));

        await service.updateUser('u-1', { firstName: 'C' }, 'admin-1');

        expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    });
});
