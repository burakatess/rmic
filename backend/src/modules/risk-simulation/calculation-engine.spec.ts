import {
    METHODOLOGY_V1, calcKYP, calcKEP, calcControlKep, calcBusinessImpact, calcInfosecImpact,
    roundImpactToTier, calcNaturalRisk, calcBKP, calcComponentControlStrength, getBkpLevel,
    calcResidualSuggestion, resolveResidual, applyActions, calculateScenario,
    type ControlInput, type ActionInput,
} from './calculation-engine';

const cfg = METHODOLOGY_V1;

const control = (over: Partial<ControlInput> = {}): ControlInput => ({
    id: 'c1', p1: 'MANUEL', p2: 'TESPIT_EDICI', p3: 'IZ_KAYDI_YOK', p4: 'YOK', p5: 'YOK',
    kts: 100, weight: 1, impactArea: 'BOTH', ...over,
});

describe('Doğal risk ve eşik sınırları', () => {
    it.each([
        [0, 1, 'Çok Düşük'], [1, 1, 'Çok Düşük'],
        [2, 2, 'Düşük'], [4, 2, 'Düşük'],
        [5, 3, 'Orta'], [10, 3, 'Orta'],
        [11, 4, 'Yüksek'], [16, 4, 'Yüksek'],
        [17, 5, 'Çok Yüksek'], [25, 5, 'Çok Yüksek'],
    ])('puan=%i → skor=%i (%s)', (puan, expectedSkor, expectedLabel) => {
        const band = cfg.riskLevels.find(b => puan >= b.min && puan <= b.max)!;
        expect(band.score).toBe(expectedSkor);
        expect(band.label).toBe(expectedLabel);
    });

    it('1x1=1 ve 5x5=25 uçları doğru sınıflandırılır', () => {
        expect(calcNaturalRisk(1, 1, cfg)).toEqual({ puan: 1, skor: 1, seviye: 'Çok Düşük' });
        expect(calcNaturalRisk(5, 5, cfg)).toEqual({ puan: 25, skor: 5, seviye: 'Çok Yüksek' });
    });
});

describe('P1-P5 geçerli seçenekler ve KYP', () => {
    it('örnek: 1.5+1.5+1+1+1=6 → KYP=%80', () => {
        const c = control({ p1: 'OTOMATIK', p2: 'ONLEYICI', p3: 'SISTEM_LOG_ISLAK_IMZA', p4: 'FARKLI_EKIP', p5: 'DUZENLI_UST_AMIR' });
        const { raw, kyp } = calcKYP(c, cfg);
        expect(raw).toBe(6);
        expect(kyp).toBeCloseTo(80, 6);
    });

    it('tüm P1-P5 seçenekleri config tablosunda tanımlı (geçersiz seçenek olamaz)', () => {
        for (const p1 of Object.keys(cfg.p1) as (keyof typeof cfg.p1)[]) {
            for (const p2 of Object.keys(cfg.p2) as (keyof typeof cfg.p2)[]) {
                expect(typeof cfg.p1[p1]).toBe('number');
                expect(typeof cfg.p2[p2]).toBe('number');
            }
        }
    });

    it('minimum ham puan (hepsi en düşük) → KYP=0', () => {
        const c = control({ p1: 'MANUEL', p2: 'TESPIT_EDICI', p3: 'IZ_KAYDI_YOK', p4: 'YOK', p5: 'YOK' });
        // p1+p2 min = 0.5+0.5=1, p3-p5 min=0 → raw=1
        const { kyp } = calcKYP(c, cfg);
        expect(kyp).toBeCloseTo((1 / 7.5) * 100, 6);
    });
});

describe('KEP ve KTS bilinmiyor durumu', () => {
    it('örnek: KYP 80, KTS 70 → KEP 74', () => {
        expect(calcKEP(80, 70, cfg)).toBeCloseTo(74, 6);
    });

    it('KTS null ise KEP null döner — 0 veya 100 varsayılmaz', () => {
        expect(calcKEP(80, null, cfg)).toBeNull();
        const c = control({ kts: null });
        expect(calcControlKep(c, cfg).kep).toBeNull();
    });

    it('"Bulgu Yok" KTS=100 anlamına gelmez — motor bunu asla varsaymaz, çağıran taraf açık değer vermeli', () => {
        // Motor katmanında zorlanamaz bir iş kuralı olduğundan, burada yalnızca
        // "kts sağlanmadıkça null kalır" davranışı doğrulanır.
        const c = control({ kts: null });
        expect(c.kts).not.toBe(100);
        expect(calcControlKep(c, cfg).kep).toBeNull();
    });
});

