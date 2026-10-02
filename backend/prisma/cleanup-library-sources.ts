/**
 * KAYNAK KATALOĞU temizlik aracı — her Source için bağımlılık/kullanım özeti ve önerilen eylem üretir.
 *
 * VARSAYILAN = ÖNİZLEME (SALT-OKUNUR): yalnızca SELECT/COUNT çalıştırır; DB oturumu sunucu tarafında
 * `default_transaction_read_only=on` ile açılır — kod yanlışlıkla yazmaya kalksa bile veritabanı reddeder.
 * Önerilen eylemler: KORU | ARSIVLE | SILINEBILIR | SISTEM_KAYNAGIYLA_DEGISTIR (kurallar: cleanup-rules.ts).
 *
 * Uygulama (yalnız AÇIKÇA listelenen kimlikler için):
 *   npx ts-node prisma/cleanup-library-sources.ts --apply --ids=<id|slug>,<id|slug>
 *     • SILINEBILIR → Source + sürümleri tek transaction'da fiziksel siler; transaction İÇİNDE bağımlılıklar
 *       yeniden doğrulanır, öneri artık SILINEBILIR değilse iptal edilir (geçmiş kullanımlı kaynak asla silinmez).
 *     • ARSIVLE → Source.isActive=false; DRAFT/IN_REVIEW sürümler WITHDRAWN (birim/parça/snapshot'a dokunulmaz).
 *     • KORU / SISTEM_KAYNAGIYLA_DEGISTIR → reddedilir (gerekçe yazılır).
 *   Her uygulanan eylem AuditLog yazar (DELETE | UPDATE, entityType 'Source', oldValue anlık görüntüsü).
 *
 * Koruma: --apply, DATABASE_URL veritabanı adı "grc_db" ise --i-have-approval-for-grc_db olmadan reddedilir.
 * Kullanıcı: rolü SYSTEM_ADMIN olan ilk kullanıcı (ya da CLEANUP_USER_EMAIL / IMPORT_USER_EMAIL).
 *
 * ÖNEMLİ: --apply yalnızca izole test DB'sinde denenmiştir; üretim DB'sine (grc_db) karşı ÇALIŞTIRILMAMIŞTIR.
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import {
    anyIdIn,
    isApplicable,
    jsonReferencesSource,
    recommendAction,
    refusalReason,
    versionStatusesToWithdraw,
    type CleanupAction,
    type SourceFacts,
} from '../src/modules/library/system-sources/cleanup-rules';
import {
    checkApplyAllowed,
    GRC_DB_APPROVAL_FLAG,
    READ_ONLY_PG_OPTIONS,
} from '../src/modules/library/system-sources/import-plan';
import { TEBLIG_SOURCE_SLUG } from '../src/modules/library/system-sources/teblig-parser';

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
const IDS = (opt('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const REPORT_PATH = opt('report') ?? path.resolve(__dirname, 'library-cleanup-preview.json');
// Yeni Tebliğ sistem kaynağı bu çalışmada içe aktarılması planlı sayılır (import-system-sources.ts); kapatmak için:
const REPLACEMENT_PLANNED = !flag('replacement-not-planned');

type Db = Prisma.TransactionClient;

interface SessionRow {
    id: string;
    sourceUnitIds: string[];
    usedSourceUnitIds: string[];
    suggestedSourceUnitIds: string[];
    sourceSnapshot: Prisma.JsonValue | null;
}
interface MessageRow {
    id: string;
    sentSourceUnitIds: string[];
    citedSourceRefs: Prisma.JsonValue | null;
    runInputSnapshot: Prisma.JsonValue | null;
}

interface UsageRows {
    sessions: SessionRow[];
    messages: MessageRow[];
    complete: boolean;
    notes: string[];
}

interface PreviewRow {
    id: string;
    slug: string;
    title: string;
    kind: string;
    isSystemManaged: boolean;
    isActive: boolean;
    versions: { versionLabel: string; approvalStatus: string }[];
    rightRag: string;
    facts: SourceFacts;
    usage: { sessionsSelected: number; sessionsUsed: number; sessionsSuggested: number; sessionsSnapshot: number; messagesSent: number; messagesCited: number; messagesRunSnapshot: number };
    recommendation: CleanupAction;
    reason: string;
}

type SourceWithVersions = Prisma.SourceGetPayload<{ include: { versions: { select: { id: true; versionLabel: true; approvalStatus: true } } } }>;

const isMissingSchema = (e: unknown) => ['P2021', 'P2022'].includes((e as { code?: string })?.code ?? '');

/** Şema geride olabilir (ör. grc_db'ye migrate deploy uygulanmadı): eksik kolon/tabloda kademeli geri çekilme. */
async function tryFind<T>(label: string, notes: string[], attempts: (() => Promise<T[]>)[]): Promise<{ rows: T[]; complete: boolean }> {
    for (let i = 0; i < attempts.length; i++) {
        try {
            return { rows: await attempts[i](), complete: i === 0 };
        } catch (e) {
            if (!isMissingSchema(e)) throw e;
            notes.push(`${label}: kolon/tablo bulunamadı (deneme ${i + 1}/${attempts.length}) — şema geride olabilir.`);
        }
    }
    notes.push(`${label}: okunamadı; kullanım verisi eksik sayılır.`);
    return { rows: [], complete: false };
}

