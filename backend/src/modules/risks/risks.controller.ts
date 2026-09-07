import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
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

@ApiTags('Risks')
@ApiBearerAuth('JWT-Auth')
@Controller('risks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RisksController {
    constructor(private risksService: RisksService) { }

    @Get()
    async findAll(@Query() query: RiskQueryDto) {
        return this.risksService.findAll(query);
    }

    @Get('categories')
    async getCategories() {
        return this.risksService.getCategories();
    }

    @Get(':id/relations')
    async getRelations(@Param('id') id: string) {
        return this.risksService.getRelations(id);
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.risksService.findOne(id);
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
        @CurrentUser('id') userId: string,
    ) {
        return this.risksService.update(id, updateRiskDto, userId);
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
    async getHistory(@Param('id') id: string) {
        return this.risksService.getHistory(id);
    }

    @Get(':id/controls')
    async getControls(@Param('id') id: string) {
        return this.risksService.getControls(id);
    }

    @Get(':id/findings')
    async getFindings(@Param('id') id: string) {
        return this.risksService.getFindings(id);
    }

    @Get(':id/actions')
    async getActions(@Param('id') id: string) {
        return this.risksService.getActions(id);
    }

    @Delete(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.risksService.delete(id, userId);
    }
}
