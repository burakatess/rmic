import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { createTestApp } from './helpers/test-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDatabase, seedRoles, createTestUser, E2E_TEST_PASSWORD } from './helpers/fixtures';
import { UPLOAD_ROOT } from '../src/modules/uploads/uploads.controller';

describe('E2E — Güvenli Dosya Yükleme', () => {
    let app: INestApplication;
    let token: string;
    const uploadedFiles: string[] = [];

    beforeAll(async () => {
        app = await createTestApp();
        const prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        await createTestUser(prisma, roles['SYSTEM_ADMIN'], { email: 'upload-admin@e2e.local' });
        token = (await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email: 'upload-admin@e2e.local', password: E2E_TEST_PASSWORD })
            .expect(200)).body.accessToken;
    });

    afterAll(async () => {
        await Promise.all(uploadedFiles.map((file) => unlink(join(UPLOAD_ROOT, file)).catch(() => undefined)));
        await app.close();
    });

    it('kimlik doğrulaması olmadan yükleme yapılamaz', async () => {
        await request(app.getHttpServer())
            .post('/uploads')
            .attach('file', Buffer.from('%PDF-1.7 test'), { filename: 'kanit.pdf', contentType: 'application/pdf' })
            .expect(401);
    });

    it.each([
        ['kanıt.pdf', 'application/pdf'],
        ['kanıt.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        ['kanıt.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        ['kanıt.png', 'image/png'],
        ['kanıt.jpg', 'image/jpeg'],
    ])('%s izin verilen uzantı ve MIME eşleşmesiyle yüklenir', async (filename, contentType) => {
        const response = await request(app.getHttpServer())
            .post('/uploads')
            .set('Authorization', `Bearer ${token}`)
            .attach('file', Buffer.from('test-file-content'), { filename, contentType })
            .expect(201);

        expect(response.body.originalName).toBe(filename);
        expect(response.body.mimeType).toBe(contentType);
        expect(response.body.sizeBytes).toBeGreaterThan(0);
        uploadedFiles.push(response.body.fileName);
    });

    it('izin verilen uzantı farklı bir MIME ile gönderilirse reddedilir', async () => {
        const response = await request(app.getHttpServer())
            .post('/uploads')
            .set('Authorization', `Bearer ${token}`)
            .attach('file', Buffer.from('not-a-pdf'), { filename: 'sahte.pdf', contentType: 'image/png' });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('eşleşmiyor');
    });

    it('sıfır bayt dosya reddedilir', async () => {
        const response = await request(app.getHttpServer())
            .post('/uploads')
            .set('Authorization', `Bearer ${token}`)
            .attach('file', Buffer.alloc(0), { filename: 'bos.pdf', contentType: 'application/pdf' });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('Boş');
    });

    it('15 MB sınırını aşan dosya reddedilir', async () => {
        await request(app.getHttpServer())
            .post('/uploads')
            .set('Authorization', `Bearer ${token}`)
            .attach('file', Buffer.alloc(15 * 1024 * 1024 + 1, 1), { filename: 'buyuk.pdf', contentType: 'application/pdf' })
            .expect(413);
    });

    it('aynı dosya adı iki kez yüklendiğinde iki ayrı kayıt üretilir ve üzerine yazılmaz', async () => {
        const upload = () => request(app.getHttpServer())
            .post('/uploads')
            .set('Authorization', `Bearer ${token}`)
            .attach('file', Buffer.from('%PDF duplicate'), { filename: 'ayni.pdf', contentType: 'application/pdf' });

        const first = await upload().expect(201);
        const second = await upload().expect(201);
        expect(first.body.fileName).not.toBe(second.body.fileName);
        uploadedFiles.push(first.body.fileName, second.body.fileName);
    });
});
