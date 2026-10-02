import { BadRequestException, ConflictException } from '@nestjs/common';
import { ControlScopeService } from './control-scope.service';

describe('ControlScopeService — toplu sürüm etki analizi', () => {
    const control = { id: 'c1', controlId: 'BTK.0001', name: 'Erişim Kontrolü', version: 3 };
    const period = {
        id: 's1', controlId: 'c1', year: 2027, status: 'ACTIVE', controlVersion: 2,
        tasks: [
            { id: 't1', testNo: 'T1', status: 'BEKLIYOR', periodLabel: 'Ocak' },
            { id: 't2', testNo: 'T2', status: 'DEVAM_EDIYOR', periodLabel: 'Şubat' },
            { id: 't3', testNo: 'T3', status: 'ONAYLANDI', periodLabel: 'Mart' },
        ],
    };

    const make = () => {
        const db: any = {
            control: { findUnique: jest.fn().mockResolvedValue(control) },
            controlYearScope: { findMany: jest.fn().mockResolvedValue([period]) },
        };
        return { db, service: new ControlScopeService(db) };
    };

    it('görevleri başlamamış/devam eden/final olarak sınıflandırır', async () => {
        const { service } = make();
        const result = await service.previewVersionImpact('c1');
        expect(result.outdatedPeriodCount).toBe(1);
        expect(result.periods[0]).toMatchObject({
            fromVersion: 2, toVersion: 3, requiresDecision: true,
            recommendedAction: 'KEEP_CURRENT',
        });
        expect(result.periods[0].finalTasks).toHaveLength(1);
    });

    it('devam eden görev varken örtük uygulamayı reddeder', async () => {
        const { service } = make();
        await expect(service.applyVersionImpact('c1', {
            expectedControlVersion: 3,
            decisions: [{ year: 2027, action: 'APPLY_TO_NOT_STARTED' }],
        }, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('önizlemeden sonra Ana Kontrol sürümü değişmişse 409 döner', async () => {
        const { service } = make();
        await expect(service.applyVersionImpact('c1', {
            expectedControlVersion: 2,
            decisions: [{ year: 2027, action: 'KEEP_CURRENT' }],
        }, 'user-1')).rejects.toThrow(ConflictException);
    });
});
