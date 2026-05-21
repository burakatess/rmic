import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

describe('E2E (Auth Flow & Risks)', () => {
  let app: INestApplication;
  let mockPrismaService: any;
  let jwtToken: string;

  beforeAll(async () => {
    // Generate a test password hash
    const passwordHash = await bcrypt.hash('password123', 10);

    mockPrismaService = {
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.email === 'admin@grc.com') {
            return {
              id: 'e2e-user-1',
              email: 'admin@grc.com',
              passwordHash,
              firstName: 'Admin',
              lastName: 'E2E',
              isActive: true,
              role: { id: 'r1', name: 'SYSTEM_ADMIN', permissions: [] }
            };
          }
          if (where.id === 'e2e-user-1') {
            return {
              id: 'e2e-user-1',
              email: 'admin@grc.com',
              passwordHash,
              firstName: 'Admin',
              isActive: true,
              role: { id: 'r1', name: 'SYSTEM_ADMIN', permissions: [] }
            };
          }
          return null;
        }),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      risk: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: 'test-risk',
          riskId: 'R-2026-0001',
          name: 'E2E Risk',
          status: 'IDENTIFIED'
        }),
      },
      riskCategory: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cat-1' }),
      },
      riskHistory: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      systemOption: {
        findMany: jest.fn().mockResolvedValue([]),
      }
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();

    // Setup validation pipe like main.ts to test DTOs
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Auth Flow', () => {
    it('1. /auth/login (POST) - should login and get token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@grc.com', password: 'password123' })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      jwtToken = response.body.accessToken;
    });

    it('2. /auth/me (GET) - should get profile with token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('email', 'admin@grc.com');
    });

    it('3. /auth/me (GET) - should fail without token', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);
    });
  });

  describe('Risks Endpoint', () => {
    it('1. /risks (GET) - should return empty list', async () => {
      const response = await request(app.getHttpServer())
        .get('/risks')
        .set('Authorization', `Bearer ${jwtToken}`);

      if (response.status !== 200) console.error('GET /risks Error:', response.text);
      expect(response.status).toBe(200);

      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.pagination.total).toBe(0);
    });

    it('2. /risks (POST) - should create new risk', async () => {
      const response = await request(app.getHttpServer())
        .post('/risks')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          name: 'E2E Risk',
          description: 'E2E Testing',
          categoryId: 'cat-1',
          inherentProbability: 3,
          inherentImpact: 4
        })
        .expect(201);

      expect(response.body).toHaveProperty('id', 'test-risk');
      expect(mockPrismaService.risk.create).toHaveBeenCalled();
    });

    it('3. /risks (POST) - should fail DTO validation', async () => {
      await request(app.getHttpServer())
        .post('/risks')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          name: 'Short', // Missing required fields
        })
        .expect(400); // Bad Request (Validation failed)
    });
  });
});