/** Oturum ve mesajları bir kez yükler (FK'siz referanslar bellekte eşleştirilir). */
async function loadUsageRows(db: Db): Promise<UsageRows> {
    const notes: string[] = [];
    const s = await tryFind<SessionRow>('AiEvalSession', notes, [
        async () => (await db.aiEvalSession.findMany({ select: { id: true, sourceUnitIds: true, usedSourceUnitIds: true, suggestedSourceUnitIds: true, sourceSnapshot: true } })),
        async () => (await db.aiEvalSession.findMany({ select: { id: true } })).map((r) => ({ ...r, sourceUnitIds: [], usedSourceUnitIds: [], suggestedSourceUnitIds: [], sourceSnapshot: null })),
    ]);
    const m = await tryFind<MessageRow>('AiEvalMessage', notes, [
        async () => (await db.aiEvalMessage.findMany({ select: { id: true, sentSourceUnitIds: true, citedSourceRefs: true, runInputSnapshot: true } })),
        async () => (await db.aiEvalMessage.findMany({ select: { id: true } })).map((r) => ({ ...r, sentSourceUnitIds: [], citedSourceRefs: null, runInputSnapshot: null })),
    ]);
    return { sessions: s.rows, messages: m.rows, complete: s.complete && m.complete, notes };
}

