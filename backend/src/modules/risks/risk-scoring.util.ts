/**
 * Doğal risk puanlaması — SUNUCUDA hesaplanır (istemciden hesaplanmış skor kabul edilmez).
 * Ağırlıklar risk ekranındaki yöntemle aynıdır:
 *   BT riski (flagForIT): gizlilik %35, bütünlük %30, erişilebilirlik %35
 *   Diğer: finansal %30, itibar %30, regülasyon %20, müşteri %20
 *   Doğal puan = etki × olasılık; seviye: ≥15 KRİTİK, ≥8 YÜKSEK, ≥4 ORTA, aksi DÜŞÜK
 */
export interface RiskScoringInput {
    flagForIT?: boolean | null;
    finansalEtki?: number | null; itibarEtkisi?: number | null;
    regulasyonEtkisi?: number | null; musteriEtkisi?: number | null;
    gizlilikEtkisi?: number | null; butunlukEtkisi?: number | null; erisilebilirlikEtkisi?: number | null;
    olasilik?: number | null;
}

export const RISK_SCORING_FIELDS: (keyof RiskScoringInput)[] = [
    'flagForIT', 'finansalEtki', 'itibarEtkisi', 'regulasyonEtkisi', 'musteriEtkisi',
    'gizlilikEtkisi', 'butunlukEtkisi', 'erisilebilirlikEtkisi', 'olasilik',
];

export function riskLevel(puan: number): string {
    if (puan >= 15) return 'KRİTİK';
    if (puan >= 8) return 'YÜKSEK';
    if (puan >= 4) return 'ORTA';
    return 'DÜŞÜK';
}

export function computeRiskScores(i: RiskScoringInput) {
    const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const etki = i.flagForIT
        ? n(i.gizlilikEtkisi) * 0.35 + n(i.butunlukEtkisi) * 0.30 + n(i.erisilebilirlikEtkisi) * 0.35
        : n(i.finansalEtki) * 0.30 + n(i.itibarEtkisi) * 0.30 + n(i.regulasyonEtkisi) * 0.20 + n(i.musteriEtkisi) * 0.20;
    const olasilik = n(i.olasilik);
    // Kayan nokta artığı (ör. 3.9999…) eşik kararını değiştirmesin: 2 haneye yuvarlanmış
    // değerler üzerinden hesaplanır.
    const round2 = (x: number) => Math.round(x * 100) / 100;
    const etkiR = round2(etki);
    const puan = round2(etkiR * olasilik);
    return {
        etki: etkiR > 0 ? etkiR : null,
        dogalRiskPuani: puan > 0 ? puan : null,
        dogalRiskSkoru: puan > 0 ? Math.round(puan) : null,
        dogalRiskSeviyesi: puan > 0 ? riskLevel(puan) : null,
    };
}
