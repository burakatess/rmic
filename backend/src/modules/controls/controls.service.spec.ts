import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ControlsService } from './controls.service';
import { PrismaService } from '../../prisma';

describe('ControlsService', () => {
    it('should be defined', () => {
        expect(true).toBe(true);
    });
});

describe('ControlsService.getAllTests — fiilî görev ataması filtresi', () => {
    it('dönem kapsamı yerine ControlTest assignee/secondController alanlarını filtreler', async () => {
        const prisma = {
            controlTest: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
        };
        const module = await Test.createTestingModule({ providers: [ControlsService, { provide: PrismaService, useValue: prisma }] }).compile();
        const service = module.get<ControlsService>(ControlsService);
        await service.getAllTests({ assigneeIds: 'u-1,u-2', secondControllerIds: '__UNASSIGNED__', page: '2', limit: '10' }, 'actor');
        const args = prisma.controlTest.findMany.mock.calls[0][0];
        expect(args.skip).toBe(10);
        expect(args.where.AND).toEqual([
            { assigneeId: { in: ['u-1', 'u-2'] } },
            { secondControllerId: null },
        ]);
        expect(prisma.controlTest.count).toHaveBeenCalledWith({ where: args.where });
    });
});

describe('ControlsService.create — mükerrer Kontrol Kodu', () => {
    it('aynı controlId için tanımlı 409 hata kodu döner ve kayıt oluşturmaz', async () => {
        const prisma = {
            control: {
                findUnique: jest.fn().mockResolvedValue({ id: 'existing-control' }),
                create: jest.fn(),
            },
            directorate: { findUnique: jest.fn() },
            auditLog: { create: jest.fn() },
        };
        const module: TestingModule = await Test.createTestingModule({
            providers: [ControlsService, { provide: PrismaService, useValue: prisma }],
        }).compile();
        const service = module.get<ControlsService>(ControlsService);

        let thrown: unknown;
        try {
            await service.create({ controlId: 'BTK.0001', name: 'Mükerrer kontrol' }, 'user-1');
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(ConflictException);
        expect((thrown as ConflictException).getResponse()).toEqual({
            statusCode: 409,
            error: 'Conflict',
            code: 'CONTROL_CODE_ALREADY_EXISTS',
            message: 'BTK.0001 Kontrol Kodu zaten kullanılıyor',
            field: 'controlId',
        });
        expect(prisma.control.create).not.toHaveBeenCalled();
    });

    it('eşzamanlı istek yarışındaki P2002 hatasını da aynı 409 hata koduna dönüştürür', async () => {
        const prisma = {
            control: {
                findUnique: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockRejectedValue(Object.assign(new Error('unique constraint'), {
                    code: 'P2002',
                    meta: { target: ['controlId'] },
                })),
            },
            directorate: { findUnique: jest.fn() },
            auditLog: { create: jest.fn() },
        };
        const module: TestingModule = await Test.createTestingModule({
            providers: [ControlsService, { provide: PrismaService, useValue: prisma }],
        }).compile();
        const service = module.get<ControlsService>(ControlsService);

        await expect(service.create({ controlId: 'BTK.0001' }, 'user-1')).rejects.toMatchObject({
            status: 409,
            response: expect.objectContaining({
                code: 'CONTROL_CODE_ALREADY_EXISTS',
                field: 'controlId',
            }),
        });
    });
});

// Madde 17: kontrol sürümü yalnızca tanım/test adımları/mehaz/ad GERÇEKTEN
// değişince artar — geçmiş Dönem Kontrolleri'nin "yeni sürüm var" göstergesi
// buna dayanır, gereksiz artış sahte bildirim üretir.
describe('ControlsService.update — Control.version artışı', () => {
    let service: ControlsService;
    let prisma: Record<string, any>;

    const existingControl = {
        id: 'ctl-1', name: 'Eski Ad', description: 'Eski Açıklama', testSteps: 'Eski Adımlar', mehaz: 'Eski Mehaz',
        version: 3, status: 'ACTIVE', directorateId: null, yearScopes: [],
    };

    beforeEach(async () => {
        prisma = {
            control: {
                findUnique: jest.fn().mockResolvedValue(existingControl),
                update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...existingControl, ...data })),
            },
            directorate: { findUnique: jest.fn() },
            auditLog: { create: jest.fn().mockResolvedValue({}) },
        };
        const module: TestingModule = await Test.createTestingModule({
            providers: [ControlsService, { provide: PrismaService, useValue: prisma }],
        }).compile();
        service = module.get<ControlsService>(ControlsService);
    });

    afterEach(() => jest.clearAllMocks());

    it('description değişince version artırılır', async () => {
        await service.update('ctl-1', { description: 'Yeni Açıklama' }, 'user-1');
        const updateData = prisma.control.update.mock.calls[0][0].data;
        expect(updateData.version).toEqual({ increment: 1 });
    });

    it('testSteps değişince version artırılır', async () => {
        await service.update('ctl-1', { testSteps: 'Yeni Adımlar' }, 'user-1');
        expect(prisma.control.update.mock.calls[0][0].data.version).toEqual({ increment: 1 });
    });

    it('aynı değer gönderilirse (gerçek değişiklik yok) version artırılmaz', async () => {
        await service.update('ctl-1', { description: 'Eski Açıklama' }, 'user-1');
        expect(prisma.control.update.mock.calls[0][0].data.version).toBeUndefined();
    });

    it('yalnızca tanımla ilgisiz bir alan (ör. notes) değişince version artırılmaz', async () => {
        await service.update('ctl-1', { notes: 'yeni not' }, 'user-1');
        expect(prisma.control.update.mock.calls[0][0].data.version).toBeUndefined();
    });

    it('birden fazla tanım alanı birlikte değişse bile version yalnızca 1 artırılır', async () => {
        await service.update('ctl-1', { description: 'X', testSteps: 'Y', mehaz: 'Z' }, 'user-1');
        expect(prisma.control.update.mock.calls[0][0].data.version).toEqual({ increment: 1 });
    });
});
