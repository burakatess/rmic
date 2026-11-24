import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma';
import { LoginDto, RegisterDto, TokenResponseDto } from './dto';
import { LdapService } from '../ldap/ldap.service';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private configService: ConfigService,
        private ldap: LdapService,
    ) { }

    /**
     * Giriş: tanımlayıcı e-posta veya (LDAP kullanıcısı için) dizin kullanıcı adıdır.
     * - LOCAL: bcrypt ile yerel şifre.
     * - LDAP : şifre kullanıcının bağlı olduğu LDAP bağlantısında bind ile doğrulanır; yerel şifre
     *   hiç denenmez. Yalnız yöneticinin eklediği LDAP kullanıcıları girebilir (otomatik oluşturma yok).
     * Hata yanıtı her durumda aynıdır (kullanıcı/kaynak bilgisi sızdırılmaz); ayrıntı denetim izinde.
     */
    async validateUser(identifier: string, password: string) {
        const id = identifier.trim();
        const user = (id.includes('@') ? await this.prisma.user.findFirst({ where: { email: { equals: id, mode: 'insensitive' } }, include: { role: true, ldapConnection: true } }) : null)
            ?? await this.prisma.user.findFirst({ where: { authSource: 'LDAP', ldapUsername: { equals: id, mode: 'insensitive' } }, include: { role: true, ldapConnection: true } });

        if (!user || !user.isActive) {
            await this.logFailedLogin(id, user ? 'INACTIVE_USER' : 'UNKNOWN_USER', user?.id);
            throw new UnauthorizedException('Invalid credentials');
        }

        if (user.authSource === 'LDAP') {
            const conn = user.ldapConnection;
            if (!conn || !conn.isActive || !user.ldapUsername) {
                await this.logFailedLogin(id, 'LDAP_CONNECTION_INACTIVE', user.id);
                throw new UnauthorizedException('Invalid credentials');
            }
            let result;
            try { result = await this.ldap.authenticate(this.ldap.settingsOf(conn), user.ldapUsername, password, user.ldapDn); }
            catch { result = { ok: false as const, reason: 'UNAVAILABLE' as const }; }
            if (!result.ok) {
                await this.logFailedLogin(id, result.reason === 'INVALID_PASSWORD' ? 'INVALID_PASSWORD' : result.reason === 'USER_NOT_FOUND' ? 'LDAP_USER_NOT_FOUND' : 'LDAP_UNAVAILABLE', user.id, 'LDAP');
                throw new UnauthorizedException('Invalid credentials');
            }
            if (result.dn !== user.ldapDn) {
                // Dizinde taşınan kullanıcının güncel DN'i (bir sonraki girişte servis araması başarısızsa yedek).
                await this.prisma.user.update({ where: { id: user.id }, data: { ldapDn: result.dn } }).catch(() => undefined);
            }
            return user;
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            await this.logFailedLogin(id, 'INVALID_PASSWORD', user.id);
            throw new UnauthorizedException('Invalid credentials');
        }

        return user;
    }

    /**
     * Başarısız giriş güvenlik olayı (SIEM: action=LOGIN_FAILED). Parola ASLA yazılmaz;
     * e-posta yalnız maskeli tutulur (KVKK — entityId olarak kullanılmaz). IP/UA merkezi
     * istek bağlamından eklenir. Log hatası girişin yanıtını değiştirmez.
     */
    private async logFailedLogin(
        email: string,
        reason: 'UNKNOWN_USER' | 'INACTIVE_USER' | 'INVALID_PASSWORD' | 'LDAP_USER_NOT_FOUND' | 'LDAP_UNAVAILABLE' | 'LDAP_CONNECTION_INACTIVE',
        userId?: string,
        authSource: 'LOCAL' | 'LDAP' = 'LOCAL',
    ) {
        try {
            await this.prisma.auditLog.create({
                data: {
                    userId: userId ?? null,
                    action: 'LOGIN_FAILED',
                    entityType: 'User',
                    entityId: userId ?? 'UNKNOWN',
                    newValue: { reason, authSource, email: email.includes('@') ? maskEmail(email) : `${email.slice(0, 2)}***` },
                },
            });
        } catch {
            // Denetim izi yazılamasa da kimlik doğrulama yanıtı aynı kalmalı.
        }
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
        // Kullanıcı + denetim kaydı tek işlemde.
        const user = await this.prisma.$transaction(async (tx) => {
            const created = await tx.user.create({
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
            await tx.auditLog.create({
                data: {
                    userId: created.id,
                    action: 'CREATE',
                    entityType: 'User',
                    entityId: created.id,
                    newValue: { email: created.email, firstName: created.firstName, lastName: created.lastName },
                },
            });
            return created;
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

            if (!storedToken || storedToken.expiresAt < new Date() || storedToken.userId !== payload.sub) {
                throw new UnauthorizedException('Invalid refresh token');
            }

            // Pasif kullanıcı refresh ile yeni oturum alamaz; kalan tüm refresh token'ları iptal edilir.
            if (!storedToken.user.isActive) {
                await this.prisma.refreshToken.deleteMany({ where: { userId: storedToken.userId } });
                throw new UnauthorizedException('Invalid refresh token');
            }

            // Tek kullanımlık rotasyon: aynı token'la eşzamanlı iki istekten yalnızca biri
            // yeni oturum alır (koşullu silme count=1).
            const consumed = await this.prisma.refreshToken.deleteMany({
                where: { id: storedToken.id },
            });
            if (consumed.count !== 1) {
                throw new UnauthorizedException('Invalid refresh token');
            }

            // Generate new tokens
            return this.generateTokens(storedToken.user);
        } catch {
            throw new UnauthorizedException('Invalid refresh token');
        }
    }

    async logout(userId: string, refreshToken?: string): Promise<void> {
        return this.prisma.$transaction(async (tx) => {
            if (refreshToken) {
                // Delete specific refresh token
                await tx.refreshToken.deleteMany({
                    where: { token: refreshToken },
                });
            } else {
                // Delete all refresh tokens for user
                await tx.refreshToken.deleteMany({
                    where: { userId },
                });
            }

            // Log the action
            await tx.auditLog.create({
                data: {
                    userId,
                    action: 'LOGOUT',
                    entityType: 'User',
                    entityId: userId,
                },
            });
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
        return this.prisma.$transaction(async (tx) => {
            const user = await tx.user.update({
                where: { id: userId },
                data: {
                    firstName: dto.firstName,
                    lastName: dto.lastName,
                    department: dto.department ?? null,
                },
                include: { role: true },
            });

            await tx.auditLog.create({
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
        });
    }

    async changePassword(userId: string, dto: { currentPassword: string; newPassword: string }) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new UnauthorizedException('Kullanıcı bulunamadı');
        }
        if (user.authSource === 'LDAP') {
            throw new BadRequestException('Şifreniz kurum dizininde (LDAP) yönetilir; uygulamadan değiştirilemez.');
        }

        const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
        if (!isValid) {
            throw new UnauthorizedException('Mevcut şifre hatalı');
        }

        const passwordHash = await bcrypt.hash(dto.newPassword, 10);
        // Şifre + oturum iptali + güvenlik olayı tek transaction'da. Parola değişince kalan tüm
        // refresh token'lar iptal edilir: diğer cihazlardaki oturumlar yenilenemez (mevcut access
        // token en geç kısa ömrü dolunca düşer).
        await this.prisma.$transaction(async (tx) => {
            await tx.user.update({ where: { id: userId }, data: { passwordHash } });
            const revoked = await tx.refreshToken.deleteMany({ where: { userId } });
            await tx.auditLog.create({
                data: {
                    userId,
                    action: 'CHANGE_PASSWORD',
                    entityType: 'User',
                    entityId: userId,
                    newValue: { event: 'CHANGE_PASSWORD', revokedSessions: revoked.count },
                },
            });
        });

        return { message: 'Şifre başarıyla değiştirildi; diğer oturumlar sonlandırıldı.' };
    }

    private async generateTokens(user: any): Promise<TokenResponseDto> {
        // jti: aynı saniyede iki giriş aynı JWT'yi üretiyordu → RefreshToken.token tekil kısıtı 500 veriyordu.
        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role.name,
            jti: randomUUID(),
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

        await this.prisma.$transaction(async (tx) => {
            await tx.refreshToken.create({
                data: {
                    token: refreshToken,
                    userId: user.id,
                    expiresAt,
                },
            });

            // Log login
            await tx.auditLog.create({
                data: {
                    userId: user.id,
                    action: 'LOGIN',
                    entityType: 'User',
                    entityId: user.id,
                    newValue: { authSource: user.authSource ?? 'LOCAL' },
                },
            });
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

/** a****@kurum.com — kullanıcı adı maskelenir, alan adı korunur (deneme kalıplarını izlemek için). */
export function maskEmail(email: string): string {
    const value = String(email ?? '').trim().toLowerCase().slice(0, 254);
    const at = value.lastIndexOf('@');
    if (at <= 0) return '***';
    return `${value[0]}***${value.slice(at)}`;
}
