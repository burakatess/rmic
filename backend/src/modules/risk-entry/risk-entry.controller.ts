import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { RiskEntryService } from './risk-entry.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';

@Controller('risk-entries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RiskEntryController {
    constructor(private riskEntryService: RiskEntryService) { }

    @Get()
    async findAll(@Query() query: any) {
        return this.riskEntryService.findAll(query);
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.riskEntryService.findOne(id);
    }

    @Post()
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async create(@Body() data: any, @CurrentUser('id') userId: string) {
        return this.riskEntryService.create(data, userId);
    }

    @Put(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async update(@Param('id') id: string, @Body() data: any, @CurrentUser('id') userId: string) {
        return this.riskEntryService.update(id, data, userId);
    }

    @Delete(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async delete(@Param('id') id: string) {
        return this.riskEntryService.delete(id);
    }

    @Post('bulk')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async bulkCreate(@Body() data: { entries: any[] }, @CurrentUser('id') userId: string) {
        return this.riskEntryService.bulkCreate(data.entries, userId);
    }

    @Post('sync-to-inventory')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async syncToInventory(@Body() data: { ids: string[] }, @CurrentUser('id') userId: string) {
        return this.riskEntryService.syncToRiskInventory(data.ids, userId);
    }
}
