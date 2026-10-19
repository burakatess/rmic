import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import { GlobalSearchQueryDto } from './dto/global-search.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth('JWT-Auth')
@Controller('search')
export class SearchController {
    constructor(private readonly searchService: SearchService) {}

    @Get()
    search(
        @Query() query: GlobalSearchQueryDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
    ) {
        return this.searchService.search(query, userId, permissions ?? []);
    }
}
