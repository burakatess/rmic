import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ComplianceService } from './compliance.service';
import { Roles, CurrentUser } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

@ApiTags('Compliance')
@ApiBearerAuth('JWT-Auth')
@Controller()
export class ComplianceController {
    constructor(private complianceService: ComplianceService) { }

    // Regulations
    @Get('regulations')
    async findAllRegulations() {
        return this.complianceService.findAllRegulations();
    }

    @Get('regulations/:id')
    async findRegulationById(@Param('id') id: string) {
        return this.complianceService.findRegulationById(id);
    }

    @Post('regulations')
    @UseGuards(RolesGuard)
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async createRegulation(
        @Body() body: { code: string; name: string; description?: string },
    ) {
        return this.complianceService.createRegulation(body);
    }

    @Put('regulations/:id')
    @UseGuards(RolesGuard)
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async updateRegulation(
        @Param('id') id: string,
        @Body() body: { code?: string; name?: string; description?: string; isActive?: boolean },
    ) {
        return this.complianceService.updateRegulation(id, body);
    }

    // Articles
    @Get('regulations/:id/articles')
    async findArticlesByRegulation(@Param('id') regulationId: string) {
        return this.complianceService.findArticlesByRegulation(regulationId);
    }

    @Post('regulations/:id/articles')
    @UseGuards(RolesGuard)
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async createArticle(
        @Param('id') regulationId: string,
        @Body() body: { articleCode: string; title: string; description: string },
    ) {
        return this.complianceService.createArticle({
            regulationId,
            ...body,
        });
    }

    // Risk-Article Mapping
    @Post('articles/:articleId/risks/:riskId')
    @UseGuards(RolesGuard)
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async mapRiskToArticle(
        @Param('articleId') articleId: string,
        @Param('riskId') riskId: string,
        @CurrentUser() user: { id: string },
    ) {
        return this.complianceService.mapRiskToArticle(riskId, articleId, user.id);
    }

    @Delete('articles/:articleId/risks/:riskId')
    @UseGuards(RolesGuard)
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async unmapRiskFromArticle(
        @Param('articleId') articleId: string,
        @Param('riskId') riskId: string,
    ) {
        return this.complianceService.unmapRiskFromArticle(riskId, articleId);
    }

    // Control-Article Mapping
    @Post('articles/:articleId/controls/:controlId')
    @UseGuards(RolesGuard)
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async mapControlToArticle(
        @Param('articleId') articleId: string,
        @Param('controlId') controlId: string,
        @CurrentUser() user: { id: string },
    ) {
        return this.complianceService.mapControlToArticle(controlId, articleId, user.id);
    }

    @Delete('articles/:articleId/controls/:controlId')
    @UseGuards(RolesGuard)
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async unmapControlFromArticle(
        @Param('articleId') articleId: string,
        @Param('controlId') controlId: string,
    ) {
        return this.complianceService.unmapControlFromArticle(controlId, articleId);
    }

    // Compliance Overview
    @Get('compliance/overview')
    async getComplianceOverview() {
        return this.complianceService.getComplianceOverview();
    }
}
