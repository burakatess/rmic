import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { LibraryController } from './library.controller';
import { SourcesService } from './sources.service';
import { MappingsService } from './mappings.service';
import { CardsService } from './cards.service';
import { DatasetsService } from './datasets.service';
import { RetrievalService } from './retrieval.service';
import { QualityService } from './quality.service';

/**
 * Kaynak Kataloğu — Genişletilmiş Kütüphane.
 * kaynak → sürüm → birim → eşleştirme → test kartı → kanıt yeterliliği →
 * değerlendirme veri setleri → kalite ölçümü. RAG için AiModule'ün embedding
 * servisini kullanır (mevcut sağlayıcı; onaysız değişiklik / eğitim yok).
 */
@Module({
    imports: [AiModule],
    controllers: [LibraryController],
    providers: [SourcesService, MappingsService, CardsService, DatasetsService, RetrievalService, QualityService],
    exports: [SourcesService, RetrievalService],
})
export class LibraryModule {}