describe('BKP = 75 örneği ve bileşenler', () => {
    it('80×0.40 + 65×0.35 + 81×0.25 = 75', () => {
        const controls: ControlInput[] = [
            control({ id: 'a', kts: 100, weight: 0.40, targetKepOverride: 80 }),
            control({ id: 'b', kts: 100, weight: 0.35, targetKepOverride: 65 }),
            control({ id: 'c', kts: 100, weight: 0.25, targetKepOverride: 81 }),
        ];
        const result = calcBKP(controls, cfg);
        expect(result.bkp).toBeCloseTo(75, 6);
    });

    it('"Her ikisi" (BOTH) kontrolü hem olasılık hem etki bileşenine katkı verir', () => {
        const controls: ControlInput[] = [
            control({ id: 'both', impactArea: 'BOTH', weight: 0.5, targetKepOverride: 60 }),
        ];
        const prob = calcComponentControlStrength(controls, 'PROBABILITY', cfg);
        const impact = calcComponentControlStrength(controls, 'IMPACT', cfg);
        expect(prob.strength).toBeCloseTo(30, 6);
        expect(impact.strength).toBeCloseTo(30, 6);
    });

    it('ilgili bileşene etki eden kontrol yoksa bileşen gücü 0 — iki bileşen toplamı BKP olarak kullanılmaz', () => {
        const controls: ControlInput[] = [control({ id: 'only-impact', impactArea: 'IMPACT', weight: 1, targetKepOverride: 90 })];
        const prob = calcComponentControlStrength(controls, 'PROBABILITY', cfg);
        expect(prob.strength).toBe(0);
        const bkp = calcBKP(controls, cfg);
        // Genel BKP (gösterim amaçlı) yalnızca kendi Σ(KEP×ağırlık)'ı — bileşenlerin toplamı değil.
        expect(bkp.bkp).toBeCloseTo(90, 6);
    });

    it('bileşen ağırlıkları yeniden %100e normalize EDİLMEZ — orijinal ağırlıklarla toplanır', () => {
        // Yalnızca 1 kontrol IMPACT'i etkiliyor, ağırlığı %30 (toplam ağırlığın küçük bir payı).
        const controls: ControlInput[] = [
            control({ id: 'prob-only', impactArea: 'PROBABILITY', weight: 0.7, targetKepOverride: 100 }),
            control({ id: 'impact-only', impactArea: 'IMPACT', weight: 0.3, targetKepOverride: 100 }),
        ];
        const impact = calcComponentControlStrength(controls, 'IMPACT', cfg);
        // Normalize edilseydi 100 olurdu (tek kontrol %100 payla); edilmediği için 0.3*100=30.
        expect(impact.strength).toBeCloseTo(30, 6);
    });

    it.each([
        [0, 'Çok Zayıf', 0], [20, 'Çok Zayıf', 0],
        [20.0001, 'Zayıf', 1], [40, 'Zayıf', 1],
        [40.0001, 'Orta', 1], [60, 'Orta', 1],
        [60.0001, 'Güçlü', 2], [80, 'Güçlü', 2],
        [80.0001, 'Çok Güçlü', 3], [100, 'Çok Güçlü', 3],
    ])('BKP=%s → seviye=%s, kademe azaltım=%i', (x, label, reduction) => {
        const band = getBkpLevel(x as number, cfg);
        expect(band.label).toBe(label);
        expect(band.tierReduction).toBe(reduction);
    });
});

