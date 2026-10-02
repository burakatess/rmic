/**
 * Eski (kontrol seviyesi) atamalardan bir hedef yıl için ÖNERİ taslak satırı
 * üretir — plan "Geçiş ve Eski Veriler" (madde 18/R): "Eski kontrol
 * atamasından önerildi — doğrulama bekliyor" etiketiyle, KESİN atama olarak
 * DEĞİL, doğrudan `AnnualPlanDraftItem`'a yazılır — yeni bir "öneri" şeması
 * icat edilmez, taslak mekanizmasının kendisi staging alanı olarak kullanılır.
 * Kullanıcı normal taslak inceleme/kaydet/vazgeç akışıyla onaylar; hiçbir
 * gerçek `ControlYearScope`/`ControlTest` bu script tarafından değiştirilmez.
 *
 * Kapsam: yalnızca hedef yılda zaten ACTIVE bir `ControlYearScope`'u olan VE
 * o scope'un assigneeId/secondControllerId'si HENÜZ boş olan kontroller
 * işlenir (kapsamı olmayan bir kontrole atama önermenin operasyonel anlamı
 * yok). Zaten bir taslak satırı varsa ve o satırın atama alanları doluysa
 * (kullanıcı kendi kararını vermiş demektir) DOKUNULMAZ.
 *
 * Kaynak (eski model): Atanan Kontrolcü önerisi → Control.ownerId (reform
 * öncesi bu alan "atanan kontrolcü" rolündeydi — bkz. plan D5).
 * İkinci Kontrolcü önerisi → Control.secondControllerId ?? Control.reviewerId
 * (plan D9: iki farklı kayıt yolu aynı UI alanına farklı DB sütunu yazmıştı —
 * ikisi de kontrol edilir, secondControllerId önceliklidir).
 * Önerilen kullanıcı PASİF ise veya aynı kişi iki alana düşüyorsa o alan
 * ATLANIR (sessizce yanlış/geçersiz bir öneri yazılmaz).
 *
 * Kullanım:
 *   npx ts-node prisma/migrate-year-assignment-suggestions.ts --year=2026            # dry-run
 *   npx ts-node prisma/migrate-year-assignment-suggestions.ts --year=2026 --apply    # taslağa yaz
 *
 * ÖNEMLİ: Bu script bu çalışma kapsamında ÜRETİM DB'sine (grc_db) karşı
 * --apply ile ÇALIŞTIRILMAMIŞTIR — yalnızca izole test DB'de doğrulanmıştır.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const REASON = 'Eski kontrol atamasından önerildi — doğrulama bekliyor';

interface SuggestionEntry {
    controlId: string;
    controlCode: string;
    year: number;
    suggestedAssigneeId: string | null;
    suggestedSecondControllerId: string | null;
    skippedFields: string[];
}

async function main() {
    const APPLY = process.argv.includes('--apply');
    const yearArg = process.argv.find(a => a.startsWith('--year='));
    if (!yearArg) { console.error('Kullanım: --year=YYYY [--apply]'); process.exit(1); }
    const year = Number(yearArg.split('=')[1]);
    console.log(`Mod: ${APPLY ? 'APPLY' : 'DRY-RUN'} — hedef yıl: ${year}\n`);

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    const suggestions: SuggestionEntry[] = [];
    let scopesConsidered = 0;
    let alreadyHasDraftAssignment = 0;
    let noLegacyDataToSuggest = 0;

    try {
        const scopes = await prisma.controlYearScope.findMany({
            where: { year, status: 'ACTIVE', assigneeId: null, secondControllerId: null },
            include: { control: { select: { id: true, controlId: true, ownerId: true, secondControllerId: true, reviewerId: true } } },
        });
        scopesConsidered = scopes.length;

        let draft = APPLY ? await prisma.annualPlanDraft.findUnique({ where: { year } }) : null;

        for (const scope of scopes) {
            const existingItem = await prisma.annualPlanDraftItem.findFirst({
                where: { draftId: draft?.id ?? '__none__', controlId: scope.control.id },
            });
            if (existingItem && (existingItem.assigneeId || existingItem.secondControllerId)) {
                alreadyHasDraftAssignment++;
                continue;
            }

            const skippedFields: string[] = [];
            const legacyAssigneeId = scope.control.ownerId || null;
            const legacySecondControllerId = scope.control.secondControllerId || scope.control.reviewerId || null;

            let suggestedAssigneeId: string | null = null;
            let suggestedSecondControllerId: string | null = null;

            if (legacyAssigneeId) {
                const u = await prisma.user.findUnique({ where: { id: legacyAssigneeId }, select: { isActive: true } });
                if (u?.isActive) suggestedAssigneeId = legacyAssigneeId;
                else skippedFields.push('assignee (pasif/geçersiz kullanıcı)');
            }
            if (legacySecondControllerId) {
                if (legacySecondControllerId === suggestedAssigneeId) {
                    skippedFields.push('secondController (assignee ile aynı kişi)');
                } else {
                    const u = await prisma.user.findUnique({ where: { id: legacySecondControllerId }, select: { isActive: true } });
                    if (u?.isActive) suggestedSecondControllerId = legacySecondControllerId;
                    else skippedFields.push('secondController (pasif/geçersiz kullanıcı)');
                }
            }

            if (!suggestedAssigneeId && !suggestedSecondControllerId) {
                noLegacyDataToSuggest++;
                continue;
            }

            suggestions.push({
                controlId: scope.control.id, controlCode: scope.control.controlId, year,
                suggestedAssigneeId, suggestedSecondControllerId, skippedFields,
            });

            if (APPLY) {
                if (!draft) {
                    draft = await prisma.annualPlanDraft.upsert({
                        where: { year },
                        create: { year, updatedById: scope.addedById },
                        update: {},
                    });
                }
                await prisma.annualPlanDraftItem.upsert({
                    where: { draftId_controlId: { draftId: draft.id, controlId: scope.control.id } },
                    create: {
                        draftId: draft.id, controlId: scope.control.id, inScope: true,
                        frequency: scope.frequency, referenceMonth: scope.referenceMonth, selectedMonths: scope.selectedMonths,
                        controlDate: scope.controlDate,
                        assigneeId: suggestedAssigneeId, secondControllerId: suggestedSecondControllerId,
                        reason: REASON,
                    },
                    update: {
                        assigneeId: suggestedAssigneeId, secondControllerId: suggestedSecondControllerId, reason: REASON,
                    },
                });
            }
        }

        console.log(`(Yıl=${year}) Atama eksik, aktif kapsam sayısı: ${scopesConsidered}`);
        console.log(`Zaten taslakta bir atama kararı var (dokunulmadı): ${alreadyHasDraftAssignment}`);
        console.log(`Önerilecek eski atama verisi yok: ${noLegacyDataToSuggest}`);
        console.log(`Öneri üretilen: ${suggestions.length}`);

        const reportPath = path.join(__dirname, `year-assignment-suggestions-report-${year}.json`);
        fs.writeFileSync(reportPath, JSON.stringify({
            generatedAt: new Date().toISOString(), mode: APPLY ? 'APPLY' : 'DRY-RUN', year,
            summary: { scopesConsidered, alreadyHasDraftAssignment, noLegacyDataToSuggest, suggested: suggestions.length },
            suggestions,
        }, null, 2));
        console.log(`Rapor yazıldı: ${reportPath}`);

        if (!APPLY) console.log('\n--apply verilmedi, DB değişmedi. Öneriler yalnızca --apply ile taslağa (AnnualPlanDraftItem) yazılır; gerçek ControlYearScope/ControlTest ASLA değişmez.');
        else console.log('\nÖneriler taslağa yazıldı. Kullanıcı Yıllık Plan → Kontrolcü Atamaları sekmesinden inceleyip onaylamalı/değiştirmeli/reddetmelidir.');
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
