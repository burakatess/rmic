import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma';

// Mock bcrypt
jest.mock('bcrypt', () => ({
    compare: jest.fn(),
    hash: jest.fn(),
}));

describe('AuthService', () => {
    let service: AuthService;
    let prisma: Record<string, any>;
    let jwtService: JwtService;

    const mockUser = {
        id: 'user-1',
        email: 'admin@grc.com',
        passwordHash: 'hashed-password',
        firstName: 'Admin',
        lastName: 'User',
        isActive: true,
        role: { id: 'role-1', name: 'SYSTEM_ADMIN', permissions: [] },
    };

    beforeEach(async () => {
        prisma = {
            user: {
                findUnique: jest.fn(),
                create: jest.fn(),
            },
            refreshToken: {
                findUnique: jest.fn(),
                create: jest.fn(),
                delete: jest.fn(),
                deleteMany: jest.fn(),
            },
            auditLog: {
                create: jest.fn(),
            },
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: PrismaService, useValue: prisma },
                {
                    provide: JwtService,
                    useValue: {
                        sign: jest.fn().mockReturnValue('mock-token'),
                        verify: jest.fn(),
                    },
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn().mockImplementation((key: string) => {
                            const config: Record<string, string> = {
                                JWT_SECRET: 'test-secret',
                                JWT_REFRESH_SECRET: 'test-refresh-secret',
                            };
                            return config[key];
                        }),
                    },
                },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
        jwtService = module.get<JwtService>(JwtService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('validateUser', () => {
        it('should return user for valid credentials', async () => {
            prisma.user.findUnique.mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);

            const result = await service.validateUser('admin@grc.com', 'password123');

            expect(result).toEqual(mockUser);
            expect(prisma.user.findUnique).toHaveBeenCalledWith({
                where: { email: 'admin@grc.com' },
                include: { role: true },
            });
        });

        it('should throw UnauthorizedException for non-existent user', async () => {
            prisma.user.findUnique.mockResolvedValue(null);

            await expect(
                service.validateUser('notfound@grc.com', 'password'),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException for inactive user', async () => {
            prisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });

            await expect(
                service.validateUser('admin@grc.com', 'password123'),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('başarısız girişte LOGIN_FAILED yazar; parola ve tam e-posta loglanmaz', async () => {
            prisma.user.findUnique.mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            await expect(service.validateUser('admin@grc.com', 'Yanlis-Parola!')).rejects.toThrow(UnauthorizedException);

            const logged = prisma.auditLog.create.mock.calls[0][0].data;
            expect(logged).toEqual(expect.objectContaining({
                action: 'LOGIN_FAILED', entityType: 'User', entityId: 'user-1',
                newValue: { reason: 'INVALID_PASSWORD', email: 'a***@grc.com' },
            }));
            expect(JSON.stringify(logged)).not.toContain('Yanlis-Parola!');
            expect(JSON.stringify(logged)).not.toContain('admin@grc.com');
        });

        it('bilinmeyen kullanıcıda entityId UNKNOWN; log hatası yanıtı değiştirmez', async () => {
            prisma.user.findUnique.mockResolvedValue(null);
            prisma.auditLog.create.mockRejectedValueOnce(new Error('db down'));
            await expect(service.validateUser('x@y.com', 'p')).rejects.toThrow(UnauthorizedException);
            expect(prisma.auditLog.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
                action: 'LOGIN_FAILED', entityId: 'UNKNOWN', newValue: { reason: 'UNKNOWN_USER', email: 'x***@y.com' },
            }));
        });

        it('should throw UnauthorizedException for wrong password', async () => {
            prisma.user.findUnique.mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            await expect(
                service.validateUser('admin@grc.com', 'wrong-password'),
            ).rejects.toThrow(UnauthorizedException);
        });
    });

    describe('login', () => {
        it('should return tokens and user data on successful login', async () => {
            prisma.user.findUnique.mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            prisma.refreshToken.create.mockResolvedValue({});
            prisma.auditLog.create.mockResolvedValue({});

            const result = await service.login({
                email: 'admin@grc.com',
                password: 'password123',
            });

            expect(result).toHaveProperty('accessToken');
            expect(result).toHaveProperty('refreshToken');
            expect(result).toHaveProperty('user');
            expect(result.user.email).toBe('admin@grc.com');
            expect(jwtService.sign).toHaveBeenCalledTimes(2); // access + refresh
        });
    });

    describe('register', () => {
        it('should create user and return tokens', async () => {
            prisma.user.findUnique.mockResolvedValue(null); // No existing user
            (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-pw');
            prisma.user.create.mockResolvedValue({
                ...mockUser,
                id: 'new-user-id',
                email: 'new@grc.com',
            });
            prisma.refreshToken.create.mockResolvedValue({});
            prisma.auditLog.create.mockResolvedValue({});

            const result = await service.register({
                email: 'new@grc.com',
                password: 'password123',
                firstName: 'New',
                lastName: 'User',
                department: 'IT',
                roleId: 'role-1',
            });

            expect(result).toHaveProperty('accessToken');
            expect(prisma.user.create).toHaveBeenCalled();
        });

        it('should throw ConflictException if email already exists', async () => {
            prisma.user.findUnique.mockResolvedValue(mockUser);

            await expect(
                service.register({
                    email: 'admin@grc.com',
                    password: 'password',
                    firstName: 'A',
                    lastName: 'B',
                    roleId: 'role-1',
                }),
            ).rejects.toThrow(ConflictException);
        });
    });

    describe('logout', () => {
        it('should delete specific refresh token when provided', async () => {
            prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
            prisma.auditLog.create.mockResolvedValue({});

            await service.logout('user-1', 'specific-token');

            expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
                where: { token: 'specific-token' },
            });
        });

        it('should delete all refresh tokens when none specified', async () => {
            prisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });
            prisma.auditLog.create.mockResolvedValue({});

            await service.logout('user-1');

            expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
                where: { userId: 'user-1' },
            });
        });
    });

    describe('getProfile', () => {
        it('should return user without passwordHash', async () => {
            prisma.user.findUnique.mockResolvedValue(mockUser);

            const result = await service.getProfile('user-1');

            expect(result).not.toHaveProperty('passwordHash');
            expect(result).toHaveProperty('email', 'admin@grc.com');
        });

        it('should throw UnauthorizedException if user not found', async () => {
            prisma.user.findUnique.mockResolvedValue(null);

            await expect(service.getProfile('non-existent')).rejects.toThrow(
                UnauthorizedException,
            );
        });
    });

    describe('refreshToken', () => {
        const stored = (over: Record<string, unknown> = {}) => ({
            id: 'rt-1', userId: 'user-1', token: 'refresh-1',
            expiresAt: new Date(Date.now() + 86400000),
            user: mockUser, ...over,
        });

        beforeEach(() => {
            (jwtService.verify as jest.Mock).mockReturnValue({ sub: 'user-1' });
            prisma.refreshToken.create.mockResolvedValue({});
        });

        it('aktif kullanıcı için token rotasyonu yapar', async () => {
            prisma.refreshToken.findUnique.mockResolvedValue(stored());
            prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

            const result = await service.refreshToken('refresh-1');

            expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { id: 'rt-1' } });
            expect(result).toHaveProperty('accessToken');
        });

        it('pasif kullanıcının refresh isteğini reddeder ve tüm oturumlarını iptal eder', async () => {
            prisma.refreshToken.findUnique.mockResolvedValue(stored({ user: { ...mockUser, isActive: false } }));
            prisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });

            await expect(service.refreshToken('refresh-1')).rejects.toThrow(UnauthorizedException);
            expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
            expect(prisma.refreshToken.create).not.toHaveBeenCalled();
        });

        it('aynı token eşzamanlı ikinci kez kullanılırsa yeni oturum vermez', async () => {
            prisma.refreshToken.findUnique.mockResolvedValue(stored());
            prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

            await expect(service.refreshToken('refresh-1')).rejects.toThrow(UnauthorizedException);
            expect(prisma.refreshToken.create).not.toHaveBeenCalled();
        });

        it('süresi geçmiş veya başka kullanıcıya ait token reddedilir', async () => {
            prisma.refreshToken.findUnique.mockResolvedValue(stored({ expiresAt: new Date(Date.now() - 1000) }));
            await expect(service.refreshToken('refresh-1')).rejects.toThrow(UnauthorizedException);

            prisma.refreshToken.findUnique.mockResolvedValue(stored({ userId: 'user-2' }));
            await expect(service.refreshToken('refresh-1')).rejects.toThrow(UnauthorizedException);
            expect(prisma.refreshToken.create).not.toHaveBeenCalled();
        });
    });

    describe('changePassword', () => {
        it('şifre, oturum iptali ve CHANGE_PASSWORD olayı tek transaction\'da; parola loglanmaz', async () => {
            prisma.user.findUnique.mockResolvedValue(mockUser);
            prisma.user.update = jest.fn();
            prisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
            prisma.$transaction = jest.fn((fn: any) => fn(prisma));

            await service.changePassword('user-1', { currentPassword: 'Eski-123!', newPassword: 'Yeni-Parola-456!' });

            expect(prisma.$transaction).toHaveBeenCalled();
            expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
            const log = prisma.auditLog.create.mock.calls[0][0].data;
            expect(log).toEqual(expect.objectContaining({ action: 'CHANGE_PASSWORD', newValue: { event: 'CHANGE_PASSWORD', revokedSessions: 3 } }));
            expect(JSON.stringify(log)).not.toContain('Yeni-Parola-456!');
        });
    });
});
