import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ActionsService } from './actions.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import { CreateStandaloneActionDto, UpdateStandaloneActionDto, ExtendActionDto, CreateEffectivenessReviewDto } from './dto';

@ApiTags('Actions')
@ApiBearerAuth('JWT-Auth')
@Controller('actions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActionsController {
    constructor(private actionsService: ActionsService) { }

    @Get()
    async findAll(@Query() query: any) {
        return this.actionsService.findAll(query);
    }

    @Get(':id/relations')
    async getRelations(@Param('id') id: string) {
        return this.actionsService.getRelations(id);
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.actionsService.findOne(id);
    }

    @Post()
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async create(@Body() data: CreateStandaloneActionDto, @CurrentUser('id') userId: string) {
        return this.actionsService.create(data, userId);
    }

    @Put(':id')
    @Roles('SYSTEM_ADMIN', 'AUDITOR', 'AUDITEE')
    async update(@Param('id') id: string, @Body() data: UpdateStandaloneActionDto, @CurrentUser('id') userId: string) {
        return this.actionsService.update(id, data, userId);
    }

    @Delete(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.actionsService.delete(id, userId);
    }

    @Post(':id/complete')
    @Roles('SYSTEM_ADMIN', 'AUDITOR', 'AUDITEE')
    async complete(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.actionsService.complete(id, userId);
    }

    @Post(':id/extend')
    @Roles('SYSTEM_ADMIN', 'AUDITOR', 'AUDITEE')
    async extend(@Param('id') id: string, @Body() data: ExtendActionDto, @CurrentUser('id') userId: string) {
        return this.actionsService.extend(id, data, userId);
    }

    @Post(':id/effectiveness-review')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createEffectivenessReview(@Param('id') id: string, @Body() data: CreateEffectivenessReviewDto, @CurrentUser('id') userId: string) {
        return this.actionsService.createEffectivenessReview(id, data, userId);
    }

    @Post(':id/approve')
    @Roles('AUDITOR')
    async approveEffectivenessReview(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.actionsService.approveEffectivenessReview(id, userId);
    }
}
