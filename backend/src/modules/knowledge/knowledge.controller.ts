import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KnowledgeDocKind } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import { AI_EVAL_ROLES } from '../ai/ai.constants';
import { KnowledgeService } from './knowledge.service';
import { CreateKnowledgeDocDto, UpdateKnowledgeDocDto } from './dto';

const KNOWLEDGE_WRITE_ROLES = ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER'] as const;

@ApiTags('Kurumsal Kaynak Kütüphanesi')
@ApiBearerAuth('JWT-Auth')
@Controller('knowledge-docs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KnowledgeController {
    constructor(private knowledge: KnowledgeService) {}

    @Get()
    @Roles(...AI_EVAL_ROLES)
    search(
        @Query('q') q?: string,
        @Query('kind') kind?: KnowledgeDocKind,
        @Query('category') category?: string,
        @Query('includeInactive') includeInactive?: string,
    ) {
        return this.knowledge.search({
            q,
            kind: kind && Object.values(KnowledgeDocKind).includes(kind) ? kind : undefined,
            category,
            includeInactive: includeInactive === 'true',
        });
    }

    @Get(':id')
    @Roles(...AI_EVAL_ROLES)
    get(@Param('id') id: string) {
        return this.knowledge.get(id);
    }

    @Post()
    @Roles(...KNOWLEDGE_WRITE_ROLES)
    create(@Body() dto: CreateKnowledgeDocDto, @CurrentUser('id') userId: string) {
        return this.knowledge.create(dto, userId);
    }

    @Patch(':id')
    @Roles(...KNOWLEDGE_WRITE_ROLES)
    update(@Param('id') id: string, @Body() dto: UpdateKnowledgeDocDto, @CurrentUser('id') userId: string) {
        return this.knowledge.update(id, dto, userId);
    }

    @Delete(':id')
    @Roles('SYSTEM_ADMIN')
    remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.knowledge.remove(id, userId);
    }
}
