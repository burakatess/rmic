import { Module } from '@nestjs/common';
import { DirectorateScopeService } from '../../common/services/directorate-scope.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
    controllers: [SearchController],
    providers: [SearchService, DirectorateScopeService],
})
export class SearchModule {}
