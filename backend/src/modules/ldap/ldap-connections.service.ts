import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import type { LdapConnection } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { DEFAULT_PORTS, LdapService, type LdapSettings } from './ldap.service';
import type { CreateLdapUserDto, LdapConnectionDto, LdapTestDto } from './dto/ldap.dto';

/** Yanıtta servis hesabı şifresi asla dönmez; yalnız tanımlı olup olmadığı. */
export function publicConnection(c: LdapConnection & { _count?: { users: number } }) {
    const { bindPasswordEnc, ...rest } = c;
    return { ...rest, hasBindPassword: !!bindPasswordEnc, userCount: c._count?.users ?? undefined };
}

@Injectable()
export class LdapConnectionsService {
    constructor(private prisma: PrismaService, private ldap: LdapService) { }

    private validate(d: LdapConnectionDto) {
        if (d.protocol === 'LDAPS' && d.startTls) throw new BadRequestException('StartTLS yalnız LDAP (389) protokolünde kullanılır; LDAPS zaten şifrelidir.');
    }

    private data(d: LdapConnectionDto) {
        return {
            name: d.name.trim(), host: d.host.trim(), protocol: d.protocol, port: d.port ?? DEFAULT_PORTS[d.protocol],
            startTls: d.protocol === 'LDAP' ? !!d.startTls : false,
            tlsRejectUnauthorized: d.tlsRejectUnauthorized ?? true,
            caCertificate: d.caCertificate?.trim() || null,
            baseDn: d.baseDn.trim(), bindDn: d.bindDn?.trim() || null,
            ...(d.userFilter ? { userFilter: d.userFilter.trim() } : {}),
            ...(d.usernameAttribute ? { usernameAttribute: d.usernameAttribute.trim() } : {}),
            ...(d.emailAttribute ? { emailAttribute: d.emailAttribute.trim() } : {}),
            ...(d.firstNameAttribute ? { firstNameAttribute: d.firstNameAttribute.trim() } : {}),
            ...(d.lastNameAttribute ? { lastNameAttribute: d.lastNameAttribute.trim() } : {}),
            ...(d.departmentAttribute !== undefined ? { departmentAttribute: d.departmentAttribute.trim() || null } : {}),
            ...(d.timeoutMs ? { timeoutMs: d.timeoutMs } : {}),
            ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
        };
    }

