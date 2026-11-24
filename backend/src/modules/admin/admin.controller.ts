import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { AuditLogExportQueryDto, AuditLogQueryDto } from './dto/audit-log-query.dto';
import { Roles, CurrentUser } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import {
    AdminCreateUserDto, AdminResetPasswordDto, AdminUpdateUserDto, CreateRiskCategoryDto, CreateSystemOptionDto, SetUserDirectoratesDto,
    UpdateParameterDto, UpdateRiskCategoryDto, UpdateSystemOptionDto,
} from './dto/admin-user.dto';
import { SiemConfigDto } from '../../common/dto/misc-bodies.dto';

@ApiTags('Admin')
@ApiBearerAuth('JWT-Auth')
@Controller('admin')
@UseGuards(RolesGuard)
@Roles('SYSTEM_ADMIN')
export class AdminController {
    constructor(private adminService: AdminService) { }

    // Users
    // Tam kullanıcı kaydı (e-posta, LDAP DN/kullanıcı adı, bağlantı) yalnız sistem yöneticisine (CLAUDE.md: /admin/*
    // yalnız SYSTEM_ADMIN). Denetçi/yönetici kişi seçimi için asgari alanlı `users/options` ucunu kullanır (KVKK veri azaltma).
    @Get('users')
    async findAllUsers(
        @Query('search') search?: string,
        @Query('roleId') roleId?: string,
        @Query('isActive') isActive?: string,
    ) {
        return this.adminService.findAllUsers({
            search,
            roleId,
            isActive: isActive ? isActive === 'true' : undefined,
        });
    }

    @Get('users/options')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async findUserOptions(
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('approver') approver?: string,
    ) {
        return this.adminService.findUserOptions({
            search: search?.slice(0, 200),
            page: Math.max(1, Number(page) || 1),
            limit: Math.min(500, Math.max(1, Number(limit) || 100)),
            approver: approver === 'true',
        });
    }

    @Get('users/:id')
    async findUserById(@Param('id') id: string) {
        return this.adminService.findUserById(id);
    }

    @Post('users')
    async createUser(
        @Body() body: AdminCreateUserDto,
        @CurrentUser() user: { id: string },
    ) {
        return this.adminService.createUser(body, user.id);
    }

    @Put('users/:id')
    async updateUser(
        @Param('id') id: string,
        @Body() body: AdminUpdateUserDto,
        @CurrentUser() user: { id: string },
    ) {
        return this.adminService.updateUser(id, body, user.id);
    }

    @Put('users/:id/directorates')
    async setUserDirectorates(
        @Param('id') id: string,
        @Body() body: SetUserDirectoratesDto,
        @CurrentUser() user: { id: string },
    ) {
        return this.adminService.setUserDirectorates(id, body.directorateIds ?? [], user.id);
    }

    @Post('users/:id/reset-password')
    async resetPassword(
        @Param('id') id: string,
        @Body() body: AdminResetPasswordDto,
        @CurrentUser() user: { id: string },
    ) {
        return this.adminService.resetPassword(id, body.newPassword, user.id);
    }

    // İzin kataloğu — rol yönetimi ekranının tek kaynağı
    @Get('permissions')
    getPermissionCatalog() {
        return this.adminService.getPermissionCatalog();
    }

    // Roles
    @Get('roles')
    async findAllRoles() {
        return this.adminService.findAllRoles();
    }

    @Get('roles/:id')
    async findRoleById(@Param('id') id: string) {
        return this.adminService.findRoleById(id);
    }

    @Post('roles')
    async createRole(
        @Body() body: CreateRoleDto,
        @CurrentUser() user: { id: string },
    ) {
        return this.adminService.createRole(body, user.id);
    }

    @Put('roles/:id')
    async updateRole(
        @Param('id') id: string,
        @Body() body: UpdateRoleDto,
        @CurrentUser() user: { id: string },
    ) {
        return this.adminService.updateRole(id, body, user.id);
    }

    // Parameters
    @Get('parameters')
    async findAllParameters(@Query('category') category?: string) {
        return this.adminService.findAllParameters(category);
    }

    @Put('parameters/:id')
    async updateParameter(
        @Param('id') id: string,
        @Body() body: UpdateParameterDto,
        @CurrentUser() user: { id: string },
    ) {
        return this.adminService.updateParameter(id, body.value, user.id);
    }

    // Audit Logs
    @Get('audit-logs')
    async findAuditLogs(@Query() query: AuditLogQueryDto) {
        return this.adminService.findAuditLogsPage(query);
    }

    // SIEM Export
    @Get('audit-logs/export')
    async exportAuditLogs(
        @Res() res: any,
        @Query() query: AuditLogExportQueryDto,
    ) {
        const fmt = (['cef', 'leef', 'json'].includes(query.format || '') ? query.format : 'json') as 'cef' | 'leef' | 'json';
        const content = await this.adminService.exportAuditLogs(query, fmt);

        const ext = fmt === 'json' ? 'ndjson' : 'log';
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${fmt}-${new Date().toISOString().slice(0, 10)}.${ext}"`);
        res.send(content);
    }

    // SIEM Config
    @Get('siem-config')
    async getSiemConfig() {
        return this.adminService.getSiemConfig();
    }

    @Put('siem-config')
    async updateSiemConfig(
        @Body() body: SiemConfigDto,
        @CurrentUser() user: { id: string },
    ) {
        return this.adminService.updateSiemConfig({ ...body }, user.id);
    }

    // Risk Categories
    @Get('risk-categories')
    async findAllRiskCategories() {
        return this.adminService.findAllRiskCategories();
    }

    @Post('risk-categories')
    async createRiskCategory(
        @Body() body: CreateRiskCategoryDto,
        @CurrentUser() user: { id: string },
    ) {
        return this.adminService.createRiskCategory(body, user.id);
    }

    @Put('risk-categories/:id')
    async updateRiskCategory(
        @Param('id') id: string,
        @Body() body: UpdateRiskCategoryDto,
        @CurrentUser() user: { id: string },
    ) {
        return this.adminService.updateRiskCategory(id, body, user.id);
    }

    // System Options (Dynamic Dropdowns)
    @Get('options')
    async findAllSystemOptions(
        @Query('category') category?: string,
        @Query('activeOnly') activeOnly?: string,
    ) {
        return this.adminService.findAllSystemOptions(category, activeOnly === 'true');
    }

    @Get('options/categories')
    async getOptionCategories() {
        return this.adminService.getOptionCategories();
    }

    @Get('options/:category')
    async findSystemOptionsByCategory(
        @Param('category') category: string,
        @Query('activeOnly') activeOnly?: string,
    ) {
        return this.adminService.findSystemOptionsByCategory(category, activeOnly !== 'false');
    }

    @Post('options')
    async createSystemOption(
        @Body() body: CreateSystemOptionDto,
        @CurrentUser() user: { id: string },
    ) {
        return this.adminService.createSystemOption(body, user.id);
    }

    @Put('options/:id')
    async updateSystemOption(
        @Param('id') id: string,
        @Body() body: UpdateSystemOptionDto,
        @CurrentUser() user: { id: string },
    ) {
        return this.adminService.updateSystemOption(id, body, user.id);
    }

    @Delete('options/:id')
    async deleteSystemOption(@Param('id') id: string, @CurrentUser() user: { id: string }) {
        return this.adminService.deleteSystemOption(id, user.id);
    }

    @Post('options/seed')
    async seedDefaultOptions() {
        return this.adminService.seedDefaultOptions();
    }
}
