import {
    Controller,
    Get,
    Post,
    Put,
    Body,
    Param,
    Query,
    UseGuards,
    Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RisksService } from './risks.service';
import {
    CreateRiskDto,
    UpdateRiskDto,
    AssessRiskDto,
    TreatRiskDto,
    RiskQueryDto,
} from './dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import { AccessScopeService, actionWhere, findingFullWhere, riskWhere } from '../../common/services/access-scope.service';
import type { AccessActor } from '../../common/services/access-scope.service';
import type { RiskRelatedScopes } from './risks.service';

@ApiTags('Risks')
@ApiBearerAuth('JWT-Auth')
@Controller('risks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RisksController {
    constructor(private risksService: RisksService, private scope: AccessScopeService) { }

    // Risk kapsamı + riskten açılan bulgu/aksiyonlar kendi kapsamlarından geçer.
    private async gate(user: AccessActor, id?: string): Promise<RiskRelatedScopes> {
        const ctx = await this.scope.context(user);
        if (id) await this.scope.assertRiskAccess(ctx, id);
        return { finding: findingFullWhere(ctx), action: actionWhere(ctx) };
    }

    @Get()
    async findAll(@Query() query: RiskQueryDto, @CurrentUser() user: AccessActor) {
        return this.risksService.findAll(query, riskWhere(await this.scope.context(user)));
    }

    @Get('categories')
    async getCategories() {
        return this.risksService.getCategories();
    }

    @Get(':id/relations')
    async getRelations(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        return this.risksService.getRelations(id, await this.gate(user, id));
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        return this.risksService.findOne(id, await this.gate(user, id));
    }

    @Post()
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async create(@Body() createRiskDto: CreateRiskDto, @CurrentUser('id') userId: string) {
        return this.risksService.create(createRiskDto, userId);
    }

    @Put(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async update(
        @Param('id') id: string,
        @Body() updateRiskDto: UpdateRiskDto,
        @CurrentUser() user: AccessActor,
    ) {
        const perms = Array.isArray(user.permissions) ? (user.permissions as string[]) : [];
        return this.risksService.update(id, updateRiskDto, user.id, perms);
    }

    @Post(':id/assess')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async assess(
        @Param('id') id: string,
        @Body() assessRiskDto: AssessRiskDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.risksService.assess(id, assessRiskDto, userId);
    }

    @Post(':id/treat')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async treat(
        @Param('id') id: string,
        @Body() treatRiskDto: TreatRiskDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.risksService.treat(id, treatRiskDto, userId);
    }

    @Post(':id/approve-treatment')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async approveTreatment(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.risksService.approveTreatment(id, userId);
    }

    @Get(':id/history')
    async getHistory(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        await this.gate(user, id);
        return this.risksService.getHistory(id);
    }

    @Get(':id/controls')
    async getControls(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        await this.gate(user, id);
        return this.risksService.getControls(id);
    }

    @Get(':id/findings')
    async getFindings(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        return this.risksService.getFindings(id, await this.gate(user, id));
    }

    @Get(':id/actions')
    async getActions(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        return this.risksService.getActions(id, await this.gate(user, id));
    }

}
