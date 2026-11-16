import { computeRiskScores, riskLevel } from './risk-scoring.util';

describe('computeRiskScores — sunucu tarafı doğal risk puanı', () => {
    it('BT dışı: finansal %30, itibar %30, regülasyon %20, müşteri %20', () => {
        expect(computeRiskScores({ finansalEtki: 5, itibarEtkisi: 5, regulasyonEtkisi: 5, musteriEtkisi: 5, olasilik: 4 }))
            .toEqual({ etki: 5, dogalRiskPuani: 20, dogalRiskSkoru: 20, dogalRiskSeviyesi: 'KRİTİK' });
    });

    it('BT riski: gizlilik %35, bütünlük %30, erişilebilirlik %35', () => {
        expect(computeRiskScores({ flagForIT: true, gizlilikEtkisi: 2, butunlukEtkisi: 2, erisilebilirlikEtkisi: 2, olasilik: 2, finansalEtki: 5 }))
            .toEqual({ etki: 2, dogalRiskPuani: 4, dogalRiskSkoru: 4, dogalRiskSeviyesi: 'ORTA' });
    });

    it('girdi yoksa skor alanları boş', () => {
        expect(computeRiskScores({})).toEqual({ etki: null, dogalRiskPuani: null, dogalRiskSkoru: null, dogalRiskSeviyesi: null });
    });

    it('seviye eşikleri', () => {
        expect([riskLevel(3.9), riskLevel(4), riskLevel(8), riskLevel(15)]).toEqual(['DÜŞÜK', 'ORTA', 'YÜKSEK', 'KRİTİK']);
    });

    it('yuvarlama yalnız kayan nokta artığını temizler: sonuç kesin ondalık değerdir, eşikler aynı', () => {
        // 1·0.30+1·0.30+4·0.20+1·0.20 = 1.60 → ×5 = 8.00 (ham kayan nokta 7.999… idi → ORTA'ya düşüyordu)
        expect(computeRiskScores({ finansalEtki: 1, itibarEtkisi: 1, regulasyonEtkisi: 4, musteriEtkisi: 1, olasilik: 5 }))
            .toMatchObject({ etki: 1.6, dogalRiskPuani: 8, dogalRiskSeviyesi: 'YÜKSEK' });
        // 1.50 tam yarım: skor Math.round ile 2 (ham 1.4999… → 1 idi); ara yuvarlama politikası değişmedi
        expect(computeRiskScores({ finansalEtki: 1, itibarEtkisi: 2, regulasyonEtkisi: 2, musteriEtkisi: 1, olasilik: 1 }))
            .toMatchObject({ dogalRiskPuani: 1.5, dogalRiskSkoru: 2, dogalRiskSeviyesi: 'DÜŞÜK' });
        // Eşik sınırları: 4 ORTA, 8 YÜKSEK, 15 KRİTİK; hemen altı bir alt seviye
        expect([3.99, 4, 7.99, 8, 14.99, 15].map(riskLevel)).toEqual(['DÜŞÜK', 'ORTA', 'ORTA', 'YÜKSEK', 'YÜKSEK', 'KRİTİK']);
    });

    it('tüm tamsayı girdi kombinasyonlarında sonuç kesin ondalık hesapla aynı', () => {
        const v = [1, 2, 3, 4, 5];
        for (const a of v) for (const b of v) for (const c of v) for (const d of v) for (const o of v) {
            const exact = ((a * 30 + b * 30 + c * 20 + d * 20) * o) / 100;
            expect(computeRiskScores({ finansalEtki: a, itibarEtkisi: b, regulasyonEtkisi: c, musteriEtkisi: d, olasilik: o }).dogalRiskPuani).toBe(exact);
        }
        for (const a of v) for (const b of v) for (const c of v) for (const o of v) {
            const exact = ((a * 35 + b * 30 + c * 35) * o) / 100;
            expect(computeRiskScores({ flagForIT: true, gizlilikEtkisi: a, butunlukEtkisi: b, erisilebilirlikEtkisi: c, olasilik: o }).dogalRiskPuani).toBe(exact);
        }
    });
});
