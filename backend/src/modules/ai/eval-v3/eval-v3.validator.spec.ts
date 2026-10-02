import { validateEvalV3Output } from './eval-v3.validator';
import { processEvalV3Response } from './eval-v3.pipeline';
import { validV3, U_TLS, U_REG, U_LOG } from './eval-v3.fixtures';

import { EvidenceCtx } from './eval-v3.pipeline';
const ctx = (units = [U_TLS], evidence: EvidenceCtx[] = [{ evidenceId: 'E1', name: 'ag.png', kind: 'IMAGE', readStatus: 'READ', attachmentId: 'a1' }]) => ({ units, evidence });

describe('validateEvalV3Output — yapı ve tutarlılık', () => {
    it('geçerli çıktıyı kabul eder', () => {
        const r = validateEvalV3Output(validV3());
        expect(r.valid).toBe(true);
        expect(r.normalized?.controlResult.status).toBe('INSUFFICIENT_EVIDENCE');
    });

    it('kanıt yetersizken bulgu üretilemez (INSUFFICIENT_EVIDENCE + finding.exists=true reddedilir)', () => {
        const r = validateEvalV3Output(validV3({
            finding: { exists: true, title: 'T', explanation: 'E', relatedReferenceIds: ['REF1'] },
        }));
        expect(r.valid).toBe(false);
        expect(r.issues.some((i) => i.path === 'finding.exists')).toBe(true);
    });

    it('kanıt yetersizken eksik kanıt listesi zorunludur', () => {
        const r = validateEvalV3Output(validV3({ additionalEvidenceRequired: [] }));
        expect(r.valid).toBe(false);
        expect(r.issues.some((i) => i.path === 'additionalEvidenceRequired')).toBe(true);
    });

    it('bulgu yoksa finding.exists=false kabul edilir (COMPLIANT)', () => {
        const r = validateEvalV3Output(validV3({
            controlResult: { status: 'COMPLIANT', text: 'Yapılan incelemelerde şifreli iletişim doğrulanmıştır.' },
            additionalEvidenceRequired: [],
        }));
        expect(r.valid).toBe(true);
        expect(r.normalized?.finding.exists).toBe(false);
    });

    it('COMPLIANT iken bulgu olamaz', () => {
        const r = validateEvalV3Output(validV3({
            controlResult: { status: 'COMPLIANT', text: 'Doğrulanmıştır.' },
            finding: { exists: true, title: 'T', explanation: 'E', relatedReferenceIds: ['REF1'] },
        }));
        expect(r.valid).toBe(false);
    });

    it('bulgu varsa ilişkili atıf (relatedReferenceIds) zorunludur', () => {
        const r = validateEvalV3Output(validV3({
            controlResult: { status: 'NON_COMPLIANT', text: 'Tespit edilmiştir.' },
            additionalEvidenceRequired: [],
            finding: { exists: true, title: 'T', explanation: 'E', relatedReferenceIds: [] },
        }));
        expect(r.valid).toBe(false);
        expect(r.issues.some((i) => i.path === 'finding.relatedReferenceIds')).toBe(true);
    });

    it('eski Gereklilik/Uygulanabilirlik/Sonuç/Gerekçe yapısı çıktıya taşınmaz', () => {
        const r = validateEvalV3Output(validV3({
            requirementAssessments: [{ requirement: 'x', applicability: 'APPLICABLE', result: 'MET', rationale: 'y' }],
        }));
        expect(r.valid).toBe(true);
        expect(JSON.stringify(r.normalized)).not.toMatch(/requirementAssessments|applicability|"rationale"/);
        expect(r.issues.some((i) => i.severity === 'WARN' && /dört sütunlu/.test(i.message))).toBe(true);
    });

    it('öznel/kanıt sınırını aşan ifadeleri uyarı olarak işaretler', () => {
        const r = validateEvalV3Output(validV3({
            controlResult: { status: 'INSUFFICIENT_EVIDENCE', text: 'İletişim açık metindir ve bize göre hatalıdır.' },
        }));
        expect(r.valid).toBe(true);
        const warns = r.issues.filter((i) => i.severity === 'WARN' && /Kaçınılması gereken/.test(i.message));
        expect(warns.length).toBeGreaterThanOrEqual(2);
    });

    it('JSON nesnesi olmayan çıktıyı reddeder', () => {
        expect(validateEvalV3Output('düz metin').valid).toBe(false);
        expect(validateEvalV3Output(null).valid).toBe(false);
    });
});