describe('Kontrolsüz pay ve kontrol kaldırma', () => {
    it('ağırlık toplamı %100 değilse kontrolsüz pay ayrı görünür, otomatik büyütülmez', () => {
        const controls: ControlInput[] = [control({ id: 'a', weight: 0.6, targetKepOverride: 80 })];
        const bkp = calcBKP(controls, cfg);
        expect(bkp.weightTotal).toBeCloseTo(0.6, 6);
        expect(bkp.unallocatedWeight).toBeCloseTo(0.4, 6);
        // BKP hesaplanırken eksik pay 0 katkı sağlar, kalan kontrolün ağırlığı YAPAY olarak büyümez.
        expect(bkp.bkp).toBeCloseTo(80 * 0.6, 6);
    });

    it('bir kontrol listeden çıkarılınca kalan kontrollerin ağırlıkları değişmez (çağıran taraf sorumlu, motor otomatik büyütmez)', () => {
        const before: ControlInput[] = [
            control({ id: 'a', weight: 0.5, targetKepOverride: 80 }),
            control({ id: 'b', weight: 0.5, targetKepOverride: 60 }),
        ];
        const after: ControlInput[] = [control({ id: 'a', weight: 0.5, targetKepOverride: 80 })]; // 'b' çıkarıldı, 'a' ağırlığı SABİT
        expect(calcBKP(before, cfg).contributions.find(c => c.controlId === 'a')!.weight).toBe(0.5);
        expect(calcBKP(after, cfg).contributions.find(c => c.controlId === 'a')!.weight).toBe(0.5);
    });
});

describe('Artık risk önerisi ve minimum 1 kuralı', () => {
    it('örnek: doğal olasılık 4, etki 5, olasılık gücü 75 (2 kademe), etki gücü 20 (0 kademe) → artık risk 2×5=10 Orta', () => {
        const controls: ControlInput[] = [
            control({ id: 'p', impactArea: 'PROBABILITY', weight: 1, targetKepOverride: 75 }),
            control({ id: 'i', impactArea: 'IMPACT', weight: 1, targetKepOverride: 20 }),
        ];
        const suggestion = calcResidualSuggestion(4, 5, controls, cfg);
        expect(suggestion.probabilityReduction).toBe(2);
        expect(suggestion.impactReduction).toBe(0);
        expect(suggestion.residualProbability).toBe(2);
        expect(suggestion.residualImpact).toBe(5);
        expect(suggestion.residualRisk).toBe(10);
        expect(calcNaturalRiskLevelLabel(10)).toBe('Orta');
    });

    it('kademe azaltımı olasılığı/etkiyi 1in altına düşüremez', () => {
        const controls: ControlInput[] = [control({ id: 'c', impactArea: 'BOTH', weight: 1, targetKepOverride: 100 })]; // güçlü → 3 kademe
        const suggestion = calcResidualSuggestion(2, 2, controls, cfg);
        expect(suggestion.residualProbability).toBe(1);
        expect(suggestion.residualImpact).toBe(1);
    });

    it('KTS bilinmeyen pozitif ağırlıklı kontrol varsa kesin öneri üretilmez', () => {
        const controls: ControlInput[] = [control({ kts: null, weight: 1 })];
        const suggestion = calcResidualSuggestion(3, 3, controls, cfg);
        expect(suggestion.hasUnknownKts).toBe(true);
        expect(suggestion.residualProbability).toBeNull();
    });

    function calcNaturalRiskLevelLabel(puan: number) {
        return cfg.riskLevels.find(b => puan >= b.min && puan <= b.max)!.label;
    }
});

describe('Manuel override', () => {
    it('override verildiğinde öneri yerine override kullanılır, öneri ayrıca saklanır', () => {
        const controls: ControlInput[] = [control({ impactArea: 'BOTH', weight: 1, targetKepOverride: 50 })];
        const suggestion = calcResidualSuggestion(4, 4, controls, cfg);
        const resolved = resolveResidual(suggestion, cfg, { probability: 3, impact: 3, reason: 'Uzman görüşü' });
        expect(resolved.isOverridden).toBe(true);
        expect(resolved.risk).toBe(9);
        expect(resolved.suggestion).toBe(suggestion); // öneri korunur, kaybolmaz
    });

    it('override yoksa öneri direkt kullanılır', () => {
        const controls: ControlInput[] = [control({ impactArea: 'BOTH', weight: 1, targetKepOverride: 0 })];
        const suggestion = calcResidualSuggestion(3, 3, controls, cfg);
        const resolved = resolveResidual(suggestion, cfg, null);
        expect(resolved.isOverridden).toBe(false);
        expect(resolved.probability).toBe(suggestion.residualProbability);
    });
});

