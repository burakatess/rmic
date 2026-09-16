import { Test, TestingModule } from '@nestjs/testing';
import { DirectorateScopeService } from './directorate-scope.service';
import { PrismaService } from '../../prisma';

describe('DirectorateScopeService — kapsam çözümleme', () => {
    let service: DirectorateScopeService;
    let prisma: Record<string, any>;

    const membershipRows = (dirs: { id: string; name: string }[]) =>
        dirs.map(d => ({ directorate: d }));

    beforeEach(async () => {
        prisma = {
            directorateMembership: { findMany: jest.fn() },
        };
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DirectorateScopeService,
                { provide: PrismaService, useValue: prisma },
            ],
        }).compile();
        service = module.get(DirectorateScopeService);
    });

    afterEach(() => jest.clearAllMocks());

    describe('getScopeOptions', () => {
        it('report:org izni yoksa Kurum kapsamı kullanılamaz', async () => {
            prisma.directorateMembership.findMany.mockResolvedValue([]);
            const options = await service.getScopeOptions('u1', ['finding:view']);
            expect(options.org.available).toBe(false);
            expect(options.unit.available).toBe(false);
        });

        it('report:org izni varsa Kurum kapsamı kullanılabilir', async () => {
            prisma.directorateMembership.findMany.mockResolvedValue([]);
            const options = await service.getScopeOptions('u1', ['report:org']);
            expect(options.org.available).toBe(true);
        });

        it('wildcard izin (*) Kurum kapsamını açar', async () => {
            prisma.directorateMembership.findMany.mockResolvedValue([]);
            const options = await service.getScopeOptions('u1', ['*']);
            expect(options.org.available).toBe(true);
        });

        it('üyelik kaydı varsa Birimim kapsamı kullanılabilir ve direktörlükleri listeler', async () => {
            prisma.directorateMembership.findMany.mockResolvedValue(
                membershipRows([{ id: 'd2', name: 'Bilgi Güvenliği' }, { id: 'd1', name: 'BT Ağ Yönetimi' }]),
            );
            const options = await service.getScopeOptions('u1', []);
            expect(options.unit.available).toBe(true);
            // Türkçe alfabetik sırayla dönmeli ("Bilgi..." < "BT..." çünkü 'i' < 't')
            expect(options.unit.directorates.map(d => d.id)).toEqual(['d2', 'd1']);
        });
    });

    describe('resolveScope', () => {
        it('varsayılan (scope belirtilmemiş) her zaman MINE döner', async () => {
            prisma.directorateMembership.findMany.mockResolvedValue([]);
            const result = await service.resolveScope('u1', ['report:org'], {});
            expect(result.appliedScope).toBe('MINE');
            expect(result.directorateIds).toBeNull();
        });

        it('ORG istenip report:org yoksa MINE\'a düşer — kapsam genişletilemez', async () => {
            prisma.directorateMembership.findMany.mockResolvedValue([]);
            const result = await service.resolveScope('u1', ['finding:view'], { scope: 'ORG' });
            expect(result.appliedScope).toBe('MINE');
        });

        it('ORG istenip report:org varsa ORG uygulanır (directorateIds sınırı yok)', async () => {
            prisma.directorateMembership.findMany.mockResolvedValue([]);
            const result = await service.resolveScope('u1', ['report:org'], { scope: 'ORG' });
            expect(result.appliedScope).toBe('ORG');
            expect(result.directorateIds).toBeNull();
        });

        it('UNIT istenip hiç üyelik yoksa MINE\'a düşer', async () => {
            prisma.directorateMembership.findMany.mockResolvedValue([]);
            const result = await service.resolveScope('u1', [], { scope: 'UNIT', directorateId: ['d1'] });
            expect(result.appliedScope).toBe('MINE');
        });

        it('UNIT + geçerli üyelik → yalnızca yetkili direktörlük(ler) uygulanır', async () => {
            prisma.directorateMembership.findMany.mockResolvedValue(membershipRows([{ id: 'd1', name: 'A' }, { id: 'd2', name: 'B' }]));
            const result = await service.resolveScope('u1', [], { scope: 'UNIT', directorateId: ['d1'] });
            expect(result.appliedScope).toBe('UNIT');
            expect(result.directorateIds).toEqual(['d1']);
        });

        it('UNIT + sorgu parametresi başka kullanıcının/yetkisiz direktörlüğünü içeriyorsa GENİŞLEMEZ — yalnızca yetkili alt küme uygulanır', async () => {
            prisma.directorateMembership.findMany.mockResolvedValue(membershipRows([{ id: 'd1', name: 'A' }]));
            // d-yabanci kullanıcının üye OLMADIĞI bir direktörlük — sorgudan geçirilse bile yok sayılmalı.
            const result = await service.resolveScope('u1', [], { scope: 'UNIT', directorateId: ['d1', 'd-yabanci'] });
            expect(result.appliedScope).toBe('UNIT');
            expect(result.directorateIds).toEqual(['d1']);
            expect(result.directorateIds).not.toContain('d-yabanci');
        });

        it('UNIT istenip directorateId verilmezse TÜM yetkili direktörlükler uygulanır', async () => {
            prisma.directorateMembership.findMany.mockResolvedValue(membershipRows([{ id: 'd1', name: 'A' }, { id: 'd2', name: 'B' }]));
            const result = await service.resolveScope('u1', [], { scope: 'UNIT' });
            expect(result.appliedScope).toBe('UNIT');
            expect(result.directorateIds?.sort()).toEqual(['d1', 'd2']);
        });
    });
});
