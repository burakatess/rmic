import { Module } from '@nestjs/common';
import { DirectoratesService } from './directorates.service';
import { DirectoratesController } from './directorates.controller';
import { PrismaModule } from '../../prisma';

@Module({
    imports: [PrismaModule],
    controllers: [DirectoratesController],
    providers: [DirectoratesService],
    exports: [DirectoratesService],
})
export class DirectoratesModule {}