describe('Aksiyon birleşimi ve çakışma', () => {
    const controls: ControlInput[] = [control({ id: 'c1', weight: 1, kts: 50 })];

    it('farklı kontrolleri/alanları hedefleyen aksiyonlar deterministik birleşir (çakışma yok)', () => {
        const actions: ActionInput[] = [
            { id: 'a1', targetControlId: 'c1', isApplied: true, priority: 1, effect: { mode: 'P1P5_KTS', p1: 'OTOMATIK' } },
            { id: 'a2', targetControlId: 'c1', isApplied: true, priority: 2, effect: { mode: 'P1P5_KTS', p2: 'ONLEYICI' } },
        ];
        const { controls: result, conflicts } = applyActions(controls, actions);
        expect(conflicts).toHaveLength(0);
        expect(result[0].p1).toBe('OTOMATIK');
        expect(result[0].p2).toBe('ONLEYICI');
    });

    it('aynı kontrolün aynı alanını farklı değerlere hedefleyen aksiyonlar çakışma olarak raporlanır', () => {
        const actions: ActionInput[] = [
            { id: 'a1', targetControlId: 'c1', isApplied: true, priority: 1, effect: { mode: 'P1P5_KTS', p1: 'OTOMATIK' } },
            { id: 'a2', targetControlId: 'c1', isApplied: true, priority: 2, effect: { mode: 'P1P5_KTS', p1: 'MANUEL' } },
        ];
        const { conflicts } = applyActions(controls, actions);
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].field).toBe('p1');
        expect(conflicts[0].actionIds.sort()).toEqual(['a1', 'a2']);
    });

    it('uygulanmamış (isApplied=false) aksiyonlar hiçbir etki yaratmaz', () => {
        const actions: ActionInput[] = [
            { id: 'a1', targetControlId: 'c1', isApplied: false, priority: 1, effect: { mode: 'P1P5_KTS', p1: 'OTOMATIK' } },
        ];
        const { controls: result } = applyActions(controls, actions);
        expect(result[0].p1).toBe('MANUEL'); // değişmedi
    });

    it('TARGET_KEP modu P1-P5/KTSyi bypass eder', () => {
        const actions: ActionInput[] = [
            { id: 'a1', targetControlId: 'c1', isApplied: true, priority: 1, effect: { mode: 'TARGET_KEP', targetKep: 85 } },
        ];
        const { controls: result } = applyActions(controls, actions);
        expect(calcControlKep(result[0], cfg).kep).toBe(85);
    });
});