describe('processEvalV3Response — atıf doğrulama ve zenginleştirme', () => {
    it('retrieval sonucunda OLMAYAN madde atfı reddedilir ve çıktıda kalmaz', () => {
        const parsed = validV3({
            references: [
                { refId: 'REF1', sourceType: 'OFFICIAL_GUIDE', sourceName: 'x', version: '1', articleNumber: 'BIGR-9.9.9', articleTitle: 'uydurma', page: 1, sourceUnitId: 'u-yok', relation: 'r', assessment: 'RELEVANT' },
            ],
            usedSourceUnitIds: ['u-yok'],
        });
        const r = processEvalV3Response(parsed, ctx());
        expect(r.valid).toBe(true);
        expect(r.output?.references).toHaveLength(0);
        expect(r.output?.rejectedReferences?.[0].claimed).toContain('BIGR-9.9.9');
        expect(r.output?.usedSourceUnitIds).toEqual([]);
        expect(r.output?.referencesNote).toMatch(/doğrudan ilişkilendirilebilen bir hüküm tespit edilememiştir/);
        expect(r.reviewReasons.join(' ')).toMatch(/reddedildi/);
    });

    it('künye modelden değil kaynak kaydından yazılır (madde no, başlık, sayfa, sürüm, tür)', () => {
        const parsed = validV3({
            references: [
                { refId: 'REF1', sourceType: 'REGULATION', sourceName: 'Uydurma Kaynak', version: '9.9', articleNumber: 'BIGR-3.2.9.1', articleTitle: 'Yanlış', page: 1, sourceUnitId: 'u-tls', relation: 'r', assessment: 'RELEVANT' },
            ],
        });
        const r = processEvalV3Response(parsed, ctx());
        const ref = r.output!.references[0];
        expect(ref.sourceType).toBe('OFFICIAL_GUIDE'); // model REGULATION dese de
        expect(ref.sourceName).toBe(U_TLS.sourceName);
        expect(ref.version).toBe('1.1');
        expect(ref.page).toBe(87);
        expect(ref.articleTitle).toBe(U_TLS.title);
        expect(ref.snapshotText).toBe(U_TLS.text);
        expect(ref.verified).toBe(true);
    });

    it('rehber tedbiri kanuni zorunluluk gibi gösterilmez (bağlayıcılık notu + uyarı)', () => {
        const parsed = validV3({
            references: [
                { refId: 'REF1', sourceType: 'OFFICIAL_GUIDE', sourceName: 'x', version: '1.1', articleNumber: 'BIGR-3.2.9.1', articleTitle: 'x', page: 87, sourceUnitId: 'u-tls', relation: 'Bu durum mevzuata aykırıdır.', assessment: 'NON_COMPLIANT' },
            ],
        });
        const r = processEvalV3Response(parsed, ctx());
        expect(r.output!.references[0].bindingNote).toMatch(/kanuni bir zorunluluk olarak sunulmamıştır/);
        expect(r.issues.some((i) => /kanuni zorunluluk\/mevzuat ihlali/.test(i.message))).toBe(true);
        expect(r.reviewReasons.join(' ')).toMatch(/rehber\/mevzuat karışıklığı/);
    });

    it('Tebliğ kapsamı belirsizse kesin uyumsuzluk yazılmaz (NEEDS_CONFIRMATION + sabit ifade)', () => {
        const parsed = validV3({
            controlResult: { status: 'NON_COMPLIANT', text: 'Tespit edilmiştir.' },
            additionalEvidenceRequired: [],
            references: [
                { refId: 'REF1', sourceType: 'REGULATION', sourceName: 'x', version: 'x', articleNumber: 'md.9', articleTitle: 'x', page: null, sourceUnitId: 'u-reg', relation: 'Politika onayı görülmemiştir.', assessment: 'NON_COMPLIANT' },
            ],
            finding: { exists: true, title: 'Politika onayı', explanation: 'Onay kaydı sunulmamıştır.', relatedReferenceIds: ['REF1'] },
        });
        const r = processEvalV3Response(parsed, ctx([U_REG]));
        expect(r.valid).toBe(true);
        expect(r.output!.references[0].assessment).toBe('NEEDS_CONFIRMATION');
        expect(r.output!.finding.explanation).toContain('doğrudan uygulanabilirliği ayrıca doğrulanmalıdır');
        expect(r.output!.scopeNotes).toContain('İlgili mevzuat hükmünün incelenen kurum veya süreç bakımından doğrudan uygulanabilirliği ayrıca doğrulanmalıdır.');
    });

    it('kapsam IN_SCOPE ise mevzuat hükmü kesin değerlendirilebilir', () => {
        const parsed = validV3({
            references: [
                { refId: 'REF1', sourceType: 'REGULATION', sourceName: 'x', version: 'x', articleNumber: 'md.9', articleTitle: 'x', page: null, sourceUnitId: 'u-reg', relation: 'r', assessment: 'COMPLIANT' },
            ],
        });
        const r = processEvalV3Response(parsed, ctx([{ ...U_REG, scopeStatus: 'IN_SCOPE' }]));
        expect(r.output!.references[0].assessment).toBe('COMPLIANT');
        expect(r.output!.references[0].bindingNote).toBeNull();
    });

    it('bulgunun tüm atıfları reddedilirse çıktı GEÇERSİZ olur (kaynak dayanaksız bulgu)', () => {
        const parsed = validV3({
            controlResult: { status: 'NON_COMPLIANT', text: 'Tespit edilmiştir.' },
            additionalEvidenceRequired: [],
            references: [
                { refId: 'REF1', sourceType: 'OFFICIAL_GUIDE', sourceName: 'x', version: '1', articleNumber: 'BIGR-7.7.7', articleTitle: 'x', page: 1, sourceUnitId: 'u-yok', relation: 'r', assessment: 'NON_COMPLIANT' },
            ],
            finding: { exists: true, title: 'T', explanation: 'E', relatedReferenceIds: ['REF1'] },
        });
        const r = processEvalV3Response(parsed, ctx());
        expect(r.valid).toBe(false);
        expect(r.output).toBeNull();
        expect(r.issues.some((i) => i.path === 'finding.relatedReferenceIds' && i.severity === 'ERROR')).toBe(true);
    });

    it('id yanlış ama madde no iletilen tek birime uyuyorsa düzeltilir (corrected)', () => {
        const parsed = validV3({
            references: [
                { refId: 'REF1', sourceType: 'OFFICIAL_GUIDE', sourceName: 'x', version: '1.1', articleNumber: 'BIGR-4.4.1', articleTitle: 'x', page: 1, sourceUnitId: 'yanlis-id', relation: 'r', assessment: 'RELEVANT' },
            ],
        });
        const r = processEvalV3Response(parsed, ctx([U_TLS, U_LOG]));
        expect(r.output!.references[0].sourceUnitId).toBe('u-log');
        expect(r.output!.references[0].corrected).toBe(true);
    });

    it('kanıt eşleme: bilinmeyen kanıt kimliği atılır, ele alınmayan kanıt "kullanılmadı" olur, okunamayan dosya kısıt yazar', () => {
        const parsed = validV3({
            evaluatedEvidence: [
                { evidenceId: 'E1', name: 'model-adi', type: 'x', observation: 'gözlem', limitations: '' },
                { evidenceId: 'E99', name: 'uydurma', type: 'x', observation: 'g', limitations: '' },
            ],
        });
        const r = processEvalV3Response(parsed, ctx([U_TLS], [
            { evidenceId: 'E1', name: 'ag.png', kind: 'IMAGE', readStatus: 'READ', attachmentId: 'a1' },
            { evidenceId: 'E2', name: 'eski.docx', kind: 'DOCUMENT', readStatus: 'FAILED', note: 'Desteklenmeyen dosya türü.', attachmentId: 'a2' },
        ]));
        const ev = r.output!.evaluatedEvidence;
        expect(ev.map((e) => e.evidenceId)).toEqual(['E1', 'E2']);
        expect(ev[0].name).toBe('ag.png'); // künye backend'den
        expect(ev[0].used).toBe(true);
        expect(ev[1].used).toBe(false);
        expect(ev[1].limitations).toMatch(/okunamadığı için/);
        expect(r.issues.some((i) => /E99/.test(i.message))).toBe(true);
    });

    it('model kısa takma adı (U1, [U1], U:U1) veya gerçek id\'yi yazabilir — ikisi de doğru birime çözülür', () => {
        const mk = (id: string) => validV3({
            references: [{ refId: 'REF1', sourceType: 'OFFICIAL_GUIDE', sourceName: 'x', version: '1', articleNumber: 'BIGR-3.2.9.1', articleTitle: 'x', page: 1, sourceUnitId: id, relation: 'r', assessment: 'RELEVANT' }],
        });
        const units = [{ ...U_TLS, alias: 'U1' }, { ...U_LOG, alias: 'U2' }];
        for (const id of ['U1', '[U1]', 'U:U1', 'u1', 'u-tls']) {
            const r = processEvalV3Response(mk(id), ctx(units));
            expect(r.output!.references[0].sourceUnitId).toBe('u-tls');
            expect(r.output!.references[0].corrected).toBeUndefined();
        }
        // Var olmayan takma ad ve uyuşmayan madde numarası → reddedilir
        const bad = validV3({ references: [{ refId: 'REF1', sourceType: 'OFFICIAL_GUIDE', sourceName: 'x', version: '1', articleNumber: 'BIGR-8.8.8', articleTitle: 'x', page: 1, sourceUnitId: 'U9', relation: 'r', assessment: 'RELEVANT' }] });
        expect(processEvalV3Response(bad, ctx(units)).output!.references).toHaveLength(0);
    });
});
