import { ForbiddenException } from '@nestjs/common';
import { UploadsController } from './uploads.controller';

describe('UploadsController — kayıt bazlı kanıt erişimi', () => {
  it('başka kullanıcıya ait aksiyon kanıtını ID değiştirerek açamaz', async () => {
    const prisma: any = {
      actionAttachment: { findUnique: jest.fn().mockResolvedValue({ id: 'ev-1', fileName: '2026/09/x.pdf', originalName: 'x.pdf', mimeType: 'application/pdf', uploadedBy: 'u-2', action: { ownerId: 'u-2' } }) },
    };
    const controller = new UploadsController(prisma);
    await expect(controller.readAttachment('action', 'ev-1', undefined, 'u-1', 'AUDITEE', {} as any)).rejects.toThrow(ForbiddenException);
  });
});
