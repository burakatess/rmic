import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RiskProposalsService } from './risk-proposals.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';

@ApiTags('Risk Proposals')
@ApiBearerAuth('JWT-Auth')
@Controller('risk-proposals')
@UseGuards(JwtAuthGuard)
export class RiskProposalsController {
    constructor(private service: RiskProposalsService) {}

    // Herhangi bir kullanıcı (bulgu görebilen) risk tanımı önerebilir
    @Post()
    async create(
        @Body() dto: { findingId?: string; directorateId?: string; riskTanimi: string },
        @CurrentUser('id') userId: string,
    ) {
        return this.service.create(dto, userId);
    }

    // Kendi talepleri
    @Get('mine')
    async findMine(@CurrentUser('id') userId: string) {
        return this.service.findMine(userId);
    }

    // Admin — tüm talepler
    @Get()
    @UseGuards(RolesGuard)
    @Roles('SYSTEM_ADMIN')
    async findAll(@Query('status') status?: string) {
        return this.service.findAll(status);
    }

    @Patch(':id/approve')
    @UseGuards(RolesGuard)
    @Roles('SYSTEM_ADMIN')
    async approve(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.service.approve(id, userId);
    }

    @Patch(':id/reject')
    @UseGuards(RolesGuard)
    @Roles('SYSTEM_ADMIN')
    async reject(
        @Param('id') id: string,
        @Body('reviewNote') reviewNote: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.service.reject(id, reviewNote, userId);
    }
}
