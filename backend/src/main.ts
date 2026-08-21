import './instrument';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS
  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL') || 'http://localhost:3000',
    credentials: true,
  });

  // API prefix
  app.setGlobalPrefix('api');

  // Swagger / OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle('RMIC API')
    .setDescription(
      'Risk Yönetimi ve İç Kontrol Platformu API Dokümantasyonu. ' +
      'Bankacılık ve finans sektörüne yönelik GRC (Governance, Risk & Compliance) platformu.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT-Auth',
    )
    .addTag('Auth', 'Kimlik doğrulama ve oturum yönetimi')
    .addTag('Risks', 'Risk envanteri yönetimi')
    .addTag('Controls', 'Kontrol envanteri ve test workflow')
    .addTag('Audit Plans', 'Denetim plan yönetimi')
    .addTag('Audit Executions', 'Denetim uygulama yönetimi')
    .addTag('Findings', 'Bulgu yönetimi')
    .addTag('Actions', 'Aksiyon takibi ve SLA yönetimi')
    .addTag('Compliance', 'Mevzuat uyumu')
    .addTag('Risk Entries', 'Risk giriş ekranı (Excel benzeri)')
    .addTag('Risk Management Controls', 'Risk Yönetimi Kontrolleri (RYK)')
    .addTag('Reports', 'Dashboard ve raporlar')
    .addTag('Admin', 'Sistem yönetimi')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get<number>('PORT') || 3001;
  await app.listen(port);

  logger.log(`🚀 GRC Backend is running on: http://localhost:${port}/api`);
  logger.log(`📚 Swagger docs available at: http://localhost:${port}/api/docs`);
}

bootstrap();
