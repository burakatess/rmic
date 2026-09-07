import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ControlsService } from './controls.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';

// Merkezi Onaylar sayfası — şu an yalnızca ControlTest onayları destekleniyor.
// Bulgu/aksiyon/takip çalışması onayı henüz bu merkeze taşınmadı (bkz. rapor "kalan açık iş kuralları").
@ApiTags('Approvals')
@ApiBearerAuth('JWT-Auth')
@Controller('approvals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApprovalsController {
    constructor(private controlsService: ControlsService) { }

    @Get('my-pending')
    async myPending(@CurrentUser('id') userId: string, @Query() query: any) {
        return this.controlsService.getMyPendingApprovals(userId, query);
    }

    @Get(':id')
    async detail(@Param('id') id: string) {
        return this.controlsService.getApprovalDetail(id);
    }
}
