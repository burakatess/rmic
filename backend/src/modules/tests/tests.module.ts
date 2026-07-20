import { Module } from '@nestjs/common';
import { TestsController } from './tests.controller';
import { ControlsModule } from '../controls/controls.module';

@Module({
    imports: [ControlsModule],
    controllers: [TestsController],
})
export class TestsModule {}
