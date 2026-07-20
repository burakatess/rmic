// ÖNEMLİ: .env.test yüklemesi diğer tüm import'lardan ÖNCE olmalı — PrismaService constructor'ı
// process.env.DATABASE_URL'i modül DI sırasında okur (dotenv.config varsayılan olarak
// zaten set edilmiş değerlerin üzerine yazmaz, bu yüzden sıra kritik).
import * as dotenv from 'dotenv';
import { join } from 'path';
dotenv.config({ path: join(__dirname, '../../.env.test') });

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';

export async function createTestApp(): Promise<INestApplication> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
    }).compile();

    const app = moduleFixture.createNestApplication();

    // main.ts ile aynı global pipe — DTO validasyonunun gerçek davranışını test eder
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
        }),
    );

    await app.init();
    return app;
}
