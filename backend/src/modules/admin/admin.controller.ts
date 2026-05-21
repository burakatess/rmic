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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { Roles, CurrentUser } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

@ApiTags('Admin')
@ApiBearerAuth('JWT-Auth')
@Controller('admin')
@UseGuards(RolesGuard)
@Roles('SYSTEM_ADMIN')
export class AdminController {
    constructor(private adminService: AdminService) { }

    // Users
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

    @Get('users/:id')
    async findUserById(@Param('id') id: string) {
        return this.adminService.findUserById(id);
    }

    @Post('users')
    async createUser(
        @Body() body: {
            email: string;
            password: string;
            firstName: string;
            lastName: string;
            department?: string;
            roleId: string;
        },
        @CurrentUser() user: { id: string },
    ) {
        return this.adminService.createUser(body, user.id);
    }

    @Put('users/:id')
    async updateUser(
        @Param('id') id: string,
        @Body() body: {
            firstName?: string;
            lastName?: string;
            department?: string;
            roleId?: string;
            isActive?: boolean;
        },
        @CurrentUser() user: { id: string },
    ) {
        return this.adminService.updateUser(id, body, user.id);
    }

    @Post('users/:id/reset-password')
    async resetPassword(
        @Param('id') id: string,
        @Body() body: { newPassword: string },
        @CurrentUser() user: { id: string },
    ) {
        return this.adminService.resetPassword(id, body.newPassword, user.id);
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
        @Body() body: { name: string; description?: string; permissions: string[] },
    ) {
        return this.adminService.createRole(body);
    }

    @Put('roles/:id')
    async updateRole(
        @Param('id') id: string,
        @Body() body: { name?: string; description?: string; permissions?: string[] },
    ) {
        return this.adminService.updateRole(id, body);
    }

    // Parameters
    @Get('parameters')
    async findAllParameters(@Query('category') category?: string) {
        return this.adminService.findAllParameters(category);
    }

    @Put('parameters/:id')
    async updateParameter(
        @Param('id') id: string,
        @Body() body: { value: unknown },
        @CurrentUser() user: { id: string },
    ) {
        return this.adminService.updateParameter(id, body.value, user.id);
    }

    // Audit Logs
    @Get('audit-logs')
    async findAuditLogs(
        @Query('userId') userId?: string,
        @Query('entityType') entityType?: string,
        @Query('action') action?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('limit') limit?: string,
    ) {
        return this.adminService.findAuditLogs({
            userId,
            entityType,
            action,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            limit: limit ? parseInt(limit) : undefined,
        });
    }

    // Risk Categories
    @Get('risk-categories')
    async findAllRiskCategories() {
        return this.adminService.findAllRiskCategories();
    }

    @Post('risk-categories')
    async createRiskCategory(
        @Body() body: { name: string; description?: string; color?: string },
    ) {
        return this.adminService.createRiskCategory(body);
    }

    @Put('risk-categories/:id')
    async updateRiskCategory(
        @Param('id') id: string,
        @Body() body: { name?: string; description?: string; color?: string },
    ) {
        return this.adminService.updateRiskCategory(id, body);
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
        @Body() body: {
            category: string;
            value: string;
            label: string;
            labelEn?: string;
            color?: string;
            icon?: string;
            sortOrder?: number;
            isDefault?: boolean;
        },
    ) {
        return this.adminService.createSystemOption(body);
    }

    @Put('options/:id')
    async updateSystemOption(
        @Param('id') id: string,
        @Body() body: {
            label?: string;
            labelEn?: string;
            color?: string;
            icon?: string;
            sortOrder?: number;
            isActive?: boolean;
            isDefault?: boolean;
        },
    ) {
        return this.adminService.updateSystemOption(id, body);
    }

    @Delete('options/:id')
    async deleteSystemOption(@Param('id') id: string) {
        return this.adminService.deleteSystemOption(id);
    }

    @Post('options/seed')
    async seedDefaultOptions() {
        return this.adminService.seedDefaultOptions();
    }
}
