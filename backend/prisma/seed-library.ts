/**
 * KAYNAK KATALOĞU başlangıç içeriği — İZOLE / TEST DB İÇİN.
 *   • Kaynak manifesti (resmî URL + metadata; tam metin İNDİRİLMEZ)
 *   • 12 kontrol test kartı (kurum içi metodoloji TASLAĞI)
 *   • 6 borsa süreç kapsam kartı
 *   • Kanıt yeterliliği rehberi (ayrımlar + boyutlar + puanlama modeli)
 *   • 3 veri seti (A: RAG, B: eğitim, C: değerlendirme) + 60 sentetik senaryo
 *
 * Sentetik senaryolar "uzman onayı bekliyor" durumundadır; gerçek kurum kanıtı
 * DEĞİLDİR. Üretilen beklenen cevap otomatik altın standart SAYILMAZ.
 *
 * Kullanım (yalnız izole DB'de):
 *   DATABASE_URL=postgresql://.../grc_test npx ts-node prisma/seed-library.ts --apply --created-by admin@rmic.com
 *   (--apply verilmezse yalnız özet yazar, DB değişmez.)
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { TEST_CARDS } from './library-data/test-cards';
import { PROCESS_CARDS, EVIDENCE_RULES, SCORING_MODEL } from './library-data/process-and-evidence';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const CREATED_BY = (() => {
    const i = args.indexOf('--created-by');
    return i >= 0 ? args[i + 1] : undefined;
})();

interface ManifestSource {
    slug: string; kind: string; title: string; publisher?: string; officialUrl?: string;
    docCode?: string | null; language?: string; confidentiality?: string; tags?: string[];
    rightsNote?: string;
    version: { versionLabel: string; storageNote?: string; contentRetrieved?: boolean };
}

const SCENARIO_KINDS = [
    { kind: 'SUFFICIENT_EVIDENCE', decision: 'KARSILANDI', short: 'A' },
    { kind: 'CONTROL_GAP', decision: 'KARSILANMADI', short: 'B' },
    { kind: 'INSUFFICIENT_EVIDENCE', decision: 'DOGRULANAMADI', short: 'C' },
    { kind: 'CONFLICTING_EVIDENCE', decision: 'CELISKILI', short: 'D' },
    { kind: 'WRONG_PERIOD_SCOPE', decision: 'DOGRULANAMADI', short: 'E' },
] as const;

function scenarioBody(card: (typeof TEST_CARDS)[number], k: (typeof SCENARIO_KINDS)[number]) {
    const firstStep = card.steps[0]?.text ?? 'kontrol adımı';
    const ev = card.requestedEvidence.slice(0, 2);
    switch (k.kind) {
        case 'SUFFICIENT_EVIDENCE':
            return {
                inputEvidence: [
                    { name: 'Sistem dökümü', type: 'log', text: `${ev[0]} — değerlendirme dönemini kapsayan, sistem üretimi, tarihli.` },
                    { name: 'Onay izi', type: 'document', text: `${ev[1] ?? 'İkincil kanıt'} — bağımsız onaylayan ve tarih içeriyor.` },
                ],
                rationale: `Tüm adımlar dönemi ve kapsamı uygun doğrulayıcı kanıtla karşılandı; istisna yok. "${firstStep.slice(0, 80)}..." adımı sistem kaydıyla teyit edildi.`,
                missingEvidence: [],
                forbiddenInferences: ['Kanıt güçlü diye diğer kontrollerin de etkin olduğu sonucuna varma.'],
            };
        case 'CONTROL_GAP':
            return {
                inputEvidence: [
                    { name: 'Sistem dökümü', type: 'log', text: `${ev[0]} — dönemi kapsıyor ancak beklenen durumdan sapma içeriyor (ör. gerekli işlem yapılmamış).` },
                    { name: 'Görüşme notu', type: 'document', text: 'Kontrol sahibi sapmayı doğruluyor, telafi edici kontrol gösteremiyor.' },
                ],
                rationale: 'Beklenen durum en az bir adımda sağlanmadı ve telafi edici kontrol yok. Bu bir kontrol işleyiş eksikliğidir; teknik eksiklik varsa mevzuat ihlali olarak nitelemeden önce madde eşleştirmesi doğrulanmalı.',
                missingEvidence: [],
                forbiddenInferences: ['Doğrudan "mevzuata aykırı" deme — ilgili madde metni ve eşleştirmesi doğrulanmadan.'],
            };
        case 'INSUFFICIENT_EVIDENCE':
            return {
                inputEvidence: [
                    { name: 'Beyan', type: 'document', text: `Kontrol sahibinin "${card.title.toLowerCase()} kontrolü uygulanıyor" yazılı yanıtı.` },
                    { name: 'Ekran görüntüsü', type: 'image', text: 'Tek tarihli, kaynağı belirsiz bir ekran görüntüsü.' },
                ],
                rationale: 'Sunulan kanıtlar yalnızca beyan ve tek noktalı görüntü niteliğinde; dönem boyunca çalışmayı ve kapsamı göstermiyor. Sonuç doğrulanamadı; ek kanıt gerekli.',
                missingEvidence: card.requestedEvidence.slice(0, 3),
                forbiddenInferences: ['Kanıt gelmedi diye "kontrol yok / uyumsuz" deme (kanıt yokluğu ≠ kontrol eksikliği).'],
            };
        case 'CONFLICTING_EVIDENCE':
            return {
                inputEvidence: [
                    { name: 'Politika/ayar', type: 'document', text: 'Politika ya da sistem ayarı, kontrolün gereğinin sağlandığını söylüyor.' },
                    { name: 'Sistem çıktısı', type: 'log', text: 'Bağımsız sistem çıktısı, politikayla çelişen bir durum gösteriyor (ör. ayar tanımlı ama fiilen zorlanmıyor).' },
                ],
                rationale: 'Kanıtlar birbiriyle çelişiyor. Çelişki giderilmeden "karşılandı" denemez; sonuç çelişkili. Hangi kanıtın güncel/otoriter olduğu ve çelişkinin nedeni netleştirilmeli.',
                missingEvidence: ['Çelişkiyi açıklayan ek kanıt (ör. istisna kaydı, tarih sıralaması, kapsam farkı).'],
                forbiddenInferences: ['Politika dokümanına dayanıp sistem çıktısını yok sayma.'],
            };
        case 'WRONG_PERIOD_SCOPE':
        default:
            return {
                inputEvidence: [
                    { name: 'Eski dönem raporu', type: 'log', text: `${ev[0]} — ancak tarihi değerlendirme döneminin dışında (önceki yıl).` },
                    { name: 'Farklı ortam çıktısı', type: 'log', text: 'Kanıt üretim yerine test/geliştirme ortamına ait.' },
                ],
                rationale: 'Kanıtlar dönem dışı ve/veya kontrolün uygulandığı üretim kapsamını göstermiyor. Bu haliyle sonuç doğrulanamadı; doğru dönem ve kapsam için kanıt istenmeli.',
                missingEvidence: [`${card.title} için değerlendirme dönemini kapsayan, üretim ortamına ait kanıt.`],
                forbiddenInferences: ['Dönem dışı kanıtı güncel dönem sonucu gibi sunma.'],
            };
    }
}

async function main() {
    console.log(`Kaynak Kataloğu seed — ${APPLY ? 'UYGULA' : 'KURU (yalnız özet)'}`);
    const manifestPath = resolve(__dirname, 'library-data/source-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { sources: ManifestSource[] };

    console.log(`  Manifest: ${manifest.sources.length} kaynak`);
    console.log(`  Test kartı: ${TEST_CARDS.length}`);
    console.log(`  Süreç kartı: ${PROCESS_CARDS.length}`);
    console.log(`  Kanıt kuralı: ${EVIDENCE_RULES.length}`);
    console.log(`  Senaryo: ${TEST_CARDS.length * SCENARIO_KINDS.length} (12 kart × 5 tür)`);

    if (!APPLY) {
        console.log('\n--apply verilmedi. DB değişmedi.');
        return;
    }

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    try {
        const actor =
            (CREATED_BY
                ? await prisma.user.findFirst({ where: { OR: [{ id: CREATED_BY }, { email: CREATED_BY }] } })
                : null) ??
            (await prisma.user.findFirst({ where: { role: { name: 'SYSTEM_ADMIN' } }, orderBy: { createdAt: 'asc' } }));
        if (!actor) throw new Error('Aktör kullanıcı bulunamadı. --created-by <email> verin.');
        console.log(`\nAktör: ${actor.email}`);

        // 1) Kaynak + sürüm
        for (const s of manifest.sources) {
            const src = await prisma.source.upsert({
                where: { slug: s.slug },
                create: {
                    slug: s.slug,
                    kind: s.kind as never,
                    title: s.title,
                    publisher: s.publisher ?? null,
                    officialUrl: s.officialUrl ?? null,
                    docCode: s.docCode ?? null,
                    language: s.language ?? 'en',
                    confidentiality: (s.confidentiality ?? 'PUBLIC') as never,
                    tags: s.tags ?? [],
                    // Kullanım hakları: rightRefLink dışında hepsi UNKNOWN (izinli değil).
                    rightRefLink: 'ALLOWED',
                    rightsNote: s.rightsNote ?? null,
                    createdById: actor.id,
                },
                update: {
                    title: s.title,
                    publisher: s.publisher ?? null,
                    officialUrl: s.officialUrl ?? null,
                    rightsNote: s.rightsNote ?? null,
                },
            });
            await prisma.sourceVersion.upsert({
                where: { sourceId_versionLabel: { sourceId: src.id, versionLabel: s.version.versionLabel } },
                create: {
                    sourceId: src.id,
                    versionLabel: s.version.versionLabel,
                    contentRetrieved: s.version.contentRetrieved ?? false,
                    storageNote: s.version.storageNote ?? null,
                    approvalStatus: 'DRAFT',
                    accessedAt: new Date(),
                },
                update: { storageNote: s.version.storageNote ?? null },
            });
        }
        console.log('  ✓ kaynaklar + sürümler');

        // 2) Test kartları
        for (const c of TEST_CARDS) {
            await prisma.controlTestCard.upsert({
                where: { code: c.code },
                create: {
                    code: c.code,
                    topicNo: c.topicNo,
                    title: c.title,
                    origin: 'AI_DRAFT',
                    status: 'DRAFT',
                    purposeRisk: c.purposeRisk,
                    scopePrereq: c.scopePrereq,
                    method: c.method,
                    steps: c.steps as never,
                    expectedState: c.expectedState,
                    requestedEvidence: c.requestedEvidence as never,
                    evidenceSufficiency: c.evidenceSufficiency,
                    decisionCriteria: { ...c.decisionCriteria, suggestedSourceRefs: c.suggestedSourceRefs } as never,
                    misleadingSignals: c.misleadingSignals,
                    sampleControlResult: c.sampleControlResult,
                    sampleEvidenceRequest: c.sampleEvidenceRequest,
                    createdById: actor.id,
                },
                update: {
                    title: c.title,
                    purposeRisk: c.purposeRisk,
                    scopePrereq: c.scopePrereq,
                    method: c.method,
                    steps: c.steps as never,
                    expectedState: c.expectedState,
                    requestedEvidence: c.requestedEvidence as never,
                    evidenceSufficiency: c.evidenceSufficiency,
                    decisionCriteria: { ...c.decisionCriteria, suggestedSourceRefs: c.suggestedSourceRefs } as never,
                    misleadingSignals: c.misleadingSignals,
                    sampleControlResult: c.sampleControlResult,
                    sampleEvidenceRequest: c.sampleEvidenceRequest,
                },
            });
        }
        console.log('  ✓ 12 test kartı');

        // 3) Süreç kartları
        for (const p of PROCESS_CARDS) {
            await prisma.processScopeCard.upsert({
                where: { code: p.code },
                create: {
                    code: p.code,
                    title: p.title,
                    area: p.area,
                    status: 'DRAFT',
                    description: p.description,
                    criticalAssets: p.criticalAssets as never,
                    paramSpec: p.paramSpec as never,
                    linkedControlIds: [],
                    createdById: actor.id,
                },
                update: {
                    title: p.title,
                    description: p.description,
                    criticalAssets: p.criticalAssets as never,
                    paramSpec: p.paramSpec as never,
                },
            });
        }
        console.log('  ✓ 6 süreç kartı');

        // 4) Kanıt yeterliliği rehberi
        for (const r of EVIDENCE_RULES) {
            await prisma.evidenceSufficiencyRule.upsert({
                where: { code: r.code },
                create: {
                    code: r.code,
                    category: r.category,
                    title: r.title,
                    rule: r.rule,
                    goodExample: r.goodExample ?? null,
                    badExample: r.badExample ?? null,
                    scoringSpec: (r.scoringSpec ?? null) as never,
                    orderNo: r.orderNo,
                    createdById: actor.id,
                },
                update: {
                    title: r.title,
                    rule: r.rule,
                    goodExample: r.goodExample ?? null,
                    badExample: r.badExample ?? null,
                    scoringSpec: (r.scoringSpec ?? null) as never,
                },
            });
        }
        await prisma.evidenceSufficiencyRule.upsert({
            where: { code: 'KY-SCORING' },
            create: {
                code: 'KY-SCORING',
                category: 'dimension',
                title: 'Sayısal puanlama modeli',
                rule: `${SCORING_MODEL.method} — ${SCORING_MODEL.formula}`,
                scoringSpec: SCORING_MODEL as never,
                orderNo: 99,
                createdById: actor.id,
            },
            update: { scoringSpec: SCORING_MODEL as never },
        });
        console.log(`  ✓ ${EVIDENCE_RULES.length + 1} kanıt kuralı (+puanlama modeli)`);

        // 5) Veri setleri
        const datasets: Record<string, string> = {};
        for (const d of [
            { code: 'DS-A-RAG', name: 'RAG Kaynakları', purpose: 'RAG_SOURCE', description: 'Retrieval için sürümlü, yetkilendirilmiş kaynaklar.' },
            { code: 'DS-B-TRAIN', name: 'Uzman Onaylı Eğitim Örnekleri', purpose: 'TRAINING_EXAMPLE', description: 'Yalnız uzman onaylı (EXPERT_APPROVED) senaryolar buraya taşınır.' },
            { code: 'DS-C-EVAL', name: 'Değerlendirme Seti (Holdout)', purpose: 'EVAL_HOLDOUT', description: 'Eğitimde KULLANILMAYAN sabit değerlendirme seti. 60 sentetik senaryo.' },
        ] as const) {
            const ds = await prisma.evalDataset.upsert({
                where: { code: d.code },
                create: { code: d.code, name: d.name, purpose: d.purpose as never, description: d.description, createdById: actor.id },
                update: { name: d.name, description: d.description },
            });
            datasets[d.code] = ds.id;
        }
        console.log('  ✓ 3 veri seti');

        // 6) 60 sentetik senaryo (DS-C-EVAL)
        let n = 0;
        for (const card of TEST_CARDS) {
            const tc = await prisma.controlTestCard.findUnique({ where: { code: card.code }, select: { id: true } });
            for (const k of SCENARIO_KINDS) {
                const b = scenarioBody(card, k);
                await prisma.evalScenario.upsert({
                    where: { scenarioId: `SEN-${card.code}-${k.short}` },
                    create: {
                        scenarioId: `SEN-${card.code}-${k.short}`,
                        familyKey: `FAM-${card.code}`,
                        datasetId: datasets['DS-C-EVAL'],
                        testCardId: tc?.id ?? null,
                        kind: k.kind as never,
                        status: 'SYNTHETIC_PENDING_REVIEW',
                        synthetic: true,
                        inputEvidence: b.inputEvidence as never,
                        expectedDecision: k.decision,
                        rationale: b.rationale,
                        requiredRefs: card.suggestedSourceRefs as never,
                        forbiddenInferences: b.forbiddenInferences as never,
                        missingEvidence: b.missingEvidence as never,
                        labeledById: actor.id,
                    },
                    update: {
                        rationale: b.rationale,
                        inputEvidence: b.inputEvidence as never,
                        missingEvidence: b.missingEvidence as never,
                        forbiddenInferences: b.forbiddenInferences as never,
                    },
                });
                n++;
            }
        }
        console.log(`  ✓ ${n} sentetik senaryo (uzman onayı bekliyor)`);

        console.log('\n🎯 Kaynak Kataloğu seed tamamlandı.');
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