async function computeRow(db: Db, s: SourceWithVersions, usage: UsageRows, replacementExists: boolean): Promise<PreviewRow> {
    const versionIds = s.versions.map((v) => v.id);
    const unitIds = (await db.sourceUnit.findMany({ where: { versionId: { in: versionIds } }, select: { id: true } })).map((u) => u.id);
    const unitSet = new Set(unitIds);
    const ids = { unitIds: unitSet, versionIds: new Set(versionIds), slug: s.slug };
    const [chunkCount, embeddedChunkCount, mappingCount, evalScenarioSourceCount, evalScenarioRefCount] = await Promise.all([
        db.sourceChunk.count({ where: { versionId: { in: versionIds } } }),
        db.sourceChunk.count({ where: { versionId: { in: versionIds }, NOT: { embedding: { isEmpty: true } } } }),
        db.sourceMapping.count({ where: { versionId: { in: versionIds } } }),
        db.evalScenarioSource.count({ where: { versionId: { in: versionIds } } }),
        unitIds.length ? db.evalScenarioRef.count({ where: { unitId: { in: unitIds } } }) : Promise.resolve(0),
    ]);
    const u = {
        sessionsSelected: usage.sessions.filter((x) => anyIdIn(x.sourceUnitIds, unitSet)).length,
        sessionsUsed: usage.sessions.filter((x) => anyIdIn(x.usedSourceUnitIds, unitSet)).length,
        sessionsSuggested: usage.sessions.filter((x) => anyIdIn(x.suggestedSourceUnitIds, unitSet)).length,
        sessionsSnapshot: usage.sessions.filter((x) => jsonReferencesSource(x.sourceSnapshot, ids)).length,
        messagesSent: usage.messages.filter((x) => anyIdIn(x.sentSourceUnitIds, unitSet)).length,
        messagesCited: usage.messages.filter((x) => jsonReferencesSource(x.citedSourceRefs, ids)).length,
        messagesRunSnapshot: usage.messages.filter((x) => jsonReferencesSource(x.runInputSnapshot, ids)).length,
    };
    const sessionIds = new Set(
        usage.sessions
            .filter((x) => anyIdIn(x.sourceUnitIds, unitSet) || anyIdIn(x.usedSourceUnitIds, unitSet) || anyIdIn(x.suggestedSourceUnitIds, unitSet) || jsonReferencesSource(x.sourceSnapshot, ids))
            .map((x) => x.id),
    );
    const messageIds = new Set(
        usage.messages
            .filter((x) => anyIdIn(x.sentSourceUnitIds, unitSet) || jsonReferencesSource(x.citedSourceRefs, ids) || jsonReferencesSource(x.runInputSnapshot, ids))
            .map((x) => x.id),
    );
    const facts: SourceFacts = {
        slug: s.slug,
        isSystemManaged: s.isSystemManaged,
        unitCount: unitIds.length,
        chunkCount,
        embeddedChunkCount,
        mappingCount,
        evalScenarioSourceCount,
        evalScenarioRefCount,
        aiEvalSessionCount: sessionIds.size,
        aiEvalMessageCount: messageIds.size,
        hasHistoricalSnapshots: u.sessionsSnapshot > 0 || u.messagesRunSnapshot > 0 || u.messagesCited > 0,
        replacementSourceExistsOrPlanned: replacementExists,
        usageDataIncomplete: !usage.complete,
    };
    const rec = recommendAction(facts);
    return {
        id: s.id,
        slug: s.slug,
        title: s.title,
        kind: s.kind,
        isSystemManaged: s.isSystemManaged,
        isActive: s.isActive,
        versions: s.versions.map((v) => ({ versionLabel: v.versionLabel, approvalStatus: v.approvalStatus })),
        rightRag: s.rightRag,
        facts,
        usage: u,
        recommendation: rec.action,
        reason: rec.reason,
    };
}

const SOURCE_INCLUDE = { versions: { select: { id: true, versionLabel: true, approvalStatus: true } } } as const;

