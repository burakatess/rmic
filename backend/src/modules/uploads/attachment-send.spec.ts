import express from 'express';
import request from 'supertest';
import { HttpException } from '@nestjs/common';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { UploadsController, resolveUploadPath } from './uploads.controller';

/**
 * Kanıt dosyası gönderimi — gerçek dosyalarla HTTP regresyonu. Yükleme kökü, kök yolunda
 * nokta ile başlayan bir klasör içerir (".worktrees" gibi): sendFile'ın nokta-dosya kısıtı
 * yalnız köke göreli kısma uygulanmalı, kök klasör adı dosyayı 404'e düşürmemelidir.
 */
describe('Kanıt dosyası gönderimi (sendFile)', () => {
    const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    let base: string;
    let root: string;
    let app: express.Express;
    const controller = new UploadsController({} as any, {} as any);
    (controller as any).logger = { error: jest.fn() };

    beforeAll(() => {
        base = mkdtempSync(join(tmpdir(), 'rmic-upload-'));
        root = join(base, '.hidden-parent', 'uploads');
        mkdirSync(join(root, '2026', '11'), { recursive: true });
        writeFileSync(join(root, '2026', '11', 'a.pdf'), PDF);
        writeFileSync(join(root, '2026', '11', 'b.png'), PNG);
        writeFileSync(join(base, 'secret.txt'), 'kök dışı');
        symlinkSync(join(base, 'secret.txt'), join(root, '2026', '11', 'link.pdf'));
        mkdirSync(join(root, '2026', '.git'), { recursive: true });
        writeFileSync(join(root, '2026', '.git', 'x.pdf'), PDF);
        writeFileSync(join(root, '2026', '11', 'locked.pdf'), PDF);
        chmodSync(join(root, '2026', '11', 'locked.pdf'), 0o000);

        app = express();
        app.get('/f', (req, res) => {
            const att = { fileName: req.query.file, originalName: String(req.query.name ?? 'kanit.pdf'), mimeType: String(req.query.mime ?? 'application/pdf') };
            try {
                (controller as any).sendAttachment(att, req.query.download, res, root);
            } catch (e) {
                if (e instanceof HttpException) res.status(e.getStatus()).json({ message: e.message });
                else res.status(500).json({ message: 'Internal server error' });
            }
        });
    });

    afterAll(() => {
        try { chmodSync(join(root, '2026', '11', 'locked.pdf'), 0o600); } catch { /* yok */ }
        rmSync(base, { recursive: true, force: true });
    });

    it('geçerli PDF ve görsel açılır (içerik, tür ve inline/attachment başlığı)', async () => {
        const pdf = await request(app).get('/f').query({ file: '2026/11/a.pdf' }).expect(200);
        expect(pdf.headers['content-type']).toMatch(/^application\/pdf/);
        expect(pdf.headers['content-disposition']).toBe('inline; filename="kanit.pdf"');
        expect(Buffer.from(pdf.body).equals(PDF)).toBe(true);
        const png = await request(app).get('/f').query({ file: '2026/11/b.png', name: 'g.png', mime: 'image/png', download: 'true' }).expect(200);
        expect(png.headers['content-type']).toMatch(/^image\/png/);
        expect(png.headers['content-disposition']).toBe('attachment; filename="g.png"');
    });

    it('eksik dosya 404 döner ve iç yol sızmaz', async () => {
        const res = await request(app).get('/f').query({ file: '2026/11/yok.pdf' }).expect(404);
        expect(res.body.message).toBe('Dosya bulunamadı');
        expect(JSON.stringify(res.body)).not.toContain(base);
    });

    it('path traversal, mutlak yol ve kök dışına sembolik bağlantı engellenir', async () => {
        for (const file of ['../secret.txt', '2026/../../secret.txt', '/etc/passwd', join(base, 'secret.txt')]) {
            const res = await request(app).get('/f').query({ file });
            expect(res.status).toBe(400);
            expect(res.text).not.toContain('kök dışı');
        }
        const link = await request(app).get('/f').query({ file: '2026/11/link.pdf' }).expect(404);
        expect(link.text).not.toContain('kök dışı');
    });

    it('yükleme kökü içindeki nokta klasörü açılmaz (genel dotfiles erişimi kapalı)', async () => {
        const res = await request(app).get('/f').query({ file: '2026/.git/x.pdf' }).expect(404);
        expect(res.body.message).toBe('Dosya bulunamadı');
    });

    const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
    (asRoot ? it.skip : it)('izin hatası 404 değil 500 döner; iç yol istemciye yazılmaz, günlüğe düşer', async () => {
        const res = await request(app).get('/f').query({ file: '2026/11/locked.pdf' }).expect(500);
        expect(res.body.message).toBe('Dosya şu anda gönderilemiyor');
        expect(res.headers['content-disposition']).toBeUndefined();
        expect(JSON.stringify(res.body)).not.toContain(base);
        expect((controller as any).logger.error).toHaveBeenCalled();
    });

    it('resolveUploadPath boş/geçersiz girdiyi reddeder', () => {
        expect(() => resolveUploadPath('', root)).toThrow('Geçersiz dosya yolu');
        expect(() => resolveUploadPath(undefined, root)).toThrow('Geçersiz dosya yolu');
        expect(() => resolveUploadPath('2026/11/a.pdf\0.png', root)).toThrow('Geçersiz dosya yolu');
        expect(resolveUploadPath('2026/11/a.pdf', root)).toBe(join('2026', '11', 'a.pdf'));
    });
});
