import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UploadsController } from './uploads.controller';

describe('UploadsController — kayıt bazlı kanıt erişimi', () => {
  it('başka kullanıcıya ait aksiyon kanıtını ID değiştirerek açamaz', async () => {
    const prisma: any = {
      actionAttachment: { findUnique: jest.fn().mockResolvedValue({ id: 'ev-1', fileName: '2026/09/x.pdf', originalName: 'x.pdf', mimeType: 'application/pdf', uploadedBy: 'u-2', action: { ownerId: 'u-2' } }) },
    };
    const scope: any = { context: jest.fn().mockResolvedValue({ enforced: false }) };
    const controller = new UploadsController(prisma, scope);
    await expect(controller.readAttachment('action', 'ev-1', undefined, { id: 'u-1', role: 'AUDITEE' }, {} as any)).rejects.toThrow(ForbiddenException);
  });

  it('kapsam açıkken evidence:view izni olmadan kanıt açılamaz (salt okunur rolden türetilmez)', async () => {
    const prisma: any = { actionAttachment: { findUnique: jest.fn() } };
    const scope: any = {
      context: jest.fn().mockResolvedValue({ enforced: true, permissions: ['finding:view'] }),
      assertEvidencePermission: jest.fn(() => { throw new ForbiddenException('Kanıt görüntüleme/indirme yetkiniz yok.'); }),
    };
    const controller = new UploadsController(prisma, scope);
    await expect(controller.readAttachment('action', 'ev-1', undefined, { id: 'viewer-1', role: 'VIEWER' }, {} as any)).rejects.toThrow(ForbiddenException);
    expect(prisma.actionAttachment.findUnique).not.toHaveBeenCalled();
  });

  it('kapsam açıkken bulgu kanıtı için bulgunun TAMAMINA erişim gerekir (tek aksiyona atanmak yetmez)', async () => {
    const prisma: any = { findingAttachment: { findUnique: jest.fn().mockResolvedValue({ id: 'ev', findingId: 'f-1' }) } };
    const scope: any = {
      context: jest.fn().mockResolvedValue({ enforced: true, permissions: ['evidence:view'] }),
      assertEvidencePermission: jest.fn(),
      findingAccess: jest.fn().mockResolvedValue('PARTIAL'),
    };
    const controller = new UploadsController(prisma, scope);
    await expect(controller.readAttachment('finding', 'ev', undefined, { id: 'u-1' }, {} as any)).rejects.toThrow(NotFoundException);
  });
});
