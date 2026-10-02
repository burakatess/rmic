import { BadRequestException } from '@nestjs/common';
import { AuditsService } from './audits.service';

describe('Kanıt bağlantı metadata bütünlüğü', () => {
  const base = () => {
    const prisma: any = {
      finding: { findUnique: jest.fn().mockResolvedValue({ id: 'f1' }) },
      actionAttachment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ev1', actionId: 'a1', originalName: 'raw.pdf', displayName: null, description: null, fileName: 'opaque.pdf', mimeType: 'application/pdf' }),
        update: jest.fn().mockImplementation(({ data }: any) => ({ id: 'ev1', originalName: 'raw.pdf', fileName: 'opaque.pdf', mimeType: 'application/pdf', ...data })),
      },
      followUpAttachment: { findFirst: jest.fn(), update: jest.fn() },
      findingAttachment: { findFirst: jest.fn(), update: jest.fn() },
      findingFollowUp: { findFirst: jest.fn() },
      findingStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    return { prisma, service: new AuditsService(prisma) };
  };

  it('görünen ad/açıklama değişir; fiziksel dosya ve başka bağlantılar değişmez', async () => {
    const { prisma, service } = base();
    const result = await service.updateAttachmentMetadata('action', 'f1', 'ev1', { displayName: '  Aylık Rapor  ', description: '  Kontrol çıktısı  ' }, 'u1', 'a1');
    expect(prisma.actionAttachment.update).toHaveBeenCalledWith({ where: { id: 'ev1' }, data: { displayName: 'Aylık Rapor', description: 'Kontrol çıktısı' } });
    expect(result).toMatchObject({ originalName: 'raw.pdf', fileName: 'opaque.pdf', mimeType: 'application/pdf' });
  });

  it('onaylı takip kanıtının metadata kilidi aşılamaz', async () => {
    const { prisma, service } = base();
    prisma.followUpAttachment.findFirst.mockResolvedValue({ id: 'ev2', followUpId: 'fu1', originalName: 'x.pdf' });
    prisma.findingFollowUp.findFirst.mockResolvedValue({ status: 'ONAYLANDI', approvalStatus: 'ONAYLANDI' });
    await expect(service.updateAttachmentMetadata('follow-up', 'f1', 'ev2', { displayName: 'Yeni' }, 'u1', 'fu1')).rejects.toThrow(BadRequestException);
    expect(prisma.followUpAttachment.update).not.toHaveBeenCalled();
  });
});
