import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma';
import { LoginDto, RegisterDto, TokenResponseDto } from './dto';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private configService: ConfigService,
    ) { }

    async validateUser(email: string, password: string) {
        const user = await this.prisma.user.findUnique({
            where: { email },
            include: { role: true },
        });

        if (!user || !user.isActive) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        return user;
    }

    async login(loginDto: LoginDto): Promise<TokenResponseDto> {
        const user = await this.validateUser(loginDto.email, loginDto.password);
        return this.generateTokens(user);
    }

    async register(registerDto: RegisterDto): Promise<TokenResponseDto> {
        // Check if user already exists
        const existingUser = await this.prisma.user.findUnique({
            where: { email: registerDto.email },
        });

        if (existingUser) {
            throw new ConflictException('User with this email already exists');
        }

        // Hash password
        const passwordHash = await bcrypt.hash(registerDto.password, 10);

        // Create user
        const user = await this.prisma.user.create({
            data: {
                email: registerDto.email,
                passwordHash,
                firstName: registerDto.firstName,
                lastName: registerDto.lastName,
                department: registerDto.department,
                roleId: registerDto.roleId,
            },
            include: { role: true },
        });

        // Log the action
        await this.prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'CREATE',
                entityType: 'User',
                entityId: user.id,
                newValue: { email: user.email, firstName: user.firstName, lastName: user.lastName },
            },
        });

        return this.generateTokens(user);
    }

    async refreshToken(refreshToken: string): Promise<TokenResponseDto> {
        try {
            // Verify the refresh token
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
            });

            // Check if token exists in database
            const storedToken = await this.prisma.refreshToken.findUnique({
                where: { token: refreshToken },
                include: { user: { include: { role: true } } },
            });

            if (!storedToken || storedToken.expiresAt < new Date()) {
                throw new UnauthorizedException('Invalid refresh token');
            }

            // Delete the used refresh token
            await this.prisma.refreshToken.delete({
                where: { id: storedToken.id },
            });

            // Generate new tokens
            return this.generateTokens(storedToken.user);
        } catch {
            throw new UnauthorizedException('Invalid refresh token');
        }
    }

    async logout(userId: string, refreshToken?: string): Promise<void> {
        if (refreshToken) {
            // Delete specific refresh token
            await this.prisma.refreshToken.deleteMany({
                where: { token: refreshToken },
            });
        } else {
            // Delete all refresh tokens for user
            await this.prisma.refreshToken.deleteMany({
                where: { userId },
            });
        }

        // Log the action
        await this.prisma.auditLog.create({
            data: {
                userId,
                action: 'LOGOUT',
                entityType: 'User',
                entityId: userId,
            },
        });
    }

    async getProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { role: true },
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        const { passwordHash, ...result } = user;
        return result;
    }

    async updateProfile(userId: string, dto: { firstName: string; lastName: string; department?: string }) {
        const user = await this.prisma.user.update({
            where: { id: userId },
            data: {
                firstName: dto.firstName,
                lastName: dto.lastName,
                department: dto.department ?? null,
            },
            include: { role: true },
        });

        await this.prisma.auditLog.create({
            data: {
                userId,
                action: 'UPDATE',
                entityType: 'User',
                entityId: userId,
                newValue: { firstName: dto.firstName, lastName: dto.lastName, department: dto.department },
            },
        });

        const { passwordHash, ...result } = user;
        return result;
    }

    async changePassword(userId: string, dto: { currentPassword: string; newPassword: string }) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new UnauthorizedException('Kullanıcı bulunamadı');
        }

        const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
        if (!isValid) {
            throw new UnauthorizedException('Mevcut şifre hatalı');
        }

        const passwordHash = await bcrypt.hash(dto.newPassword, 10);
        await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });

        await this.prisma.auditLog.create({
            data: {
                userId,
                action: 'UPDATE',
                entityType: 'User',
                entityId: userId,
                newValue: { event: 'CHANGE_PASSWORD' },
            },
        });

        return { message: 'Şifre başarıyla değiştirildi' };
    }

    private async generateTokens(user: any): Promise<TokenResponseDto> {
        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role.name,
        };

        const accessToken = this.jwtService.sign(payload, {
            secret: this.configService.get<string>('JWT_SECRET'),
            expiresIn: '1d', // 1 day
        });

        const refreshToken = this.jwtService.sign(payload, {
            secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
            expiresIn: '7d', // 7 days (kept as is, but explicit string)
        });

        // Store refresh token in database
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await this.prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt,
            },
        });

        // Log login
        await this.prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'LOGIN',
                entityType: 'User',
                entityId: user.id,
            },
        });

        return {
            accessToken,
            refreshToken,
            expiresIn: 86400, // 1 day in seconds
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role.name,
            },
        };
    }
}