async function main() {
    const guard = checkApplyAllowed({
        databaseUrl: process.env.DATABASE_URL,
        apply: APPLY,
        approvalFlagGiven: argv.includes(GRC_DB_APPROVAL_FLAG),
    });
    console.log(`Mod: ${APPLY ? 'APPLY (yalnız --ids ile listelenenler)' : 'ÖNİZLEME (salt-okunur)'} | Veritabanı: ${guard.dbName ?? '(bilinmiyor)'}`);
    if (!guard.ok) {
        console.error(`REDDEDİLDİ: ${guard.reason}`);
        process.exit(2);
    }
    if (APPLY && !IDS.length) {
        console.error('REDDEDİLDİ: --apply için --ids=<kaynak id veya slug,...> zorunlu; toplu uygulama yoktur.');
        process.exit(2);
    }

    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ...(APPLY ? {} : { options: READ_ONLY_PG_OPTIONS }),
    });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    try {
        const db = prisma as unknown as Db;
        const replacementExists =
            (await prisma.source.count({ where: { slug: TEBLIG_SOURCE_SLUG } })) > 0 || REPLACEMENT_PLANNED;
        const schemaNotes: string[] = [];
        let sources: SourceWithVersions[];
        try {
            sources = await prisma.source.findMany({ include: SOURCE_INCLUDE, orderBy: [{ createdAt: 'asc' }] });
        } catch (e) {
            if (!isMissingSchema(e)) throw e;
            // Şema geride (isSystemManaged/isActive/metadata kolonları yok): yalnız eski kolonlarla oku.
            schemaNotes.push('Source: yeni kolonlar (isSystemManaged/isActive/metadata) bulunamadı — şema geride (migrate deploy bekliyor). Bu kaynaklar sistem yönetimli değil / aktif varsayıldı.');
            const legacy = await prisma.source.findMany({
                select: {
                    id: true, kind: true, slug: true, title: true, publisher: true, officialUrl: true, docCode: true, language: true,
                    owner: true, confidentiality: true, tags: true, rightRefLink: true, rightFullText: true, rightRag: true, rightFineTune: true,
                    rightExport: true, rightsNote: true, rightsVerifiedById: true, rightsVerifiedAt: true, rightsBasis: true, isTestFixture: true,
                    createdById: true, reviewedById: true, createdAt: true, updatedAt: true, versions: { select: { id: true, versionLabel: true, approvalStatus: true } },
                },
                orderBy: [{ createdAt: 'asc' }],
            });
            sources = legacy.map((l) => ({ ...l, isSystemManaged: false, isActive: true, metadata: null }));
        }
        const usage = await loadUsageRows(db);
        schemaNotes.push(...usage.notes);
        const rows: PreviewRow[] = [];
        for (const s of sources) rows.push(await computeRow(db, s, usage, replacementExists));

        fs.writeFileSync(
            REPORT_PATH,
            JSON.stringify({ generatedAt: new Date().toISOString(), mode: APPLY ? 'APPLY' : 'PREVIEW', database: guard.dbName, sourceCount: rows.length, usageDataComplete: usage.complete, schemaNotes, sources: rows }, null, 2),
            'utf8',
        );

        for (const n of schemaNotes) console.log(`UYARI: ${n}`);
        console.log(`\n${rows.length} kaynak:`);
        for (const r of rows) {
            const f = r.facts;
            console.log(
                `- [${r.recommendation}] ${r.slug} (${r.kind}${r.isSystemManaged ? ', sistem' : ''}${r.isActive ? '' : ', PASİF'}) "${r.title.slice(0, 60)}" | sürüm: ${r.versions.map((v) => `${v.versionLabel}/${v.approvalStatus}`).join(', ') || '-'} | rag:${r.rightRag} | birim:${f.unitCount} parça:${f.chunkCount} (embed:${f.embeddedChunkCount}) eşleştirme:${f.mappingCount} senaryoKaynak:${f.evalScenarioSourceCount} senaryoRef:${f.evalScenarioRefCount} | değerlendirme oturumu:${f.aiEvalSessionCount} mesaj:${f.aiEvalMessageCount} snapshot:${f.hasHistoricalSnapshots ? 'var' : 'yok'}`,
            );
        }
        console.log(`\nRapor: ${REPORT_PATH}`);
        if (!APPLY) {
            console.log('Önizleme: veritabanına hiçbir şey yazılmadı (oturum salt-okunur).');
            return;
        }

        // ── APPLY: yalnız açıkça listelenen kimlikler ─────────────────────────────
        const email = process.env.CLEANUP_USER_EMAIL ?? process.env.IMPORT_USER_EMAIL;
        const actor = await prisma.user.findFirst({
            where: email ? { email } : { role: { name: 'SYSTEM_ADMIN' }, isActive: true },
            orderBy: { createdAt: 'asc' },
            select: { id: true, email: true },
        });
        if (!actor) {
            console.error('İPTAL: denetim izi için sistem kullanıcısı (SYSTEM_ADMIN) bulunamadı.');
            process.exit(3);
        }
        for (const ref of IDS) {
            const target = sources.find((s) => s.id === ref || s.slug === ref);
            if (!target) {
                console.log(`REDDEDİLDİ ${ref}: bu kimlik/slug ile kaynak bulunamadı.`);
                continue;
            }
            const row = rows.find((r) => r.id === target.id)!;
            if (!isApplicable(row.recommendation)) {
                console.log(`REDDEDİLDİ ${target.slug}: ${refusalReason(row.recommendation) ?? row.reason}`);
                continue;
            }
            try {
                if (row.recommendation === 'SILINEBILIR') {
                    await prisma.$transaction(
                        async (tx) => {
                            // Transaction İÇİNDE yeniden doğrulama
                            const fresh = await tx.source.findUnique({ where: { id: target.id }, include: SOURCE_INCLUDE });
                            if (!fresh) throw new Error('Kaynak artık yok.');
                            const again = await computeRow(tx, fresh, await loadUsageRows(tx), replacementExists);
                            if (again.recommendation !== 'SILINEBILIR') {
                                throw new Error(`Yeniden doğrulamada öneri ${again.recommendation} oldu (${again.reason}); silme iptal.`);
                            }
                            const snapshot = { id: fresh.id, slug: fresh.slug, title: fresh.title, kind: fresh.kind, versions: fresh.versions, facts: again.facts };
                            await tx.sourceVersion.deleteMany({ where: { sourceId: fresh.id } });
                            await tx.source.delete({ where: { id: fresh.id } });
                            await tx.auditLog.create({
                                data: {
                                    userId: actor.id,
                                    action: 'DELETE',
                                    entityType: 'Source',
                                    entityId: fresh.id,
                                    oldValue: snapshot as unknown as Prisma.InputJsonValue,
                                    newValue: Prisma.JsonNull,
                                },
                            });
                        },
                        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 },
                    );
                    console.log(`UYGULANDI ${target.slug}: fiziksel silindi (bağımlılık yok, transaction içinde doğrulandı).`);
                } else {
                    await prisma.$transaction(
                        async (tx) => {
                            const fresh = await tx.source.findUnique({ where: { id: target.id }, include: SOURCE_INCLUDE });
                            if (!fresh) throw new Error('Kaynak artık yok.');
                            const again = await computeRow(tx, fresh, await loadUsageRows(tx), replacementExists);
                            if (again.recommendation !== 'ARSIVLE') {
                                throw new Error(`Yeniden doğrulamada öneri ${again.recommendation} oldu; arşivleme iptal.`);
                            }
                            const before = { isActive: fresh.isActive, versions: fresh.versions.map((v) => ({ id: v.id, versionLabel: v.versionLabel, approvalStatus: v.approvalStatus })) };
                            await tx.source.update({ where: { id: fresh.id }, data: { isActive: false } });
                            await tx.sourceVersion.updateMany({
                                where: { sourceId: fresh.id, approvalStatus: { in: versionStatusesToWithdraw() as ('DRAFT' | 'IN_REVIEW')[] } },
                                data: { approvalStatus: 'WITHDRAWN' },
                            });
                            const after = await tx.sourceVersion.findMany({ where: { sourceId: fresh.id }, select: { id: true, versionLabel: true, approvalStatus: true } });
                            await tx.auditLog.create({
                                data: {
                                    userId: actor.id,
                                    action: 'UPDATE',
                                    entityType: 'Source',
                                    entityId: fresh.id,
                                    oldValue: { slug: fresh.slug, ...before },
                                    newValue: { slug: fresh.slug, isActive: false, versions: after, islem: 'ARSIVLE' },
                                },
                            });
                        },
                        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 },
                    );
                    console.log(`UYGULANDI ${target.slug}: arşivlendi (isActive=false; DRAFT/IN_REVIEW sürümler WITHDRAWN; birim/parça/snapshot korunur).`);
                }
            } catch (e) {
                console.log(`İPTAL ${target.slug}: ${(e as Error).message}`);
            }
        }
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
