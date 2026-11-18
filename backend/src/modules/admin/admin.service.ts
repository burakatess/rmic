import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { isKnownPermission, LEGACY_PERMISSION_MAP, PERMISSION_CATALOG, PERMISSION_GROUPS } from '../../common/permissions/permission-catalog';
import { Prisma } from '@prisma/client';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { PrismaService } from '../../prisma';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
    constructor(private prisma: PrismaService) { }

    // User Management
    async findAllUsers(params?: { search?: string; roleId?: string; isActive?: boolean }) {
        const where: Record<string, unknown> = {};

        if (params?.search) {
            where.OR = [
                { email: { contains: params.search, mode: 'insensitive' } },
                { firstName: { contains: params.search, mode: 'insensitive' } },
                { lastName: { contains: params.search, mode: 'insensitive' } },
            ];
        }
        if (params?.roleId) where.roleId = params.roleId;
        if (params?.isActive !== undefined) where.isActive = params.isActive;

        const users = await this.prisma.user.findMany({
            where,
            include: { role: true, directorateMemberships: { select: { directorateId: true } } },
            orderBy: { createdAt: 'desc' },
        });

        return users.map(({ passwordHash, ...user }) => user);
    }

    async findUserOptions(params: { search?: string; page: number; limit: number; approver?: boolean }) {
        const where: Prisma.UserWhereInput = params.search ? { OR: [
            { firstName: { contains: params.search, mode: 'insensitive' as const } },
            { lastName: { contains: params.search, mode: 'insensitive' as const } },
        ] } : {};
        // approver=true: ikinci kontrolcü olabilecekler (onay yetkili roller, aktif) — rol bilgisi dönmez.
        if (params.approver) Object.assign(where, { isActive: true, role: { name: { in: ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER'] } } });
        const [data, total] = await Promise.all([
            this.prisma.user.findMany({
                where, skip: (params.page - 1) * params.limit, take: params.limit,
                // Seçim listeleri için asgari alan seti: e-posta, rol/izin, üyelik ve oturum bilgisi dönmez.
                select: { id: true, firstName: true, lastName: true, department: true, isActive: true },
                orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
            }),
            this.prisma.user.count({ where }),
        ]);
        return { data, pagination: { total, page: params.page, limit: params.limit, totalPages: Math.ceil(total / params.limit) } };
    }

    async findUserById(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            include: {
                role: true,
                directorateMemberships: { include: { directorate: { select: { id: true, name: true } } } },
            },
        });

        if (!user) throw new NotFoundException('User not found');

        const { passwordHash, ...result } = user;
        return result;
    }

    // "Birimim" kapsamı için kullanıcı ↔ direktörlük yetkilendirmesi. Tam
    // liste değişimi (set-replace), transaction + audit (Madde 6).
    async setUserDirectorates(id: string, directorateIds: string[], updatedBy: string) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) throw new NotFoundException('User not found');

        const uniqueIds = [...new Set(directorateIds)];
        if (uniqueIds.length > 0) {
            const found = await this.prisma.directorate.findMany({ where: { id: { in: uniqueIds } }, select: { id: true } });
            if (found.length !== uniqueIds.length) {
                throw new NotFoundException('Geçersiz direktörlük seçildi');
            }
        }

        const before = await this.prisma.directorateMembership.findMany({ where: { userId: id }, select: { directorateId: true } });

        await this.prisma.$transaction(async (tx) => {
            await tx.directorateMembership.deleteMany({ where: { userId: id } });
            if (uniqueIds.length > 0) {
                await tx.directorateMembership.createMany({
                    data: uniqueIds.map((directorateId) => ({ userId: id, directorateId, createdById: updatedBy })),
                });
            }
            await tx.auditLog.create({
                data: {
                    userId: updatedBy,
                    action: 'UPDATE',
                    entityType: 'DirectorateMembership',
                    entityId: id,
                    oldValue: { directorateIds: before.map(b => b.directorateId) },
                    newValue: { directorateIds: uniqueIds },
                },
            });
        });

        return this.findUserById(id);
    }

    async createUser(data: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        department?: string;
        roleId: string;
    }, createdBy: string) {
        const existingUser = await this.prisma.user.findUnique({
            where: { email: data.email },
        });

        if (existingUser) {
            throw new ConflictException('User with this email already exists');
        }

        const passwordHash = await bcrypt.hash(data.password, 10);

        const role = await this.prisma.role.findUnique({ where: { id: data.roleId }, select: { id: true } });
        if (!role) throw new BadRequestException('Geçersiz rol: seçilen rol bulunamadı');

        // Kullanıcı + denetim kaydı tek transaction'da. E-posta denetim kaydına yazılmaz
        // (kişisel veri; kimlik cuid ile izlenir).
        const user = await this.prisma.$transaction(async (tx) => {
            const created = await tx.user.create({
                data: {
                    email: data.email,
                    passwordHash,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    department: data.department,
                    roleId: data.roleId,
                },
                include: { role: true },
            });
            await tx.auditLog.create({
                data: {
                    userId: createdBy,
                    action: 'USER_CREATE',
                    entityType: 'User',
                    entityId: created.id,
                    newValue: { roleId: created.roleId, roleName: created.role.name },
                },
            });
            return created;
        });

        const { passwordHash: _, ...result } = user;
        return result;
    }

    async updateUser(
        id: string,
        data: {
            firstName?: string;
            lastName?: string;
            department?: string;
            roleId?: string;
            isActive?: boolean;
        },
        updatedBy: string,
    ) {
        const user = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
        if (!user) throw new NotFoundException('User not found');

        // Kritik değişiklik (rol / aktiflik) + audit AYNI transaction'da (Madde 6).
        const updated = await this.prisma.$transaction(async (tx) => {
            const u = await tx.user.update({ where: { id }, data, include: { role: true } });
            // Pasife alınan kullanıcının açık oturumları (refresh token) iptal edilir;
            // access token zaten her istekte JwtStrategy'de isActive ile reddedilir.
            if (data.isActive === false && user.isActive) {
                await tx.refreshToken.deleteMany({ where: { userId: id } });
            }
            await tx.auditLog.create({
                data: {
                    userId: updatedBy,
                    action:
                        data.roleId !== undefined && data.roleId !== user.roleId ? 'ROLE_CHANGE'
                        : data.isActive !== undefined && data.isActive !== user.isActive ? 'USER_ACTIVATION_CHANGE'
                        : 'UPDATE',
                    entityType: 'User',
                    entityId: id,
                    oldValue: {
                        firstName: user.firstName, lastName: user.lastName, department: user.department,
                        isActive: user.isActive, roleId: user.roleId, roleName: user.role.name,
                    },
                    newValue: {
                        ...data,
                        ...(data.roleId ? { roleName: u.role.name } : {}),
                    },
                },
            });
            return u;
        });

        const { passwordHash, ...result } = updated;
        void passwordHash;
        return result;
    }

    async resetPassword(id: string, newPassword: string, resetBy: string) {
        const passwordHash = await bcrypt.hash(newPassword, 10);
        await this.prisma.$transaction(async (tx) => {
            await tx.user.update({ where: { id }, data: { passwordHash } });
            // Şifre/haş ASLA loglanmaz — yalnızca olay.
            await tx.auditLog.create({
                data: { userId: resetBy, action: 'PASSWORD_RESET', entityType: 'User', entityId: id },
            });
        });
        return { message: 'Password reset successfully' };
    }

    // Role Management
    async findAllRoles() {
        return this.prisma.role.findMany({
            include: {
                _count: { select: { users: true } },
            },
            orderBy: { name: 'asc' },
        });
    }

    async findRoleById(id: string) {
        const role = await this.prisma.role.findUnique({
            where: { id },
            include: {
                users: {
                    select: { id: true, email: true, firstName: true, lastName: true },
                },
            },
        });

        if (!role) throw new NotFoundException('Role not found');
        return role;
    }

    // Kanonik katalog (rol ekranı bunu API'den alır; frontend'de elle tutulan liste yok).
    getPermissionCatalog() {
        return { groups: PERMISSION_GROUPS, permissions: PERMISSION_CATALOG, legacy: LEGACY_PERMISSION_MAP };
    }

    /**
     * Bilinmeyen izin anahtarı role ATANAMAZ. Rolde zaten bulunan eski anahtarlar (eski
     * rol ekranından kalma) sessizce silinmez; korunabilir ama yenisi eklenemez.
     */
    private assertKnownPermissions(next: string[], previous: unknown = []) {
        const prev = new Set(Array.isArray(previous) ? previous.filter((p): p is string => typeof p === 'string') : []);
        const unknown = [...new Set(next)].filter(p => !isKnownPermission(p) && !prev.has(p));
        if (unknown.length > 0) {
            throw new BadRequestException(`Bilinmeyen izin anahtarı: ${unknown.join(', ')}. Geçerli anahtarlar için izin kataloğuna bakın.`);
        }
    }

    async createRole(data: {
        name: string;
        description?: string;
        permissions: string[];
    }, userId: string) {
        this.assertKnownPermissions(data.permissions);
        return this.prisma.$transaction(async (tx) => {
            const role = await tx.role.create({ data });
            await tx.auditLog.create({
                data: {
                    userId, action: 'ROLE_CREATE', entityType: 'Role', entityId: role.id,
                    newValue: { name: role.name, permissions: role.permissions },
                },
            });
            return role;
        });
    }

    async updateRole(
        id: string,
        data: {
            name?: string;
            description?: string;
            permissions?: string[];
        },
        userId: string,
    ) {
        const before = await this.prisma.role.findUnique({ where: { id } });
        if (!before) throw new NotFoundException('Role not found');
        if (data.permissions !== undefined) {
            this.assertKnownPermissions(data.permissions, before.permissions);
            data = { ...data, permissions: [...new Set(data.permissions)] };
        }
        return this.prisma.$transaction(async (tx) => {
            const role = await tx.role.update({ where: { id }, data });
            await tx.auditLog.create({
                data: {
                    userId,
                    action: data.permissions !== undefined ? 'PERMISSION_CHANGE' : 'ROLE_UPDATE',
                    entityType: 'Role', entityId: id,
                    oldValue: { name: before.name, permissions: before.permissions },
                    newValue: { name: role.name, permissions: role.permissions },
                },
            });
            return role;
        });
    }

    // Parameters Management
    async findAllParameters(category?: string) {
        const where = category ? { category } : {};
        return this.prisma.parameter.findMany({
            where,
            orderBy: [{ category: 'asc' }, { key: 'asc' }],
        });
    }

    async updateParameter(id: string, value: unknown, updatedBy: string) {
        const param = await this.prisma.parameter.findUnique({ where: { id } });
        if (!param) throw new NotFoundException('Parameter not found');

        const updated = await this.prisma.parameter.update({
            where: { id },
            data: { value: value as object },
        });

        await this.prisma.auditLog.create({
            data: {
                userId: updatedBy,
                action: 'UPDATE',
                entityType: 'Parameter',
                entityId: id,
                oldValue: param.value as object,
                newValue: value as object,
            },
        });

        return updated;
    }

    // Audit Logs
    // Denetim izi listesi — sunucu taraflı sayfalama (toplam sayı + sayfa). Kayıtlar salt
    // okunurdur; bu metot yalnız okur. Tarih-yalnız bitiş değeri o günü TAMAMEN kapsar.
    async findAuditLogsPage(q: AuditLogQueryDto) {
        const page = q.page ?? 1;
        const pageSize = q.pageSize ?? 50;
        const where = buildAuditWhere(q);

        const [data, total] = await Promise.all([
            this.prisma.auditLog.findMany({
                where,
                include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
                // Eşit zaman damgalarında deterministik sıra (sayfalar arası kayma olmasın).
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.auditLog.count({ where }),
        ]);
        return { data, pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } };
    }

    // SIEM Export
    // Liste ekranıyla AYNI filtre (buildAuditWhere) — ekranda görülen ile indirilen aynı küme.
    async exportAuditLogs(params: AuditLogQueryDto & { limit?: number }, format: 'cef' | 'leef' | 'json') {
        const logs = await this.prisma.auditLog.findMany({
            where: buildAuditWhere(params),
            include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: Math.min(params.limit || 10000, 50000),
        });

        const sevMap: Record<string, number> = { DELETE: 7, LOGIN_FAILED: 6, ROLE_CHANGE: 6, USER_ACTIVATION_CHANGE: 5, PASSWORD_RESET: 5, UPDATE: 4, CREATE: 3, APPROVAL: 4, LOGIN: 2, LOGOUT: 1 };
        const esc = (v: unknown) => String(v ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/=/g, '\\=').replace(/[\r\n\t]/g, ' ');

        const lines = logs.map((log: any) => {
            const ts = new Date(log.createdAt).getTime();
            const email = log.user?.email ?? 'system';
            switch (format) {
                case 'cef':
                    return `CEF:0|RMIC|GRC|1.0|${esc(log.action)}|${esc(log.action)} ${esc(log.entityType)}|${sevMap[log.action] ?? 3}|end=${ts} suser=${esc(email)} act=${esc(log.action)} cs1Label=entityType cs1=${esc(log.entityType)} cs2Label=entityId cs2=${esc(log.entityId)} cs3Label=actorType cs3=${esc(log.actorType ?? 'UNKNOWN')}${log.ipAddress ? ` src=${esc(log.ipAddress)}` : ''}${log.userAgent ? ` requestClientApplication=${esc(log.userAgent)}` : ''}`;
                case 'leef':
                    return `LEEF:2.0|RMIC|GRC|1.0|${esc(log.action)}|devTime=${new Date(log.createdAt).toISOString()}\tusrName=${email}\taction=${log.action}\tentityType=${log.entityType}\tentityId=${log.entityId}${log.ipAddress ? `\tsrc=${log.ipAddress}` : ''}`;
                case 'json':
                default:
                    return JSON.stringify({
                        timestamp: new Date(log.createdAt).toISOString(),
                        vendor: 'RMIC', product: 'GRC', version: '1.0',
                        severity: sevMap[log.action] ?? 3,
                        user: email,
                        action: log.action,
                        entityType: log.entityType,
                        entityId: log.entityId,
                        ipAddress: log.ipAddress ?? null,
                        actorType: log.actorType ?? null,
                        userAgent: log.userAgent ?? null,
                        oldValue: log.oldValue ?? null,
                        newValue: log.newValue ?? null,
                    });
            }
        });

        return lines.join('\n');
    }

    // SIEM Config (Parameter tablosunda saklanır)
    private readonly SIEM_CONFIG_KEY = 'siem_export_config';

    async getSiemConfig() {
        const param = await this.prisma.parameter.findUnique({ where: { key: this.SIEM_CONFIG_KEY } });
        return param?.value ?? { format: 'CEF', syslogHost: '', syslogPort: 514, enabled: false };
    }

    async updateSiemConfig(value: Record<string, unknown>, userId: string) {
        const updated = await this.prisma.parameter.upsert({
            where: { key: this.SIEM_CONFIG_KEY },
            update: { value: value as object },
            create: {
                category: 'SIEM',
                key: this.SIEM_CONFIG_KEY,
                value: value as object,
                description: 'SIEM dışa aktarım / syslog yönlendirme yapılandırması',
            },
        });

        await this.prisma.auditLog.create({
            data: {
                userId,
                action: 'UPDATE',
                entityType: 'Parameter',
                entityId: updated.id,
                newValue: value as object,
            },
        });

        return updated.value;
    }

    // Risk Categories Management
    async findAllRiskCategories() {
        return this.prisma.riskCategory.findMany({
            include: {
                _count: { select: { risks: true } },
            },
            orderBy: { name: 'asc' },
        });
    }

    async createRiskCategory(data: { name: string; description?: string; color?: string }) {
        return this.prisma.riskCategory.create({ data });
    }

    async updateRiskCategory(id: string, data: { name?: string; description?: string; color?: string }) {
        return this.prisma.riskCategory.update({
            where: { id },
            data,
        });
    }

    // System Options Management (Dynamic Dropdowns)
    async findAllSystemOptions(category?: string, activeOnly: boolean = false) {
        const where: Record<string, unknown> = {};
        if (category) where.category = category;
        if (activeOnly) where.isActive = true;

        return this.prisma.systemOption.findMany({
            where,
            orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
        });
    }

    async findSystemOptionsByCategory(category: string, activeOnly: boolean = true) {
        return this.prisma.systemOption.findMany({
            where: {
                category,
                ...(activeOnly ? { isActive: true } : {}),
            },
            orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        });
    }

    async createSystemOption(data: {
        category: string;
        value: string;
        label: string;
        labelEn?: string;
        color?: string;
        icon?: string;
        sortOrder?: number;
        isDefault?: boolean;
    }) {
        return this.prisma.systemOption.create({ data });
    }

    async updateSystemOption(
        id: string,
        data: {
            label?: string;
            labelEn?: string;
            color?: string;
            icon?: string;
            sortOrder?: number;
            isActive?: boolean;
            isDefault?: boolean;
        }
    ) {
        return this.prisma.systemOption.update({
            where: { id },
            data,
        });
    }

    async deleteSystemOption(id: string) {
        return this.prisma.systemOption.delete({ where: { id } });
    }

    async getOptionCategories() {
        const options = await this.prisma.systemOption.findMany({
            select: { category: true },
            distinct: ['category'],
            orderBy: { category: 'asc' },
        });
        return options.map((o: { category: string }) => o.category);
    }

    // Seed default options
    async seedDefaultOptions() {
        const defaultOptions = [
            // Control Frequency
            { category: 'CONTROL_FREQUENCY', value: 'CONTINUOUS', label: 'Sürekli', labelEn: 'Continuous', sortOrder: 1 },
            { category: 'CONTROL_FREQUENCY', value: 'DAILY', label: 'Günlük', labelEn: 'Daily', sortOrder: 2 },
            { category: 'CONTROL_FREQUENCY', value: 'WEEKLY', label: 'Haftalık', labelEn: 'Weekly', sortOrder: 3 },
            { category: 'CONTROL_FREQUENCY', value: 'MONTHLY', label: 'Aylık', labelEn: 'Monthly', sortOrder: 4 },
            { category: 'CONTROL_FREQUENCY', value: 'QUARTERLY', label: 'Üç Aylık', labelEn: 'Quarterly', sortOrder: 5 },
            { category: 'CONTROL_FREQUENCY', value: 'ANNUAL', label: 'Yıllık', labelEn: 'Annual', sortOrder: 6 },
            { category: 'CONTROL_FREQUENCY', value: 'EVENT_BASED', label: 'Olay Bazlı', labelEn: 'Event-based', sortOrder: 7 },

            // Control Type
            { category: 'CONTROL_TYPE', value: 'IT_GENERAL', label: 'IT Genel', labelEn: 'IT General', color: 'bg-blue-100 text-blue-700', sortOrder: 1 },
            { category: 'CONTROL_TYPE', value: 'IT_APPLICATION', label: 'IT Uygulama', labelEn: 'IT Application', color: 'bg-indigo-100 text-indigo-700', sortOrder: 2 },
            { category: 'CONTROL_TYPE', value: 'OPERATIONAL', label: 'Operasyonel', labelEn: 'Operational', color: 'bg-gray-100 text-gray-700', sortOrder: 3 },
            { category: 'CONTROL_TYPE', value: 'FINANCIAL', label: 'Finansal', labelEn: 'Financial', color: 'bg-emerald-100 text-emerald-700', sortOrder: 4 },
            { category: 'CONTROL_TYPE', value: 'COMPLIANCE', label: 'Uyum', labelEn: 'Compliance', color: 'bg-purple-100 text-purple-700', sortOrder: 5 },

            // Control Nature
            { category: 'CONTROL_NATURE', value: 'PREVENTIVE', label: 'Önleyici', labelEn: 'Preventive', color: 'bg-sky-100 text-sky-700', sortOrder: 1 },
            { category: 'CONTROL_NATURE', value: 'DETECTIVE', label: 'Tespit Edici', labelEn: 'Detective', color: 'bg-violet-100 text-violet-700', sortOrder: 2 },
            { category: 'CONTROL_NATURE', value: 'CORRECTIVE', label: 'Düzeltici', labelEn: 'Corrective', color: 'bg-rose-100 text-rose-700', sortOrder: 3 },

            // Automation Level
            { category: 'AUTOMATION_LEVEL', value: 'AUTOMATED', label: 'Otomatik', labelEn: 'Automated', color: 'bg-green-100 text-green-700', sortOrder: 1 },
            { category: 'AUTOMATION_LEVEL', value: 'SEMI_AUTOMATED', label: 'Yarı Otomatik', labelEn: 'Semi-Automated', color: 'bg-yellow-100 text-yellow-700', sortOrder: 2 },
            { category: 'AUTOMATION_LEVEL', value: 'MANUAL', label: 'Manuel', labelEn: 'Manual', color: 'bg-gray-100 text-gray-600', sortOrder: 3 },

            // Action Priority
            { category: 'ACTION_PRIORITY', value: 'CRITICAL', label: 'Kritik', labelEn: 'Critical', color: 'bg-red-100 text-red-700', sortOrder: 1 },
            { category: 'ACTION_PRIORITY', value: 'HIGH', label: 'Yüksek', labelEn: 'High', color: 'bg-orange-100 text-orange-700', sortOrder: 2 },
            { category: 'ACTION_PRIORITY', value: 'MEDIUM', label: 'Orta', labelEn: 'Medium', color: 'bg-yellow-100 text-yellow-700', sortOrder: 3 },
            { category: 'ACTION_PRIORITY', value: 'LOW', label: 'Düşük', labelEn: 'Low', color: 'bg-green-100 text-green-700', sortOrder: 4 },

            // Finding Severity
            { category: 'FINDING_SEVERITY', value: 'CRITICAL', label: 'Kritik', labelEn: 'Critical', color: 'bg-red-100 text-red-700', sortOrder: 1 },
            { category: 'FINDING_SEVERITY', value: 'HIGH', label: 'Yüksek', labelEn: 'High', color: 'bg-orange-100 text-orange-700', sortOrder: 2 },
            { category: 'FINDING_SEVERITY', value: 'MEDIUM', label: 'Orta', labelEn: 'Medium', color: 'bg-yellow-100 text-yellow-700', sortOrder: 3 },
            { category: 'FINDING_SEVERITY', value: 'LOW', label: 'Düşük', labelEn: 'Low', color: 'bg-green-100 text-green-700', sortOrder: 4 },

            // Control Effectiveness
            { category: 'CONTROL_EFFECTIVENESS', value: 'EFFECTIVE', label: 'Etkin', labelEn: 'Effective', color: 'bg-green-100 text-green-700', sortOrder: 1 },
            { category: 'CONTROL_EFFECTIVENESS', value: 'PARTIALLY_EFFECTIVE', label: 'Kısmen Etkin', labelEn: 'Partially Effective', color: 'bg-yellow-100 text-yellow-700', sortOrder: 2 },
            { category: 'CONTROL_EFFECTIVENESS', value: 'INEFFECTIVE', label: 'Etkin Değil', labelEn: 'Ineffective', color: 'bg-red-100 text-red-700', sortOrder: 3 },
            { category: 'CONTROL_EFFECTIVENESS', value: 'NOT_TESTED', label: 'Test Edilmedi', labelEn: 'Not Tested', color: 'bg-gray-100 text-gray-600', sortOrder: 4 },
        ];

        for (const option of defaultOptions) {
            await this.prisma.systemOption.upsert({
                where: { category_value: { category: option.category, value: option.value } },
                update: option,
                create: option,
            });
        }

        return { message: 'Default options seeded successfully', count: defaultOptions.length };
    }
}

/** Tarih-yalnız (YYYY-MM-DD) bitiş değeri ertesi günün başına kadar (hariç) genişletilir. */
export function auditDateRange(start?: string, end?: string): { gte?: Date; lt?: Date; lte?: Date } | null {
    if (!start && !end) return null;
    const range: { gte?: Date; lt?: Date; lte?: Date } = {};
    if (start) range.gte = new Date(start);
    if (end) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(end)) {
            const d = new Date(`${end}T00:00:00`);
            d.setDate(d.getDate() + 1);
            range.lt = d;
        } else {
            range.lte = new Date(end);
        }
    }
    return range;
}

export function buildAuditWhere(q: AuditLogQueryDto): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    if (q.userId) where.userId = q.userId;
    if (q.entityType) where.entityType = q.entityType;
    if (q.entityId) where.entityId = q.entityId;
    if (q.action) where.action = q.action;
    if (q.ipAddress) where.ipAddress = q.ipAddress;
    if (q.actorType) where.actorType = q.actorType === 'UNKNOWN' ? null : q.actorType;
    const range = auditDateRange(q.startDate, q.endDate);
    if (range) where.createdAt = range;
    return where;
}
