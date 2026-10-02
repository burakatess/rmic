import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards';
import { WorkflowHealthQueryDto } from './dto/workflow-health-query.dto';
import { WorkflowHealthService } from './workflow-health.service';

@ApiTags('Workflow Health')
@ApiBearerAuth('JWT-Auth')
@Controller('workflow-health')
@UseGuards(JwtAuthGuard)
@RequirePermissions('control:view')
export class WorkflowHealthController {
    constructor(private service: WorkflowHealthService) { }

    @Get('summary')
    summary(@CurrentUser('id') userId: string, @CurrentUser('permissions') permissions: string[], @Query() query: WorkflowHealthQueryDto) {
        return this.service.getSummary(userId, permissions || [], query);
    }

    @Get('items')
    items(@CurrentUser('id') userId: string, @CurrentUser('permissions') permissions: string[], @Query() query: WorkflowHealthQueryDto) {
        return this.service.getItems(userId, permissions || [], query);
    }
}
