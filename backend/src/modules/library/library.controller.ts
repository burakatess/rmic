import {
    Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, RequirePermissions, Roles } from '../../common/decorators';
import { maxConfidentialityFor, type Confidentiality } from '../../common/permissions/source-confidentiality';
import { SourcesService } from './sources.service';
import { MappingsService } from './mappings.service';
import { CardsService } from './cards.service';
import { DatasetsService } from './datasets.service';
import { RetrievalService } from './retrieval.service';
import { QualityService } from './quality.service';
import {
    CardStatusDto, CreateMappingDto, CreateSourceDto, CreateUnitDto, CreateVersionDto, QualityRunDto,
    RetrievalQueryDto, ReviewMappingDto, RevokeRightsDto, ScenarioReviewDto, UnitLookupDto, UpdateSourceDto,
    UpdateUnitDto, UpdateVersionDto, UpsertDatasetDto, UpsertEvidenceRuleDto, UpsertProcessCardDto,
    UpsertScenarioDto, UpsertTestCardDto, VerifyCitationsDto, VerifyRightsDto,
} from './dto';
import { FlagReReviewDto } from '../../common/dto/misc-bodies.dto';

const WRITE_ROLES = ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER'] as const;
const MAP_ROLES = ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR'] as const;

/** İzinler → görülebilecek en yüksek gizlilik seviyesi (retrieval yetki filtresi; rol adı DEĞİL izin). */
function viewerScope(permissions: string[]): { maxConfidentiality: Confidentiality } {
    return { maxConfidentiality: maxConfidentialityFor(permissions) };
}