    async list() {
        const rows = await this.prisma.ldapConnection.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { users: true } } } });
        return rows.map(publicConnection);
    }

    async create(d: LdapConnectionDto, userId: string) {
        this.validate(d);
        if (await this.prisma.ldapConnection.findUnique({ where: { name: d.name.trim() } })) throw new ConflictException('Bu adla bir LDAP bağlantısı zaten var.');
        const bindPasswordEnc = d.bindPassword ? this.ldap.encryptBindPassword(d.bindPassword) : null;
        return this.prisma.$transaction(async (tx) => {
            const c = await tx.ldapConnection.create({ data: { ...this.data(d), bindPasswordEnc, createdById: userId } });
            await tx.auditLog.create({ data: { userId, action: 'LDAP_CONNECTION_CREATE', entityType: 'LdapConnection', entityId: c.id, newValue: publicConnection(c) as any } });
            return publicConnection(c);
        });
    }

    async update(id: string, d: LdapConnectionDto, userId: string) {
        this.validate(d);
        const old = await this.ldap.loadConnection(id);
        const clash = await this.prisma.ldapConnection.findUnique({ where: { name: d.name.trim() } });
        if (clash && clash.id !== id) throw new ConflictException('Bu adla bir LDAP bağlantısı zaten var.');
        const pw = d.clearBindPassword ? { bindPasswordEnc: null } : d.bindPassword ? { bindPasswordEnc: this.ldap.encryptBindPassword(d.bindPassword) } : {};
        return this.prisma.$transaction(async (tx) => {
            const c = await tx.ldapConnection.update({ where: { id }, data: { ...this.data(d), ...pw } });
            await tx.auditLog.create({
                data: {
                    userId, action: 'LDAP_CONNECTION_UPDATE', entityType: 'LdapConnection', entityId: id,
                    oldValue: publicConnection(old) as any, newValue: { ...publicConnection(c), bindPasswordChanged: 'bindPasswordEnc' in pw } as any,
                },
            });
            return publicConnection(c);
        });
    }

    async remove(id: string, userId: string) {
        const c = await this.ldap.loadConnection(id);
        const users = await this.prisma.user.count({ where: { ldapConnectionId: id } });
        if (users > 0) throw new ConflictException(`Bu bağlantıya bağlı ${users} kullanıcı var; silmek yerine pasifleştirin.`);
        return this.prisma.$transaction(async (tx) => {
            await tx.ldapConnection.delete({ where: { id } });
            await tx.auditLog.create({ data: { userId, action: 'LDAP_CONNECTION_DELETE', entityType: 'LdapConnection', entityId: id, oldValue: publicConnection(c) as any } });
            return { deleted: true };
        });
    }

    /** Formdaki (kaydedilmemiş) ayarlarla test; şifre boşsa ve bağlantı kayıtlıysa kayıtlı şifre kullanılır. */
    async testDraft(d: LdapTestDto) {
        this.validate(d);
        let bindPassword: string | null = d.bindPassword ?? null;
        if (!bindPassword && d.connectionId && !d.clearBindPassword) {
            bindPassword = this.ldap.settingsOf(await this.ldap.loadConnection(d.connectionId)).bindPassword ?? null;
        }
        const base = this.data(d);
        const s: LdapSettings = {
            ...base, bindPassword,
            userFilter: base.userFilter ?? '(uid={{username}})', usernameAttribute: base.usernameAttribute ?? 'uid', emailAttribute: base.emailAttribute ?? 'mail',
            firstNameAttribute: base.firstNameAttribute ?? 'givenName', lastNameAttribute: base.lastNameAttribute ?? 'sn', timeoutMs: base.timeoutMs ?? 8000,
            departmentAttribute: base.departmentAttribute ?? 'department',
        };
        return this.ldap.test(s);
    }

    async testSaved(id: string, userId: string) {
        const c = await this.ldap.loadConnection(id);
        const r = await this.ldap.test(this.ldap.settingsOf(c));
        await this.prisma.$transaction(async (tx) => {
            await tx.ldapConnection.update({ where: { id }, data: { lastTestAt: new Date(), lastTestOk: r.ok, lastTestMessage: r.message } });
            await tx.auditLog.create({ data: { userId, action: 'LDAP_CONNECTION_TEST', entityType: 'LdapConnection', entityId: id, newValue: { ok: r.ok, message: r.message } } });
        });
        return r;
    }

    /** Dizinde arama; sonuçta uygulamaya zaten eklenmiş olanlar işaretlenir. */
    async search(id: string, q: string) {
        const c = await this.ldap.loadConnection(id);
        if (!c.isActive) throw new BadRequestException('Pasif LDAP bağlantısında arama yapılamaz.');
        const found = await this.ldap.search(this.ldap.settingsOf(c), q);
        const existing = await this.prisma.user.findMany({
            where: { OR: [{ ldapConnectionId: id, ldapUsername: { in: found.map(f => f.username) } }, { email: { in: found.map(f => f.email).filter((x): x is string => !!x) } }] },
            select: { id: true, email: true, ldapUsername: true, ldapConnectionId: true },
        });
        return found.map(f => {
            const hit = existing.find(u => (u.ldapConnectionId === id && u.ldapUsername === f.username) || (!!f.email && u.email.toLowerCase() === f.email.toLowerCase()));
            return { ...f, alreadyExists: !!hit, existingUserId: hit?.id ?? null };
        });
    }

    /**
     * Dizinden kullanıcı ekleme: kayıt LDAP'tan okunur (ad, soyad, e-posta istemciden alınmaz), rol yönetici
     * seçer. Yerel şifre yoktur (kullanılamaz rastgele hash) — giriş şifresi LDAP'ta doğrulanır.
     */
    async createUser(d: CreateLdapUserDto, adminId: string) {
        const c = await this.ldap.loadConnection(d.connectionId);
        if (!c.isActive) throw new BadRequestException('Pasif LDAP bağlantısından kullanıcı eklenemez.');
        const role = await this.prisma.role.findUnique({ where: { id: d.roleId }, select: { id: true } });
        if (!role) throw new BadRequestException('Geçersiz rol: seçilen rol bulunamadı');
        const entry = await this.ldap.findUser(this.ldap.settingsOf(c), d.username.trim()).catch(e => {
            throw new BadRequestException(e?.message ?? 'Dizine ulaşılamadı');
        });
        if (!entry) throw new BadRequestException('Kullanıcı dizinde bulunamadı veya birden fazla kayıtla eşleşti.');
        if (!entry.email) throw new BadRequestException(`Dizindeki kullanıcının e-posta özniteliği (${c.emailAttribute}) boş; e-posta olmadan eklenemez.`);
        const email = entry.email.toLowerCase();
        const dup = await this.prisma.user.findFirst({
            where: { OR: [{ email: { equals: email, mode: 'insensitive' } }, { ldapConnectionId: c.id, ldapUsername: entry.username }] },
            select: { id: true },
        });
        if (dup) throw new ConflictException('Bu kullanıcı uygulamada zaten kayıtlı (aynı e-posta veya dizin kullanıcı adı).');
        const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10); // kullanılamaz; LDAP kullanıcısı yerel şifreyle giremez
        return this.prisma.$transaction(async (tx) => {
            const u = await tx.user.create({
                data: {
                    email, passwordHash, firstName: entry.firstName || entry.username, lastName: entry.lastName || '-',
                    department: d.department?.trim() || entry.department, roleId: d.roleId,
                    authSource: 'LDAP', ldapConnectionId: c.id, ldapDn: entry.dn, ldapUsername: entry.username,
                },
                include: { role: true, ldapConnection: { select: { id: true, name: true } } },
            });
            // E-posta denetim kaydına yazılmaz (kişisel veri; kimlik cuid ile izlenir).
            await tx.auditLog.create({
                data: { userId: adminId, action: 'CREATE', entityType: 'User', entityId: u.id, newValue: { authSource: 'LDAP', ldapConnectionId: c.id, roleId: d.roleId } },
            });
            const { passwordHash: _ph, ...rest } = u;
            return rest;
        });
    }
}