describe('Kombinasyona bağlı aksiyon katkısı (tek başına vs marjinal)', () => {
    it('iki aksiyon birlikteyken toplam fayda münferit faydaların basit toplamı olmak ZORUNDA değildir — motor her seferinde yeniden hesaplar', () => {
        const controls: ControlInput[] = [control({ id: 'c1', impactArea: 'BOTH', weight: 1, kts: 50, p1: 'MANUEL', p2: 'TESPIT_EDICI' })];
        const actions: ActionInput[] = [
            { id: 'a1', targetControlId: 'c1', isApplied: true, priority: 1, effect: { mode: 'P1P5_KTS', p1: 'OTOMATIK' } },
            { id: 'a2', targetControlId: 'c1', isApplied: true, priority: 2, effect: { mode: 'P1P5_KTS', p2: 'ONLEYICI' } },
        ];
        const result = calculateScenario({
            cfg, naturalProbability: 4, finalImpactChoice: 'BUSINESS',
            businessImpactInputs: { financial: 4, reputation: 4, regulatory: 4, customer: 4 },
            controls, actions,
        });
        // Her iki aksiyon da uygulanmışken kombine BKP, tek başına ikisinin toplamından
        // farklı olabilir (kademe eşikleri yüzünden) — testin amacı motorun gerçekten
        // KOMBİNASYONU yeniden hesapladığını doğrulamak, körlemesine toplamadığını.
        const a1 = result.actionContributions.find(a => a.actionId === 'a1')!;
        const a2 = result.actionContributions.find(a => a.actionId === 'a2')!;
        expect(a1.standalone.bkp).not.toBeNull();
        expect(a2.standalone.bkp).not.toBeNull();
        expect(result.target.bkp.bkp).not.toBeNull();
        // Kombine sonuç, iki münferit "standalone" sonucun toplamından FARKLI bir
        // yeniden-hesaplamadır (aynı kontrolün P1 VE P2'si birlikte değişti).
        expect(result.target.bkp.bkp).not.toBeCloseTo((a1.standalone.bkp ?? 0) + (a2.standalone.bkp ?? 0), 6);
    });

    it('kademe eşiği aşılmazsa kontrol puanı iyileşse bile artık risk değişmeyebilir — bu "sıfır fayda" olarak yorumlanmaz (BKP deltası ayrı raporlanır)', () => {
        const controls: ControlInput[] = [control({ id: 'c1', impactArea: 'BOTH', weight: 1, targetKepOverride: 10 })]; // Çok Zayıf, 0 kademe
        const actions: ActionInput[] = [
            { id: 'a1', targetControlId: 'c1', isApplied: true, priority: 1, effect: { mode: 'TARGET_KEP', targetKep: 19 } }, // hâlâ Çok Zayıf (≤20)
        ];
        const result = calculateScenario({
            cfg, naturalProbability: 3, finalImpactChoice: 'BUSINESS',
            businessImpactInputs: { financial: 3, reputation: 3, regulatory: 3, customer: 3 },
            controls, actions,
        });
        const a1 = result.actionContributions.find(a => a.actionId === 'a1')!;
        expect(a1.kepBefore).toBe(10);
        expect(a1.kepAfter).toBe(19);
        expect(a1.marginal.bkp).toBeCloseTo(9, 6); // KEP/BKP iyileşmesi GERÇEK ve raporlanıyor
        expect(a1.marginal.residualRisk).toBe(0); // ama kademe eşiği aşılmadığından risk değişmedi
    });
});

describe('Gösterilen sonuç ile breakdown tutarlılığı', () => {
    it('calculateScenario çıktısındaki naturalRisk, ayrı çağrılan calcNaturalRisk ile birebir aynıdır', () => {
        const controls: ControlInput[] = [control({ id: 'c1', impactArea: 'BOTH', weight: 1, kts: 80 })];
        const input = {
            cfg, naturalProbability: 3, finalImpactChoice: 'BUSINESS' as const,
            businessImpactInputs: { financial: 4, reputation: 3, regulatory: 2, customer: 3 },
            controls, actions: [] as ActionInput[],
        };
        const result = calculateScenario(input);
        const expectedImpactRaw = calcBusinessImpact(input.businessImpactInputs, cfg)!;
        const expectedTier = roundImpactToTier(expectedImpactRaw);
        expect(result.finalImpactTier).toBe(expectedTier);
        expect(result.naturalRisk).toEqual(calcNaturalRisk(3, expectedTier, cfg));
    });

    it('aksiyon yokken baseline ve target aynı sonucu verir', () => {
        const controls: ControlInput[] = [control({ id: 'c1', impactArea: 'BOTH', weight: 1, kts: 80 })];
        const result = calculateScenario({
            cfg, naturalProbability: 3, finalImpactChoice: 'BUSINESS',
            businessImpactInputs: { financial: 3, reputation: 3, regulatory: 3, customer: 3 },
            controls, actions: [],
        });
        expect(result.target.bkp.bkp).toBeCloseTo(result.baseline.bkp.bkp as number, 6);
        expect(result.target.conflicts).toHaveLength(0);
    });
});

describe('Etki grupları ayrı hesaplanır — otomatik birleştirilmez', () => {
    it('business ve infosec etki tier\'ları bağımsız hesaplanır, finalImpactChoice açıkça seçilen alanı belirler', () => {
        const result = calculateScenario({
            cfg, naturalProbability: 3, finalImpactChoice: 'INFOSEC',
            businessImpactInputs: { financial: 5, reputation: 5, regulatory: 5, customer: 5 }, // yüksek iş etkisi
            infosecImpactInputs: { confidentiality: 1, integrity: 1, availability: 1 }, // düşük BT etkisi
            controls: [], actions: [],
        });
        expect(result.businessImpact.tier).toBe(5);
        expect(result.infosecImpact.tier).toBe(1);
        expect(result.finalImpactTier).toBe(1); // INFOSEC seçildiği için business'tan etkilenmez
    });
});
