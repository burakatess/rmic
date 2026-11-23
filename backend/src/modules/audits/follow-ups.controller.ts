import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import { AccessScopeService, type AccessActor } from '../../common/services/access-scope.service';
import { AuditsService } from './audits.service';
import { WorkflowReasonDto } from './dto/finding.dto';
import { AssignSecondControllerDto, UpdateFollowUpDto } from './dto/follow-up.dto';

/**
 * Takip çalışması — bulgudan bağımsız uçlar. Manuel aksiyon planından türeyen takiplerin bulgusu
 * yoktur; bulgu kaynaklı takipler de bu uçlarla açılabilir (detay ekranı). İş kuralları
 * AuditsService'tedir (bulgu kapsamlı uçlarla aynı); burada kayıt kapsamı + rol uygulanır.
 */
@ApiTags('FollowUps')
@ApiBearerAuth('JWT-Auth')
@Controller('follow-ups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FollowUpsController {
    constructor(private audits: AuditsService, private scope: AccessScopeService) { }

    private async gate(user: AccessActor, id: string) {
        await this.scope.assertFollowUpAccess(await this.scope.context(user), id);
        return this.audits.followUpFindingId(id);
    }

    @Get(':id')
    async detail(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        await this.gate(user, id);
        return this.audits.getFollowUpDetail(id, { id: user.id, role: user.role as string });
    }

    @Put(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async update(@Param('id') id: string, @Body() data: UpdateFollowUpDto, @CurrentUser('id') userId: string, @CurrentUser('role') role: string, @CurrentUser() user: AccessActor) {
        const findingId = await this.gate(user, id);
        return this.audits.updateFollowUp(findingId, id, data, userId, role);
    }

    @Post(':id/second-controller')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async assignSecond(@Param('id') id: string, @Body() body: AssignSecondControllerDto, @CurrentUser('id') userId: string, @CurrentUser('role') role: string, @CurrentUser() user: AccessActor) {
        const findingId = await this.gate(user, id);
        return this.audits.assignSecondController(findingId, id, body, userId, role);
    }

    @Post(':id/revert')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async revert(@Param('id') id: string, @Body() body: WorkflowReasonDto, @CurrentUser('id') userId: string, @CurrentUser() user: AccessActor) {
        const findingId = await this.gate(user, id);
        return this.audits.revertFollowUp(findingId, id, body.reason, userId);
    }
}
