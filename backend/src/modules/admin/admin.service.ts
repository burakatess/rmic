import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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
            include: { role: true },
            orderBy: { createdAt: 'desc' },
        });

        return users.map(({ passwordHash, ...user }) => user);
    }

    async findUserById(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            include: { role: true },
        });

        if (!user) throw new NotFoundException('User not found');

        const { passwordHash, ...result } = user;
        return result;
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

        const user = await this.prisma.user.create({
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

        await this.prisma.auditLog.create({
            data: {
                userId: createdBy,
                action: 'CREATE',
                entityType: 'User',
                entityId: user.id,
                newValue: { email: user.email, firstName: user.firstName, lastName: user.lastName },
            },
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
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) throw new NotFoundException('User not found');

        const oldValue = { ...user };

        const updated = await this.prisma.user.update({
            where: { id },
            data,
            include: { role: true },
        });

        await this.prisma.auditLog.create({
            data: {
                userId: updatedBy,
                action: 'UPDATE',
                entityType: 'User',
                entityId: id,
                oldValue: { firstName: oldValue.firstName, lastName: oldValue.lastName, isActive: oldValue.isActive },
                newValue: data,
            },
        });

        const { passwordHash, ...result } = updated;
        return result;
    }

    async resetPassword(id: string, newPassword: string, resetBy: string) {
        const passwordHash = await bcrypt.hash(newPassword, 10);

        await this.prisma.user.update({
            where: { id },
            data: { passwordHash },
        });

        await this.prisma.auditLog.create({
            data: {
                userId: resetBy,
                action: 'PASSWORD_RESET',
                entityType: 'User',
                entityId: id,
            },
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

    async createRole(data: {
        name: string;
        description?: string;
        permissions: string[];
    }) {
        return this.prisma.role.create({ data });
    }

    async updateRole(
        id: string,
        data: {
            name?: string;
            description?: string;
            permissions?: string[];
        },
    ) {
        return this.prisma.role.update({
            where: { id },
            data,
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
    async findAuditLogs(params?: {
        userId?: string;
        entityType?: string;
        action?: string;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
    }) {
        const where: Record<string, unknown> = {};

        if (params?.userId) where.userId = params.userId;
        if (params?.entityType) where.entityType = params.entityType;
        if (params?.action) where.action = params.action;
        if (params?.startDate || params?.endDate) {
            where.createdAt = {};
            if (params?.startDate) (where.createdAt as Record<string, Date>).gte = params.startDate;
            if (params?.endDate) (where.createdAt as Record<string, Date>).lte = params.endDate;
        }

        return this.prisma.auditLog.findMany({
            where,
            include: {
                user: {
                    select: { id: true, email: true, firstName: true, lastName: true },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: params?.limit || 100,
        });
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
