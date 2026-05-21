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
});