@ApiTags('Kaynak Kataloğu (Genişletilmiş Kütüphane)')
@ApiBearerAuth('JWT-Auth')
@Controller('library')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LibraryController {
    constructor(
        private sources: SourcesService,
        private mappings: MappingsService,
        private cards: CardsService,
        private datasets: DatasetsService,
        private retrieval: RetrievalService,
        private quality: QualityService,
    ) {}

    // ─── Kaynak / sürüm / birim ────────────────────────────────────────────
    @Get('sources')
    @RequirePermissions('ai:run')
    listSources(@Query('q') q?: string, @Query('kind') kind?: string, @Query('confidentiality') confidentiality?: string, @Query('includeArchived') includeArchived?: string) {
        return this.sources.list({ q, kind, confidentiality, includeArchived: includeArchived === 'true' });
    }

    @Get('sources/:id')
    @RequirePermissions('ai:run')
    getSource(@Param('id') id: string) {
        return this.sources.get(id);
    }

    @Post('sources')
    @Roles(...WRITE_ROLES)
    createSource(@Body() dto: CreateSourceDto, @CurrentUser('id') userId: string) {
        return this.sources.create(dto, userId);
    }

    @Patch('sources/:id')
    @Roles(...WRITE_ROLES)
    updateSource(@Param('id') id: string, @Body() dto: UpdateSourceDto, @CurrentUser('id') userId: string) {
        return this.sources.update(id, dto, userId);
    }

    @Post('sources/:id/versions')
    @Roles(...WRITE_ROLES)
    addVersion(@Param('id') id: string, @Body() dto: CreateVersionDto, @CurrentUser('id') userId: string) {
        return this.sources.addVersion(id, dto, userId);
    }

    @Get('versions/:id')
    @RequirePermissions('ai:run')
    getVersion(@Param('id') id: string) {
        return this.sources.getVersion(id);
    }

    @Patch('versions/:id')
    @Roles(...WRITE_ROLES)
    updateVersion(@Param('id') id: string, @Body() dto: UpdateVersionDto, @CurrentUser('id') userId: string) {
        return this.sources.updateVersion(id, dto, userId);
    }

    @Get('versions/:a/diff/:b')
    @RequirePermissions('ai:run')
    diffVersions(@Param('a') a: string, @Param('b') b: string) {
        return this.sources.diffVersions(a, b);
    }

    @Post('versions/:id/flag-re-review')
    @Roles(...MAP_ROLES)
    flagReReview(@Param('id') id: string, @Body() body: FlagReReviewDto, @CurrentUser('id') userId: string) {
        return this.sources.flagReReview(id, body.changedUnitKeys ?? [], userId);
    }

    @Post('versions/:id/units')
    @Roles(...WRITE_ROLES)
    addUnit(@Param('id') id: string, @Body() dto: CreateUnitDto, @CurrentUser('id') userId: string) {
        return this.sources.addUnit(id, dto, userId);
    }

    @Patch('units/:id')
    @Roles(...WRITE_ROLES)
    updateUnit(@Param('id') id: string, @Body() dto: UpdateUnitDto, @CurrentUser('id') userId: string) {
        return this.sources.updateUnit(id, dto, userId);
    }

    @Delete('units/:id')
    @Roles(...WRITE_ROLES)
    removeUnit(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.sources.removeUnit(id, userId);
    }

    // ─── Hazırlık akışı (içerik incelemesi + kullanım hakkı — AYRI) ─────────
    @Get('versions/:id/readiness')
    @RequirePermissions('ai:run')
    readiness(@Param('id') id: string) {
        return this.sources.readiness(id);
    }

    @Post('versions/:id/review-content')
    @Roles(...WRITE_ROLES)
    reviewContent(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.sources.reviewContent(id, userId);
    }

    @Post('sources/:id/verify-rights')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    verifyRights(@Param('id') id: string, @Body() dto: VerifyRightsDto, @CurrentUser('id') userId: string) {
        return this.sources.verifyRights(id, dto, userId);
    }

    @Post('sources/:id/revoke-rights')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    revokeRights(@Param('id') id: string, @Body() dto: RevokeRightsDto, @CurrentUser('id') userId: string) {
        return this.sources.revokeRights(id, dto.reason, userId);
    }

    // ─── RAG / retrieval ───────────────────────────────────────────────────
    @Post('versions/:id/build-index')
    @Roles(...WRITE_ROLES)
    buildIndex(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.retrieval.buildIndex(id, userId);
    }

    /** Geriye dönük ad — build-index'e yönlendirir. */
    @Post('versions/:id/build-chunks')
    @Roles(...WRITE_ROLES)
    buildChunks(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.retrieval.buildIndex(id, userId);
    }

    @Post('versions/:id/retry-index')
    @Roles(...WRITE_ROLES)
    retryIndex(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.retrieval.buildIndex(id, userId);
    }

    @Get('versions/:id/index-jobs')
    @RequirePermissions('ai:run')
    indexJobs(@Param('id') id: string) {
        return this.retrieval.listIndexJobs(id);
    }

    /** MANUEL SEÇİM — embedding gerekmez. Onaylı + hak izinli + erişilebilir birimler. */
    @Get('unit-lookup')
    @RequirePermissions('ai:run')
    unitLookup(@Query() dto: UnitLookupDto, @CurrentUser('permissions') permissions: string[]) {
        return this.retrieval.lookupUnits(dto, viewerScope(permissions));
    }

    @Post('retrieval/search')
    @RequirePermissions('ai:run')
    search(@Body() dto: RetrievalQueryDto, @CurrentUser('permissions') permissions: string[]) {
        return this.retrieval.search(dto, viewerScope(permissions));
    }

    @Post('retrieval/verify-citations')
    @RequirePermissions('ai:run')
    verifyCitations(@Body() body: VerifyCitationsDto, @CurrentUser('permissions') permissions: string[]) {
        return this.retrieval.verifyCitations(body.citations ?? [], viewerScope(permissions), body.sentUnitIds ?? []);
    }

    // ─── Eşleştirme ────────────────────────────────────────────────────────
    @Get('mappings')
    @RequirePermissions('ai:run')
    listMappings(
        @Query('controlId') controlId?: string,
        @Query('testCardId') testCardId?: string,
        @Query('processCardId') processCardId?: string,
        @Query('status') status?: string,
    ) {
        return this.mappings.listForTarget({ controlId, testCardId, processCardId, status });
    }

    @Get('versions/:id/mappings')
    @RequirePermissions('ai:run')
    versionMappings(@Param('id') id: string) {
        return this.mappings.listForVersion(id);
    }

    @Get('versions/:id/used-in-evaluations')
    @RequirePermissions('ai:run')
    usedInEvaluations(@Param('id') id: string) {
        return this.mappings.usedInEvaluations(id);
    }

    @Post('mappings')
    @Roles(...MAP_ROLES)
    createMapping(@Body() dto: CreateMappingDto, @CurrentUser('id') userId: string) {
        return this.mappings.create(dto, userId);
    }

    @Post('mappings/ai-draft')
    @Roles(...MAP_ROLES)
    createAiDraftMapping(@Body() dto: CreateMappingDto, @CurrentUser('id') userId: string) {
        return this.mappings.create(dto, userId, true);
    }

    @Patch('mappings/:id/review')
    @Roles(...MAP_ROLES)
    reviewMapping(@Param('id') id: string, @Body() dto: ReviewMappingDto, @CurrentUser('id') userId: string) {
        return this.mappings.review(id, dto, userId);
    }

    @Delete('mappings/:id')
    @Roles(...MAP_ROLES)
    removeMapping(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.mappings.remove(id, userId);
    }

    // ─── Kontrol test kartları ─────────────────────────────────────────────
    @Get('test-cards')
    @RequirePermissions('ai:run')
    listTestCards(@Query('status') status?: string, @Query('topicNo') topicNo?: string) {
        return this.cards.listTestCards({ status, topicNo: topicNo ? Number(topicNo) : undefined });
    }

    @Get('test-cards/:id')
    @RequirePermissions('ai:run')
    getTestCard(@Param('id') id: string) {
        return this.cards.getTestCard(id);
    }

    @Post('test-cards')
    @Roles(...WRITE_ROLES)
    upsertTestCard(@Body() dto: UpsertTestCardDto, @CurrentUser('id') userId: string) {
        return this.cards.upsertTestCard(dto, userId);
    }

    @Patch('test-cards/:id/status')
    @Roles(...WRITE_ROLES)
    setTestCardStatus(@Param('id') id: string, @Body() dto: CardStatusDto, @CurrentUser('id') userId: string) {
        return this.cards.setTestCardStatus(id, dto, userId);
    }

    // ─── Süreç kapsam kartları ─────────────────────────────────────────────
    @Get('process-cards')
    @RequirePermissions('ai:run')
    listProcessCards(@Query('area') area?: string) {
        return this.cards.listProcessCards(area);
    }

    @Get('process-cards/:id')
    @RequirePermissions('ai:run')
    getProcessCard(@Param('id') id: string) {
        return this.cards.getProcessCard(id);
    }

    @Post('process-cards')
    @Roles(...WRITE_ROLES)
    upsertProcessCard(@Body() dto: UpsertProcessCardDto, @CurrentUser('id') userId: string) {
        return this.cards.upsertProcessCard(dto, userId);
    }

    @Patch('process-cards/:id/status')
    @Roles(...WRITE_ROLES)
    setProcessCardStatus(@Param('id') id: string, @Body() dto: CardStatusDto, @CurrentUser('id') userId: string) {
        return this.cards.setProcessCardStatus(id, dto, userId);
    }

    // ─── Kanıt yeterliliği rehberi ─────────────────────────────────────────
    @Get('evidence-rules')
    @RequirePermissions('ai:run')
    listEvidenceRules(@Query('category') category?: string) {
        return this.cards.listEvidenceRules(category);
    }

    @Post('evidence-rules')
    @Roles(...WRITE_ROLES)
    upsertEvidenceRule(@Body() dto: UpsertEvidenceRuleDto, @CurrentUser('id') userId: string) {
        return this.cards.upsertEvidenceRule(dto, userId);
    }

    // ─── Veri setleri / senaryolar ─────────────────────────────────────────
    @Get('datasets')
    @RequirePermissions('ai:run')
    listDatasets() {
        return this.datasets.listDatasets();
    }

    @Post('datasets')
    @Roles(...WRITE_ROLES)
    upsertDataset(@Body() dto: UpsertDatasetDto, @CurrentUser('id') userId: string) {
        return this.datasets.upsertDataset(dto, userId);
    }

    @Get('scenarios')
    @RequirePermissions('ai:run')
    listScenarios(
        @Query('datasetId') datasetId?: string,
        @Query('status') status?: string,
        @Query('testCardId') testCardId?: string,
        @Query('kind') kind?: string,
    ) {
        return this.datasets.listScenarios({ datasetId, status, testCardId, kind });
    }

    @Get('scenarios/:id')
    @RequirePermissions('ai:run')
    getScenario(@Param('id') id: string) {
        return this.datasets.getScenario(id);
    }

    @Post('scenarios')
    @RequirePermissions('ai:run')
    upsertScenario(@Body() dto: UpsertScenarioDto, @CurrentUser('id') userId: string) {
        return this.datasets.upsertScenario(dto, userId);
    }

    @Patch('scenarios/:id/review')
    @Roles(...MAP_ROLES)
    reviewScenario(@Param('id') id: string, @Body() dto: ScenarioReviewDto, @CurrentUser('id') userId: string) {
        return this.datasets.reviewScenario(id, dto, userId);
    }

    @Get('datasets/:id/export.jsonl')
    @Roles(...MAP_ROLES)
    exportJsonl(@Param('id') id: string, @Query('onlyApproved') onlyApproved?: string) {
        return this.datasets.exportJsonl(id, { onlyApproved: onlyApproved === 'true' });
    }

    // ─── Kalite ────────────────────────────────────────────────────────────
    @Get('quality-runs')
    @RequirePermissions('ai:run')
    listQualityRuns(@Query('datasetId') datasetId?: string) {
        return this.quality.list(datasetId);
    }

    @Get('quality-runs/:id')
    @RequirePermissions('ai:run')
    getQualityRun(@Param('id') id: string) {
        return this.quality.get(id);
    }

    @Post('quality-runs')
    @RequirePermissions('ai:run')
    recordQualityRun(@Body() dto: QualityRunDto, @CurrentUser('id') userId: string) {
        return this.quality.record(dto, userId);
    }

    @Get('quality-runs/:a/compare/:b')
    @RequirePermissions('ai:run')
    compareQualityRuns(@Param('a') a: string, @Param('b') b: string) {
        return this.quality.compare(a, b);
    }
}
