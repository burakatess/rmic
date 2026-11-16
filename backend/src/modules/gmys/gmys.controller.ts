import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import { GmysService } from './gmys.service';
import { CreateGmyDto, UpdateGmyDto } from './dto/gmy.dto';

// Genel Müdür Yardımcılıkları: okuma tüm oturumlu kullanıcılara (seçim listesi),
// tanımlama/değiştirme yalnız sistem yöneticisine açık.
@ApiTags('GMY')
@ApiBearerAuth('JWT-Auth')
@Controller('gmys')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GmysController {
    constructor(private service: GmysService) { }

    @Get()
    findAll(@Query('includeInactive') includeInactive?: string) {
        return this.service.findAll(includeInactive === 'true');
    }

    @Post()
    @Roles('SYSTEM_ADMIN')
    create(@Body() dto: CreateGmyDto, @CurrentUser('id') userId: string) {
        return this.service.create(dto, userId);
    }

    @Put(':id')
    @Roles('SYSTEM_ADMIN')
    update(@Param('id') id: string, @Body() dto: UpdateGmyDto, @CurrentUser('id') userId: string) {
        return this.service.update(id, dto, userId);
    }
}
