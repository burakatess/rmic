import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RiskActionsService } from './risk-actions.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles } from '../../common/decorators';

@ApiTags('Risk Actions')
@ApiBearerAuth('JWT-Auth')
@Controller('risk-actions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RiskActionsController {
    constructor(private service: RiskActionsService) {}

    @Get()
    findAll(@Query() query: any) {
        return this.service.findAll(query);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    @Post()
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    create(@Body() body: any) {
        return this.service.create(body);
    }

    @Put(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    update(@Param('id') id: string, @Body() body: any) {
        return this.service.update(id, body);
    }

    @Delete(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    remove(@Param('id') id: string) {
        return this.service.delete(id);
    }

    @Post(':id/link-risk/:riskId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    linkRisk(@Param('id') id: string, @Param('riskId') riskId: string) {
        return this.service.linkRisk(id, riskId);
    }

    @Delete(':id/link-risk/:riskId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    unlinkRisk(@Param('id') id: string, @Param('riskId') riskId: string) {
        return this.service.unlinkRisk(id, riskId);
    }
}
