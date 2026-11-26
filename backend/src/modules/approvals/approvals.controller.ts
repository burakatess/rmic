import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { ApprovalsService } from './approvals.service';

/** Salt okunur iş kutusu: kayıtlar yalnız kullanıcının kontrolcü olduğu satırlardır. */
@ApiTags('Workflow Approvals')
@ApiBearerAuth('JWT-Auth')
@Controller('workflow-approvals')
@UseGuards(JwtAuthGuard)
export class WorkflowApprovalsController {
    constructor(private approvals: ApprovalsService) { }

    @Get()
    async pending(@CurrentUser('id') userId: string) {
        const [items, decisions] = await Promise.all([this.approvals.pendingFor(userId), this.approvals.decisionsFor(userId)]);
        return { items, decisions };
    }

    /** Taleplerim: gönderdiğim, karar bekleyen onay ve silme talepleri + kayıtlarım hakkındaki son kararlar. */
    @Get('mine')
    async mine(@CurrentUser('id') userId: string) {
        const [items, decisions] = await Promise.all([this.approvals.myRequests(userId), this.approvals.decisionsFor(userId)]);
        return { items, decisions };
    }

    @Get('count')
    async count(@CurrentUser('id') userId: string) {
        return { count: await this.approvals.pendingCount(userId) };
    }
}
