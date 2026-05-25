import { Module } from '@nestjs/common';
import { TestsController } from './tests.controller';

@Module({
    controllers: [TestsController],
})
export class TestsModule {}
