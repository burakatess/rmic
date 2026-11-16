import { RiskSimulationService } from './risk-simulation.service';
import { METHODOLOGY_V1 } from './calculation-engine';

/** Onaylı işareti: yalnız işaretli kontroller (ve onlara bağlı aksiyonlar) hesaplamaya girer. */
describe('RiskSimulationService.calculate — onaylı kontrol filtresi', () => {
    const strong = { p1: 'OTOMATIK', p2: 'ONLEYICI', p3: 'ELEKTRONIK_IMZA', p4: 'HER_IKISI', p5: 'FARKLI_BIRIM_GOZETIM', ktsMode: 'MANUAL', ktsManualValue: 100, impactArea: 'BOTH' };
    const scenario = (controls: any[], actions: any[] = []) => ({
        id: 's1', methodology: { config: METHODOLOGY_V1 }, naturalProbability: 4,
        finansalEtki: 4, itibarEtkisi: 4, regulasyonEtkisi: 4, musteriEtkisi: 4,
        gizlilikEtkisi: null, butunlukEtkisi: null, erisilebilirlikEtkisi: null, finalImpactChoice: 'BUSINESS',
        residualIsOverridden: false, controls, actions,
    });
    const run = (s: any) => {
        const prisma: any = { riskSimulationScenario: { findUnique: jest.fn().mockResolvedValue(s) } };
        return new RiskSimulationService(prisma).calculate('s1');
    };

    it('onaysız kontrol BKP ve ağırlık toplamına katılmaz; onay açılınca katılır', async () => {
        const on = { id: 'c1', ...strong, weight: 0.5, isApproved: true };
        const off = { id: 'c2', ...strong, weight: 0.5, isApproved: false };
        const withOff = await run(scenario([on, off]));
        const allOn = await run(scenario([on, { ...off, isApproved: true }]));
        expect(withOff.weightCheck.totalWeight).toBeCloseTo(0.5);
        expect(allOn.weightCheck.totalWeight).toBeCloseTo(1);
        expect(allOn.target.bkp.bkp).toBeGreaterThan(withOff.target.bkp.bkp as number);
        expect(withOff.target.bkp.contributions.map((c: any) => c.controlId)).toEqual(['c1']);
    });

    it('onaysız kontrolü hedefleyen aksiyon hesaplamaya girmez', async () => {
        const off = { id: 'c2', ...strong, weight: 0.5, isApproved: false };
        const action = { id: 'a1', targetControlSimId: 'c2', isApplied: true, priority: 1, effectMode: 'TARGET_KEP', targetKep: 100 };
        const res = await run(scenario([off], [action]));
        expect(res.actionContributions).toEqual([]);
        expect(res.target.bkp.contributions).toEqual([]);
    });
});
