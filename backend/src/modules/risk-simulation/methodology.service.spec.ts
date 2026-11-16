import { BadRequestException } from '@nestjs/common';
import { METHODOLOGY_V1, roundImpactToTier } from './calculation-engine';
import { configToSettings, settingsToConfig } from './methodology.service';

describe('Metodoloji ayarları ↔ motor yapılandırması', () => {
    it('V1 → form → V1 kayıpsız', () => {
        const s = configToSettings(METHODOLOGY_V1);
        expect(s).toMatchObject({ kypWeightPct: 40, riskLevelUpperBounds: [1, 4, 10, 16], bkpUpperBounds: [20, 40, 60, 80], bkpTierReductions: [0, 1, 1, 2, 3], rounding: 'ROUND_HALF_UP' });
        expect(settingsToConfig(s, 1)).toEqual(METHODOLOGY_V1);
    });

    it('kontrol puanı böleni en yüksek P puanlarının toplamından türetilir', () => {
        const s = configToSettings(METHODOLOGY_V1);
        s.p5 = { ...s.p5, FARKLI_BIRIM_GOZETIM: 2.5 };
        expect(settingsToConfig(s, 2).kypDivisor).toBe(8.5);
    });

    it('tutarsız ayar okunur hata verir', () => {
        const s = configToSettings(METHODOLOGY_V1);
        s.businessWeightsPct.financial = 20;
        s.riskLevelUpperBounds = [4, 2, 10, 16];
        expect(() => settingsToConfig(s, 2)).toThrow(BadRequestException);
        expect(() => settingsToConfig(s, 2)).toThrow(/İş etkisi ağırlıkları toplamı %100.*artan sırada/);
    });

    it('etki yuvarlama seçenekleri', () => {
        expect([2.5, 2.4, 2.01, 3].map(x => roundImpactToTier(x))).toEqual([3, 2, 2, 3]);
        expect([2.01, 3, 3.0000001].map(x => roundImpactToTier(x, 'CEIL'))).toEqual([3, 3, 3]);
        expect([2.99, 3].map(x => roundImpactToTier(x, 'FLOOR'))).toEqual([2, 3]);
    });
});
