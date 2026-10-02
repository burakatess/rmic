/**
 * SİSTEM KAYNAKLARI içe aktarma — Kaynak Kataloğu'na 3 doğrulanmış sistem kaynağı ekler/günceller:
 *   A) Kurumsal Denetim ve Kontrol Sonucu Yazım Metodolojisi   (INTERNAL_METHODOLOGY, 1 birim + tam metin)
 *   B) SPK Bilgi Sistemleri Yönetimi Tebliği (VII-128.10)       (REGULATION, madde/fıkra birimleri)
 *   C) T.C. Siber Güvenlik Başkanlığı Bilgi ve İletişim Güvenliği Rehberi v1.1 (OFFICIAL_GUIDE, tedbir birimleri)
 *
 * VARSAYILAN = DRY-RUN: veritabanına HİÇ yazmaz (salt-okunur oturumla yalnız mevcut durumu okur, ne olacağını
 * hesaplar). Yazmak için --apply gerekir. Idempotent: slug / [sourceId,versionLabel] / [versionId,stableKey]
 * anahtarlarıyla upsert; içerik özeti (contentHash) aynıysa dokunmaz; ikinci çalıştırma 0 oluşturma / 0 güncelleme
 * raporlar. Kaynaktan kalkan birimler ASLA silinmez, yalnızca raporlanır. Embedding/parça üretimi BU scriptte YOK
 * (indexStatus NONE — ayrı adım).
 *
 * Kullanım:
 *   npx ts-node prisma/import-system-sources.ts                                # dry-run, üçü birden
 *   npx ts-node prisma/import-system-sources.ts --only=bigr --pdf-bigr=/yol/rehber.pdf
 *   npx ts-node prisma/import-system-sources.ts --only=teblig --teblig-html=/yol/rg.html
 *   npx ts-node prisma/import-system-sources.ts --apply [--only=methodology|teblig|bigr[,..]] \
 *        [--teblig-pdf=yol | --teblig-html=yol | --teblig-url] [--report=yol.json]
 *
 * Koruma: --apply, DATABASE_URL veritabanı adı tam olarak "grc_db" ise, ayrıca
 * --i-have-approval-for-grc_db verilmedikçe reddedilir. Sistem kullanıcısı: rolü SYSTEM_ADMIN olan ilk kullanıcı
 * (ya da IMPORT_USER_EMAIL); yoksa --apply iptal edilir.
 *
 * ÖNEMLİ: Bu script bu çalışma kapsamında ÜRETİM DB'sine (grc_db) karşı --apply ile ÇALIŞTIRILMAMIŞTIR.
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import {
    METHODOLOGY_SLUG,
    METHODOLOGY_TITLE,
    METHODOLOGY_VERSION,
    METHODOLOGY_TEXT,
    METHODOLOGY_HASH,
} from '../src/modules/library/system-sources/methodology';
import {
    BIGR_SOURCE_SLUG,
    BIGR_TITLE,
    BIGR_PUBLISHER,
    BIGR_VERSION,
    BIGR_PUBLISH_DATE,
    extractPdfPages,
    parseBigrPages,
    verifyBigrUnits,
    type BigrConsistencyReport,
} from '../src/modules/library/system-sources/bigr-parser';
import {
    TEBLIG_SOURCE_SLUG,
    TEBLIG_ADI,
    TEBLIG_NO,
    TEBLIG_YAYIMLAYAN,
    TEBLIG_RG_TARIHI,
    TEBLIG_RG_SAYISI,
    TEBLIG_KAYNAK_URL,
    TEBLIG_VERSION,
    SCOPE_NOTE,
    loadTebligText,
    parseTebligText,
    extractScope,
} from '../src/modules/library/system-sources/teblig-parser';
import {
    checkApplyAllowed,
    diffFields,
    fingerprintUnit,
    GRC_DB_APPROVAL_FLAG,
    mergeSourceMetadata,
    planScopeParameter,
    planUpsert,
    READ_ONLY_PG_OPTIONS,
    SCOPE_PARAM_KEY,
    versionHashFromUnits,
} from '../src/modules/library/system-sources/import-plan';

// ───────────────────────────── argümanlar ─────────────────────────────

const argv = process.argv.slice(2);
function opt(name: string): string | undefined {
    const eq = argv.find((a) => a.startsWith(`--${name}=`));
    if (eq) return eq.slice(name.length + 3);
    const i = argv.indexOf(`--${name}`);
    if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
    return undefined;
}
const flag = (name: string) => argv.includes(`--${name}`) || argv.some((a) => a.startsWith(`--${name}=`));

const APPLY = flag('apply');
const ONLY = (opt('only') ?? 'methodology,teblig,bigr').split(',').map((s) => s.trim()).filter(Boolean);
const BIGR_PDF = opt('pdf-bigr') ?? '/Users/burak/Downloads/260515153932_Bilgi Güvenliği Rehberi.pdf';
const TEBLIG_PDF_DEFAULT = '/Users/burak/Test ve Çalışmalar/13 Mart 2025 PERŞEMBE.pdf';
const REPORT_PATH = opt('report') ?? path.resolve(__dirname, 'system-sources-import-report.json');

const RIGHTS_BASIS = 'Kamuya açık resmî yayın / kurumsal iç metodoloji — sistem içe aktarımı';

// ───────────────────────────── tipler ─────────────────────────────

interface IncomingUnit {
    stableKey: string;
    unitCode: string;
    unitType: string;
    title: string;
    originalText: string;
    parentKey: string | null;
    locator: Record<string, unknown>;
    metadata: Record<string, unknown>;
    contentHash: string;
}

interface IncomingSource {
    key: 'methodology' | 'teblig' | 'bigr';
    source: {
        slug: string;
        kind: 'INTERNAL_METHODOLOGY' | 'REGULATION' | 'OFFICIAL_GUIDE';
        title: string;
        publisher: string | null;
        officialUrl: string | null;
        docCode: string | null;
        language: string;
        confidentiality: 'PUBLIC';
        tags: string[];
        metadata: Record<string, unknown>;
    };
    version: {
        versionLabel: string;
        publishDate: Date | null;
        effectiveDate: Date | null;
        fullText: string | null;
        contentHash: string;
        metadata: Record<string, unknown>;
    };
    units: IncomingUnit[];
    warnings: string[];
    blockers: string[];
    extra: Record<string, unknown>;
}

interface Counts {
    created: number;
    updated: number;
    unchanged: number;
    removed: number;
}

interface SourceReport {
    key: string;
    slug: string;
    title: string;
    sourceAction: 'create' | 'update' | 'unchanged';
    sourceChangedFields: string[];
    versionAction: 'create' | 'update' | 'unchanged';
    versionChangedFields: string[];
    units: Counts;
    removedKeys: string[];
    warnings: string[];
    blockers: string[];
    applied: boolean;
    extra: Record<string, unknown>;
}

// ───────────────────────────── yükleyiciler ─────────────────────────────

const sha256File = (p: string) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

function buildUnit(u: Omit<IncomingUnit, 'contentHash'>): IncomingUnit {
    return { ...u, contentHash: fingerprintUnit(u) };
}

function loadMethodology(): IncomingSource {
    const unit = buildUnit({
        stableKey: 'METODOLOJI-1.0',
        unitCode: 'METODOLOJI-1.0',
        unitType: 'section',
        title: METHODOLOGY_TITLE,
        originalText: METHODOLOGY_TEXT,
        parentKey: null,
        locator: { section: 'tamamı', heading: METHODOLOGY_TITLE },
        metadata: { metodolojiSurumu: METHODOLOGY_VERSION, kurgu: 'İnceleme/Kontrol → Kanıt → Gözlem → Sonuç' },
    });
    return {
        key: 'methodology',
        source: {
            slug: METHODOLOGY_SLUG,
            kind: 'INTERNAL_METHODOLOGY',
            title: METHODOLOGY_TITLE,
            publisher: null,
            officialUrl: null,
            docCode: null,
            language: 'tr',
            confidentiality: 'PUBLIC',
            tags: ['metodoloji', 'denetim-yazim-dili', 'sistem-kaynagi'],
            metadata: { sistemKaynagi: true, tur: 'kurumsal-metodoloji', metodolojiSurumu: METHODOLOGY_VERSION },
        },
        version: {
            versionLabel: METHODOLOGY_VERSION,
            publishDate: null,
            effectiveDate: null,
            fullText: METHODOLOGY_TEXT,
            contentHash: METHODOLOGY_HASH,
            metadata: { sourceChecksum: createHash('sha256').update(METHODOLOGY_TEXT).digest('hex'), birimSayisi: 1, parserWarnings: [] },
        },
        units: [unit],
        warnings: [],
        blockers: [],
        extra: {},
    };
}

async function loadTeblig(): Promise<IncomingSource> {
    const url = flag('teblig-url') ? (opt('teblig-url') ?? TEBLIG_KAYNAK_URL) : undefined;
    const html = opt('teblig-html');
    const pdf = opt('teblig-pdf') ?? (!html && !url ? TEBLIG_PDF_DEFAULT : undefined);
    const base: Pick<IncomingSource, 'key' | 'warnings' | 'blockers' | 'extra'> = {
        key: 'teblig',
        warnings: [],
        blockers: [],
        extra: {},
    };
    const emptyShell = (blocker: string): IncomingSource => ({
        ...base,
        blockers: [blocker],
        source: {
            slug: TEBLIG_SOURCE_SLUG,
            kind: 'REGULATION',
            title: `${TEBLIG_ADI} (${TEBLIG_NO})`,
            publisher: TEBLIG_YAYIMLAYAN,
            officialUrl: TEBLIG_KAYNAK_URL,
            docCode: TEBLIG_NO,
            language: 'tr',
            confidentiality: 'PUBLIC',
            tags: [],
            metadata: {},
        },
        version: { versionLabel: TEBLIG_VERSION, publishDate: null, effectiveDate: null, fullText: null, contentHash: '', metadata: {} },
        units: [],
    });
    let loaded: Awaited<ReturnType<typeof loadTebligText>>;
    try {
        loaded = await loadTebligText({ pdf, html, url });
    } catch (e) {
        return emptyShell(`Tebliğ kaynağı okunamadı: ${(e as Error).message}`);
    }
    const parsed = parseTebligText(loaded.text, { kaynakUrl: url ?? TEBLIG_KAYNAK_URL });
    const scope = extractScope(loaded.text);
    const blockers: string[] = [];
    if (parsed.warnings.length) {
        for (const w of parsed.warnings) base.warnings.push(`[${w.code}] ${w.message}`);
    }
    const articles = parsed.units.filter((u) => u.unitType === 'article');
    if (articles.length < 30) blockers.push(`Yalnızca ${articles.length} madde bulundu (35 bekleniyordu).`);
    if (!scope) blockers.push('2. madde (Kapsam) bulunamadı.');
    const first = parsed.units[0]?.metadata;
    const units: IncomingUnit[] = parsed.units.map((u) =>
        buildUnit({
            stableKey: u.stableKey,
            unitCode: u.unitCode,
            unitType: u.unitType,
            title: u.title,
            originalText: u.originalText,
            parentKey: u.parentKey,
            locator: {
                section: [u.metadata.bolum, u.metadata.bolumAdi].filter(Boolean).join(' — ') || null,
                heading: u.metadata.maddeBasligi,
                madde: u.metadata.madde,
                fikra: u.metadata.fikra,
            },
            metadata: { ...u.metadata },
        }),
    );
    const yururluk = first?.yururlukTarihi ?? null;
    return {
        ...base,
        blockers,
        source: {
            slug: TEBLIG_SOURCE_SLUG,
            kind: 'REGULATION',
            title: `${TEBLIG_ADI} (${TEBLIG_NO})`,
            publisher: TEBLIG_YAYIMLAYAN,
            officialUrl: TEBLIG_KAYNAK_URL,
            docCode: TEBLIG_NO,
            language: 'tr',
            confidentiality: 'PUBLIC',
            tags: ['spk', 'mevzuat', 'bilgi-sistemleri', 'sistem-kaynagi'],
            metadata: {
                sistemKaynagi: true,
                tebligAdi: TEBLIG_ADI,
                tebligNo: TEBLIG_NO,
                resmiGazeteTarihi: TEBLIG_RG_TARIHI,
                resmiGazeteSayisi: TEBLIG_RG_SAYISI,
                yayimlayan: TEBLIG_YAYIMLAYAN,
                yururlukDurumu: 'YURURLUKTE',
                yururlukTarihi: yururluk,
                kaynakUrl: TEBLIG_KAYNAK_URL,
                // Kapsam kararını uygulama VERMEZ: birebir metin saklanır, doğrulama insana bırakılır.
                scope: { status: 'UNVERIFIED', verbatimArticle2: scope?.verbatimArticle2 ?? null, note: SCOPE_NOTE },
            },
        },
        version: {
            versionLabel: TEBLIG_VERSION,
            publishDate: new Date(`${TEBLIG_RG_TARIHI}T00:00:00.000Z`),
            effectiveDate: yururluk ? new Date(`${yururluk}T00:00:00.000Z`) : null,
            fullText: null,
            contentHash: versionHashFromUnits(units.map((u) => u.contentHash)),
            metadata: {
                sourceChecksum: loaded.checksum,
                sourceKind: loaded.kaynak.split(':')[0],
                sourceFile: loaded.kaynak.startsWith('url:') ? loaded.kaynak.slice(4) : path.basename(loaded.kaynak.slice(loaded.kaynak.indexOf(':') + 1)),
                sourceBytes: loaded.sourceBytes,
                maddeSayisi: articles.length,
                birimSayisi: units.length,
                maddeSirasi: parsed.articleOrder,
                parserWarnings: parsed.warnings.map((w) => `[${w.code}] ${w.message}`),
            },
        },
        units,
        extra: {
            kaynak: loaded.kaynak,
            maddeSayisi: articles.length,
            maddeSirasi: parsed.articleOrder,
            kurumSatirlari: scope?.institutionLines.length ?? 0,
        },
    };
}

async function loadBigr(): Promise<IncomingSource> {
    const shell = (blocker: string): IncomingSource => ({
        key: 'bigr',
        source: {
            slug: BIGR_SOURCE_SLUG,
            kind: 'OFFICIAL_GUIDE',
            title: BIGR_TITLE,
            publisher: BIGR_PUBLISHER,
            officialUrl: null,
            docCode: null,
            language: 'tr',
            confidentiality: 'PUBLIC',
            tags: [],
            metadata: {},
        },
        version: { versionLabel: BIGR_VERSION, publishDate: null, effectiveDate: null, fullText: null, contentHash: '', metadata: {} },
        units: [],
        warnings: [],
        blockers: [blocker],
        extra: {},
    });
    if (!fs.existsSync(BIGR_PDF)) return shell(`BİGR PDF bulunamadı: ${BIGR_PDF}`);
    let pages;
    try {
        pages = await extractPdfPages(BIGR_PDF);
    } catch (e) {
        return shell((e as Error).message);
    }
    const parsed = parseBigrPages(pages);
    const verify: BigrConsistencyReport = verifyBigrUnits(parsed.units, pages);
    const blockers: string[] = [];
    if (!verify.ok) blockers.push(`Tutarlılık doğrulaması başarısız (${verify.issues.length} sorun): ${verify.issues.slice(0, 3).map((i) => i.message).join(' | ')}`);
    if (parsed.units.length < 100) blockers.push(`Yalnızca ${parsed.units.length} tedbir bulundu.`);
    const missingCore = parsed.warnings.filter((w) => ['MISSING_TITLE', 'MISSING_TEXT', 'MISSING_LEVEL', 'DUPLICATE_TEDBIR_ROW', 'ORPHAN_QUESTION_ROW', 'ROW_WITHOUT_TEXT', 'NO_COLUMN_BOUNDARY', 'COLUMN_MISALIGNED', 'QUESTION_TITLE_MISMATCH', 'GROUP_NAME_MISMATCH', 'TOC_NUMBERING_MISMATCH'].includes(w.code));
    if (missingCore.length) blockers.push(`${missingCore.length} kritik ayrıştırma uyarısı var (ör. ${missingCore[0].code}).`);
    const units: IncomingUnit[] = parsed.units.map((u) =>
        buildUnit({
            stableKey: u.stableKey,
            unitCode: u.unitCode,
            unitType: u.unitType,
            title: u.title,
            originalText: u.originalText,
            parentKey: null,
            locator: {
                page: u.page,
                pageEnd: u.pageEnd,
                printedPage: u.metadata.sayfaBasili,
                denetimPage: u.metadata.denetimSayfasi,
                section: [u.metadata.bolumAdi, u.metadata.altBolumAdi].filter(Boolean).join(' > '),
                heading: `${u.metadata.tedbirBaslikNo}. ${u.metadata.tedbirBaslikAdi ?? ''}`.trim(),
            },
            metadata: { ...u.metadata },
        }),
    );
    const checksum = sha256File(BIGR_PDF);
    const warnMsgs = parsed.warnings.map((w) => `[${w.code}]${w.unitCode ? ` ${w.unitCode}:` : ''} ${w.message}`);
    return {
        key: 'bigr',
        source: {
            slug: BIGR_SOURCE_SLUG,
            kind: 'OFFICIAL_GUIDE',
            title: BIGR_TITLE,
            publisher: BIGR_PUBLISHER,
            officialUrl: null,
            docCode: null,
            language: 'tr',
            confidentiality: 'PUBLIC',
            tags: ['siber-guvenlik', 'rehber', 'tedbir', 'sistem-kaynagi'],
            metadata: { sistemKaynagi: true, dokumanSurumu: BIGR_VERSION, yayimTarihi: BIGR_PUBLISH_DATE, yayimlayan: BIGR_PUBLISHER, sayfaSayisi: pages.length },
        },
        version: {
            versionLabel: BIGR_VERSION,
            publishDate: new Date(`${BIGR_PUBLISH_DATE}T00:00:00.000Z`),
            effectiveDate: null,
            fullText: null,
            contentHash: versionHashFromUnits(units.map((u) => u.contentHash)),
            metadata: {
                sourceChecksum: checksum,
                sourceFile: path.basename(BIGR_PDF),
                pageCount: pages.length,
                unitCount: units.length,
                stats: parsed.stats,
                parserWarnings: warnMsgs,
                consistency: { ok: verify.ok, unitsChecked: verify.unitsChecked, issues: verify.issues.length, groups: Object.keys(verify.groupCounts).length },
            },
        },
        units,
        warnings: warnMsgs,
        blockers,
        extra: {
            pageCount: pages.length,
            stats: parsed.stats,
            warningCounts: parsed.warnings.reduce<Record<string, number>>((a, w) => ({ ...a, [w.code]: (a[w.code] ?? 0) + 1 }), {}),
            consistency: verify,
            sample: ['BIGR-3.1.8.1', 'BIGR-3.2.9.1', 'BIGR-3.2.9.2', 'BIGR-4.4.1', 'BIGR-4.4.1.1', 'BIGR-5.1.1', 'BIGR-5.1.1.1'].map((k) => {
                const u = parsed.units.find((x) => x.unitCode === k);
                return u ? { unitCode: u.unitCode, title: u.title, page: u.page, level: u.metadata.tedbirSeviyesi, text: u.originalText.slice(0, 200), question: u.metadata.denetimSorusu?.slice(0, 200) ?? null } : { unitCode: k, bulunamadi: true };
            }),
        },
    };
}

// ───────────────────────────── plan + uygulama ─────────────────────────────

const SOURCE_DIFF_KEYS = ['kind', 'title', 'publisher', 'officialUrl', 'docCode', 'language', 'confidentiality', 'tags', 'isSystemManaged', 'metadata'];
const VERSION_DIFF_KEYS = ['publishDate', 'effectiveDate', 'fullText', 'contentHash', 'contentRetrieved', 'metadata'];

type ExistingSource = Prisma.SourceGetPayload<{
    include: { versions: { include: { units: { select: { id: true; stableKey: true; contentHash: true } } } } };
}>;

async function fetchExisting(prisma: PrismaClient, slug: string): Promise<ExistingSource | null> {
    return prisma.source.findUnique({
        where: { slug },
        include: { versions: { include: { units: { select: { id: true, stableKey: true, contentHash: true } } } } },
    });
}

function planSource(existing: ExistingSource | null, inc: IncomingSource): {
    report: SourceReport;
    unitPlan: ReturnType<typeof planUpsert<{ id: string; stableKey: string; contentHash: string | null }, IncomingUnit>>;
    existingVersionId: string | null;
    existingVersionHash: string | null;
    existingVersionIndexStatus: string | null;
    mergedSourceMetadata: Record<string, unknown>;
} {
    const incSourceView = { ...inc.source, isSystemManaged: true };
    const mergedMeta = mergeSourceMetadata(existing?.metadata, inc.source.metadata);
    let sourceAction: SourceReport['sourceAction'] = 'create';
    let sourceChanged: string[] = [];
    if (existing) {
        sourceChanged = diffFields(existing, { ...incSourceView, metadata: mergedMeta }, SOURCE_DIFF_KEYS);
        sourceAction = sourceChanged.length ? 'update' : 'unchanged';
    }
    const exVersion = existing?.versions.find((v) => v.versionLabel === inc.version.versionLabel) ?? null;
    let versionAction: SourceReport['versionAction'] = 'create';
    let versionChanged: string[] = [];
    if (exVersion) {
        versionChanged = diffFields(
            exVersion,
            { ...inc.version, contentRetrieved: true },
            VERSION_DIFF_KEYS,
        );
        versionAction = versionChanged.length ? 'update' : 'unchanged';
    }
    const unitPlan = planUpsert(exVersion?.units ?? [], inc.units);
    const report: SourceReport = {
        key: inc.key,
        slug: inc.source.slug,
        title: inc.source.title,
        sourceAction,
        sourceChangedFields: sourceChanged,
        versionAction,
        versionChangedFields: versionChanged,
        units: {
            created: unitPlan.toCreate.length,
            updated: unitPlan.toUpdate.length,
            unchanged: unitPlan.unchanged.length,
            removed: unitPlan.removed.length,
        },
        removedKeys: unitPlan.removed.slice(0, 50).map((u) => u.stableKey),
        warnings: inc.warnings.slice(0, 500),
        blockers: inc.blockers,
        applied: false,
        extra: inc.extra,
    };
    return {
        report,
        unitPlan,
        existingVersionId: exVersion?.id ?? null,
        existingVersionHash: exVersion?.contentHash ?? null,
        existingVersionIndexStatus: exVersion?.indexStatus ?? null,
        mergedSourceMetadata: mergedMeta,
    };
}

const asJson = (v: unknown) => v as Prisma.InputJsonValue;

async function applySource(
    prisma: PrismaClient,
    inc: IncomingSource,
    plan: ReturnType<typeof planSource>,
    existing: ExistingSource | null,
    actorId: string,
): Promise<void> {
    const now = new Date();
    await prisma.$transaction(
        async (tx) => {
            // 1) Kaynak
            let sourceId: string;
            if (!existing) {
                const created = await tx.source.create({
                    data: {
                        kind: inc.source.kind,
                        slug: inc.source.slug,
                        title: inc.source.title,
                        publisher: inc.source.publisher,
                        officialUrl: inc.source.officialUrl,
                        docCode: inc.source.docCode,
                        language: 'tr',
                        confidentiality: 'PUBLIC',
                        tags: inc.source.tags,
                        rightRag: 'ALLOWED',
                        rightFullText: 'ALLOWED',
                        rightRefLink: 'ALLOWED',
                        rightsBasis: RIGHTS_BASIS,
                        rightsVerifiedAt: now,
                        rightsVerifiedById: actorId,
                        isSystemManaged: true,
                        isActive: true,
                        metadata: asJson(inc.source.metadata),
                        createdById: actorId,
                        reviewedById: actorId,
                    },
                });
                sourceId = created.id;
            } else {
                sourceId = existing.id;
                if (plan.report.sourceAction === 'update') {
                    // Hak/onay alanlarına ve isActive'e DOKUNULMAZ (insan kararı olabilir).
                    await tx.source.update({
                        where: { id: sourceId },
                        data: {
                            kind: inc.source.kind,
                            title: inc.source.title,
                            publisher: inc.source.publisher,
                            officialUrl: inc.source.officialUrl,
                            docCode: inc.source.docCode,
                            language: 'tr',
                            confidentiality: 'PUBLIC',
                            tags: inc.source.tags,
                            isSystemManaged: true,
                            metadata: asJson(plan.mergedSourceMetadata),
                        },
                    });
                }
            }

            // 2) Sürüm
            const versionMeta = { ...inc.version.metadata, importedAt: now.toISOString() };
            let versionId: string;
            if (!plan.existingVersionId) {
                const v = await tx.sourceVersion.create({
                    data: {
                        sourceId,
                        versionLabel: inc.version.versionLabel,
                        publishDate: inc.version.publishDate,
                        effectiveDate: inc.version.effectiveDate,
                        accessedAt: now,
                        contentHash: inc.version.contentHash,
                        contentRetrieved: true,
                        fullText: inc.version.fullText,
                        metadata: asJson(versionMeta),
                        approvalStatus: 'APPROVED',
                        contentReviewedById: actorId,
                        contentReviewedAt: now,
                        indexStatus: 'NONE',
                    },
                });
                versionId = v.id;
            } else {
                versionId = plan.existingVersionId;
                if (plan.report.versionAction === 'update') {
                    const contentChanged =
                        plan.existingVersionHash !== inc.version.contentHash || plan.report.versionChangedFields.includes('fullText');
                    await tx.sourceVersion.update({
                        where: { id: versionId },
                        data: {
                            publishDate: inc.version.publishDate,
                            effectiveDate: inc.version.effectiveDate,
                            contentHash: inc.version.contentHash,
                            contentRetrieved: true,
                            fullText: inc.version.fullText,
                            metadata: asJson(versionMeta),
                            ...(contentChanged
                                ? {
                                      contentChangedAt: now,
                                      // İçerik değişti: indeks eskir (sessizce "hazır" kalmaz).
                                      ...(plan.existingVersionIndexStatus === 'READY' ? { indexStatus: 'STALE' as const } : {}),
                                  }
                                : {}),
                        },
                    });
                }
            }

            // 3) Birimler
            if (plan.unitPlan.toCreate.length) {
                await tx.sourceUnit.createMany({
                    data: plan.unitPlan.toCreate.map((u) => ({
                        versionId,
                        stableKey: u.stableKey,
                        unitCode: u.unitCode,
                        unitType: u.unitType,
                        title: u.title,
                        originalText: u.originalText,
                        parentKey: u.parentKey,
                        locator: asJson(u.locator),
                        metadata: asJson(u.metadata),
                        riskAreas: [],
                        contentHash: u.contentHash,
                    })),
                });
            }
            for (const { existing: ex, incoming: u } of plan.unitPlan.toUpdate) {
                await tx.sourceUnit.update({
                    where: { id: ex.id },
                    data: {
                        unitCode: u.unitCode,
                        unitType: u.unitType,
                        title: u.title,
                        originalText: u.originalText,
                        parentKey: u.parentKey,
                        locator: asJson(u.locator),
                        metadata: asJson(u.metadata),
                        contentHash: u.contentHash,
                    },
                });
            }
        },
        { timeout: 300_000, maxWait: 30_000 },
    );

    // Denetim izi — başarısız olsa bile ana işlem sürer (transaction dışı, mevcut desen).
    await prisma.auditLog
        .create({
            data: {
                userId: actorId,
                action: plan.report.sourceAction === 'create' ? 'CREATE' : 'UPDATE',
                entityType: 'Source',
                entityId: existing?.id ?? inc.source.slug,
                oldValue: Prisma.JsonNull,
                newValue: asJson({
                    islem: 'SYSTEM_SOURCE_IMPORT',
                    slug: inc.source.slug,
                    surum: inc.version.versionLabel,
                    kaynak: plan.report.units,
                }),
            },
        })
        .catch(() => undefined);
}

// ───────────────────────────── ana akış ─────────────────────────────

async function main() {
    const guard = checkApplyAllowed({
        databaseUrl: process.env.DATABASE_URL,
        apply: APPLY,
        approvalFlagGiven: argv.includes(GRC_DB_APPROVAL_FLAG),
    });
    console.log(`Mod: ${APPLY ? 'APPLY' : 'DRY-RUN (DB\'ye yazılmaz)'} | Veritabanı: ${guard.dbName ?? '(bilinmiyor)'} | Kaynaklar: ${ONLY.join(', ')}`);
    if (!guard.ok) {
        console.error(`REDDEDİLDİ: ${guard.reason}`);
        process.exit(2);
    }
    for (const k of ONLY) if (!['methodology', 'teblig', 'bigr'].includes(k)) {
        console.error(`Bilinmeyen --only değeri: ${k} (methodology|teblig|bigr)`);
        process.exit(2);
    }

    // Kaynakları (DB'siz) yükle
    const incoming: IncomingSource[] = [];
    if (ONLY.includes('methodology')) incoming.push(loadMethodology());
    if (ONLY.includes('teblig')) incoming.push(await loadTeblig());
    if (ONLY.includes('bigr')) incoming.push(await loadBigr());

    // DB: dry-run'da sunucu tarafında salt-okunur oturum
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ...(APPLY ? {} : { options: READ_ONLY_PG_OPTIONS }),
    });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    const reports: SourceReport[] = [];
    let systemUser: { id: string; email: string } | null = null;
    let dbNote: string | null = null;
    let paramReport: { key: string; action: 'create' | 'unchanged'; applied: boolean } | null = null;
    try {
        try {
            const email = process.env.IMPORT_USER_EMAIL;
            systemUser = await prisma.user.findFirst({
                where: email ? { email } : { role: { name: 'SYSTEM_ADMIN' }, isActive: true },
                orderBy: { createdAt: 'asc' },
                select: { id: true, email: true },
            });
            if (!systemUser) {
                const msg = `Sistem kullanıcısı bulunamadı (${email ? `IMPORT_USER_EMAIL=${email}` : 'rolü SYSTEM_ADMIN olan kullanıcı yok'}).`;
                if (APPLY) {
                    console.error(`İPTAL: ${msg}`);
                    process.exit(3);
                }
                dbNote = msg;
                console.warn(`UYARI (dry-run): ${msg}`);
            }
        } catch (e) {
            if (APPLY) throw e;
            dbNote = `DB okunamadı, mevcut durum boş varsayıldı: ${(e as Error).message}`;
            console.warn(`UYARI (dry-run): ${dbNote}`);
        }

        for (const inc of incoming) {
            let existing: ExistingSource | null = null;
            if (!dbNote?.startsWith('DB okunamadı')) {
                try {
                    existing = await fetchExisting(prisma, inc.source.slug);
                } catch (e) {
                    // Dry-run: şema geride olabilir (migrate deploy bekliyor) — mevcut durum boş varsayılır.
                    if (APPLY || !['P2021', 'P2022'].includes((e as { code?: string }).code ?? '')) throw e;
                    dbNote = `DB okunamadı, mevcut durum boş varsayıldı: şema geride (${(e as { code?: string }).code}); migrate deploy gerekli.`;
                    console.warn(`UYARI (dry-run): ${dbNote}`);
                }
            }
            const plan = planSource(existing, inc);
            if (APPLY && systemUser) {
                const nothingToDo =
                    plan.report.sourceAction === 'unchanged' &&
                    plan.report.versionAction === 'unchanged' &&
                    plan.report.units.created === 0 &&
                    plan.report.units.updated === 0;
                if (inc.blockers.length) {
                    console.error(`ATLANDI ${inc.key}: ${inc.blockers.join(' | ')}`);
                } else if (nothingToDo) {
                    // Değişiklik yok: transaction da denetim kaydı da yazılmaz (idempotent).
                } else {
                    await applySource(prisma, inc, plan, existing, systemUser.id);
                    plan.report.applied = true;
                }
            }
            reports.push(plan.report);
        }
        // Kapsam profili parametresi: yalnız YOKSA oluşturulur, varsa asla ezilmez (yönetici arayüzü satır yaratamaz).
        if (ONLY.includes('teblig') && !dbNote?.startsWith('DB okunamadı')) {
            const exParam = await prisma.parameter.findUnique({ where: { key: SCOPE_PARAM_KEY }, select: { id: true } });
            const pPlan = planScopeParameter(exParam, TEBLIG_SOURCE_SLUG);
            paramReport = { key: SCOPE_PARAM_KEY, action: pPlan.action === 'create' ? 'create' : 'unchanged', applied: false };
            if (APPLY && systemUser && pPlan.action === 'create' && pPlan.data) {
                try {
                    const created = await prisma.parameter.create({
                        data: { ...pPlan.data, value: asJson(pPlan.data.value) },
                    });
                    paramReport.applied = true;
                    await prisma.auditLog
                        .create({
                            data: {
                                userId: systemUser.id,
                                action: 'CREATE',
                                entityType: 'Parameter',
                                entityId: created.id,
                                oldValue: Prisma.JsonNull,
                                newValue: asJson({ key: SCOPE_PARAM_KEY, value: pPlan.data.value }),
                            },
                        })
                        .catch(() => undefined);
                } catch (e) {
                    // Eşzamanlı oluşturma (benzersiz anahtar) → mevcut sayılır; mevcut değere dokunulmaz.
                    if ((e as { code?: string }).code === 'P2002') paramReport.action = 'unchanged';
                    else throw e;
                }
            }
        }
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }

    const totals: Counts = reports.reduce(
        (a, r) => ({
            created: a.created + r.units.created + (r.sourceAction === 'create' ? 1 : 0) + (r.versionAction === 'create' ? 1 : 0),
            updated: a.updated + r.units.updated + (r.sourceAction === 'update' ? 1 : 0) + (r.versionAction === 'update' ? 1 : 0),
            unchanged: a.unchanged + r.units.unchanged,
            removed: a.removed + r.units.removed,
        }),
        { created: 0, updated: 0, unchanged: 0, removed: 0 },
    );
    if (paramReport?.action === 'create') totals.created += 1;
    const out = {
        generatedAt: new Date().toISOString(),
        mode: APPLY ? 'APPLY' : 'DRY-RUN',
        database: guard.dbName,
        systemUser: systemUser?.email ?? null,
        dbNote,
        totals,
        parameter: paramReport,
        sources: reports,
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(out, null, 2), 'utf8');

    for (const r of reports) {
        console.log(`\n■ ${r.key} — ${r.slug}`);
        console.log(`  kaynak: ${r.sourceAction}${r.sourceChangedFields.length ? ` (${r.sourceChangedFields.join(', ')})` : ''} | sürüm: ${r.versionAction}${r.versionChangedFields.length ? ` (${r.versionChangedFields.join(', ')})` : ''}`);
        console.log(`  birim: oluşturulacak/oluşturuldu ${r.units.created}, güncellenecek ${r.units.updated}, değişmedi ${r.units.unchanged}, kaynaktan kalkan (silinmez) ${r.units.removed}`);
        if (r.blockers.length) console.log(`  ENGEL: ${r.blockers.join(' | ')}`);
        if (r.warnings.length) console.log(`  ayrıştırma uyarısı: ${r.warnings.length}`);
        if (r.key === 'bigr' && r.extra.stats) {
            const ex = r.extra as { pageCount: number; stats: Record<string, number>; warningCounts: Record<string, number>; consistency: BigrConsistencyReport; sample: Record<string, unknown>[] };
            console.log(`  sayfa: ${ex.pageCount} | istatistik: ${JSON.stringify(ex.stats)}`);
            console.log(`  uyarı dağılımı: ${JSON.stringify(ex.warningCounts)}`);
            console.log(`  tutarlılık: ok=${ex.consistency.ok} kontrol edilen=${ex.consistency.unitsChecked} sorun=${ex.consistency.issues.length} grup=${Object.keys(ex.consistency.groupCounts).length} boşluk=${ex.consistency.gaps.length}`);
            for (const smp of ex.sample) console.log(`  örnek: ${JSON.stringify(smp)}`);
        }
        if (r.key === 'teblig' && r.extra.maddeSirasi) {
            const ex = r.extra as { kaynak: string; maddeSayisi: number; maddeSirasi: string[]; kurumSatirlari: number };
            console.log(`  kaynak: ${ex.kaynak} | madde: ${ex.maddeSayisi} | sıra: ${ex.maddeSirasi.join(',')} | 2. madde kurum satırı: ${ex.kurumSatirlari}`);
        }
        if (r.applied) console.log('  → UYGULANDI');
    }
    if (paramReport) console.log(`\n■ Parametre ${paramReport.key}: ${paramReport.action === 'create' ? (paramReport.applied ? 'OLUŞTURULDU' : 'oluşturulacak') : 'değişmedi (mevcut değere dokunulmaz)'}`);
    console.log(`\nToplam: oluşturulan ${totals.created}, güncellenen ${totals.updated}, değişmeyen birim ${totals.unchanged}, kalkan ${totals.removed}`);
    console.log(`Rapor: ${REPORT_PATH}`);
    if (!APPLY) console.log('--apply verilmedi: veritabanına hiçbir şey yazılmadı.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
