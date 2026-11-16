import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { SaveTestDraftDto } from './control.dto';

// main.ts ile AYNI global pipe ayarı — implicit conversion dahil.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
const meta: ArgumentMetadata = { type: 'body', metatype: SaveTestDraftDto };

describe('SaveTestDraftDto — adım gözlemleri', () => {
    it('gözlem nesneleri global pipe sonrası korunur (boş diziye dönüşmez)', async () => {
        const out = await pipe.transform({ contentVersion: 1, stepObservations: [{ index: 0, observation: 'Sisteme erişildi' }, { index: 1, observation: '' }] }, meta);
        expect(out.stepObservations).toEqual([
            expect.objectContaining({ index: 0, observation: 'Sisteme erişildi' }),
            expect.objectContaining({ index: 1, observation: '' }),
        ]);
    });

    it('bilinmeyen alan ve aşırı uzun gözlem reddedilir', async () => {
        await expect(pipe.transform({ contentVersion: 1, stepObservations: [{ index: 0, observation: 'x', hack: 1 }] }, meta)).rejects.toThrow(BadRequestException);
        await expect(pipe.transform({ contentVersion: 1, stepObservations: [{ index: 0, observation: 'x'.repeat(5001) }] }, meta)).rejects.toThrow(BadRequestException);
    });
});
