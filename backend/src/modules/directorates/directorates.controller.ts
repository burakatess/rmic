import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DirectoratesService } from './directorates.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import { CreateDirectorateDto, UpdateDirectorateDto } from './dto/directorate.dto';

@ApiTags('Directorates')
@ApiBearerAuth('JWT-Auth')
@Controller('directorates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DirectoratesController {
    constructor(private directoratesService: DirectoratesService) {}

    @Get()
    async findAll(@Query() query: any) {
        return this.directoratesService.findAll(query);
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.directoratesService.findOne(id);
    }

    @Post()
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async create(@Body() data: CreateDirectorateDto, @CurrentUser('id') userId: string) {
        return this.directoratesService.create(data, userId);
    }

    @Put(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async update(@Param('id') id: string, @Body() data: UpdateDirectorateDto, @CurrentUser('id') userId: string) {
        return this.directoratesService.update(id, data, userId);
    }

    @Delete(':id')
    @Roles('SYSTEM_ADMIN')
    async delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.directoratesService.delete(id, userId);
    }
}
