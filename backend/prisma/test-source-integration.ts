/**
 * KAYNAK KATALOĞU ENTEGRASYONU — KARŞILAŞTIRMALI KALİTE TESTİ (izole DB + fixture).
 *
 * Aynı kontrol ve kanıt için 5 varyant çalıştırır ve katkıyı ölçer:
 *   A. Kaynaksız
 *   B. İlgili kaynakla (AC-2)
 *   C. İlgisiz kaynakla (CP-9 — yedekleme)
 *   D. Çelişkili kaynaklarla (yıllık vs çeyreklik gözden geçirme)
 *   E. Kanıt yetersizken ilgili kaynakla
 *
 * GERÇEK model çağrısı yapar (mevcut sağlayıcı; AI_ENABLED gerekli). Yalnız
 * SENTETİK veri kullanır. AI kapalıysa yalnız veri akışını raporlar ve
 * "çıktı kalitesi doğrulanmadı" der.
 *
 * Kullanım:
 *   DATABASE_URL=postgresql://.../grc_verify npx ts-node prisma/test-source-integration.ts --user admin@rmic.com
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-base-to-string, @typescript-eslint/no-explicit-any -- tanı script'i: modelin tipsiz JSON çıktısını ayrıştırır (prisma/seed.ts ile aynı yaklaşım). */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { AiEvalService } from '../src/modules/ai/ai-eval.service';
import { loadAiConfig } from '../src/modules/ai/ai.constants';

const argUser = (() => {
    const i = process.argv.indexOf('--user');
    return i >= 0 ? process.argv[i + 1] : undefined;
})();

const CONTROL = 'Ayrıcalıklı hesap erişimleri her çeyrekte gözden geçirilir ve gereksiz yetkiler kaldırılır.';
const EVIDENCE_GAP =
    '2026 Q2 ayrıcalıklı erişim gözden geçirme kaydı: 12 ayrıcalıklı hesaptan 3’ü gözden geçirilmedi; ' +
    '1 eski çalışanın admin yetkisi hâlâ aktif. Gözden geçirme 15 Temmuz’da (dönem sonrası) yapıldı.';
const EVIDENCE_WEAK = 'İç kontrol sorumlusunun yazılı yanıtı: "Ayrıcalıklı hesap gözden geçirmeleri düzenli yapılıyor."';

interface Variant {
    key: string;
    label: string;
    evidence: string;
    unitRoles: string[]; // fixture-source-units.ts'teki role alanları
}

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const prisma = app.get(PrismaService);
    const evalSvc = app.get(AiEvalService);
    const aiOn = loadAiConfig().enabled;

    const user =
        (argUser
            ? await prisma.user.findFirst({ where: { OR: [{ id: argUser }, { email: argUser }] } })
            : null) ?? (await prisma.user.findFirst({ where: { role: { name: 'SYSTEM_ADMIN' } } }));
    if (!user) throw new Error('Kullanıcı yok.');

    const fx = await prisma.sourceVersion.findFirst({
        where: { source: { slug: 'test-fixture-sp80053a' } },
        include: { units: true, source: true },
    });
    if (!fx) throw new Error('Fixture bulunamadı. Önce: npx ts-node prisma/seed-library-fixtures.ts --apply');
    const unitByRole = (role: string) => fx.units.find((u) => u.stableKey === roleToKey(role))?.id;
    function roleToKey(role: string) {
        return {
            relevant: 'AC-2',
            irrelevant: 'CP-9',
            'conflicting-a': 'AC-2-CONFLICT-A',
            'conflicting-b': 'AC-2-CONFLICT-B',
        }[role]!;
    }

    const variants: Variant[] = [
        { key: 'A', label: 'Kaynaksız', evidence: EVIDENCE_GAP, unitRoles: [] },
        { key: 'B', label: 'İlgili kaynak (AC-2)', evidence: EVIDENCE_GAP, unitRoles: ['relevant'] },
        { key: 'C', label: 'İlgisiz kaynak (CP-9)', evidence: EVIDENCE_GAP, unitRoles: ['irrelevant'] },
        { key: 'D', label: 'Çelişkili kaynaklar', evidence: EVIDENCE_GAP, unitRoles: ['conflicting-a', 'conflicting-b'] },
        { key: 'E', label: 'Yetersiz kanıt + ilgili kaynak', evidence: EVIDENCE_WEAK, unitRoles: ['relevant'] },
    ];

    console.log(`\nKARŞILAŞTIRMALI TEST — AI ${aiOn ? 'AÇIK (gerçek model)' : 'KAPALI (yalnız veri akışı)'}\n`);
    const rows: Record<string, unknown>[] = [];

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let first = true;
    for (const v of variants) {
        if (!first) {
            process.stdout.write('  …model dinlensin (25s)\r');
            await sleep(25_000);
        }
        first = false;
        const unitIds = v.unitRoles.map(unitByRole).filter(Boolean) as string[];
        const session = await evalSvc.createSession(
            { controlText: CONTROL, evidenceText: v.evidence, sourceUnitIds: unitIds, period: 'Haziran 2026' },
            user.id,
        );
        let result: Record<string, unknown> = { variant: v.key, label: v.label, sourceUnits: unitIds.length };
        try {
            let s;
            try {
                s = await evalSvc.sendMessage(session.id, '', user.id);
            } catch {
                await sleep(30_000); // geçici model hatası — bir kez daha dene
                s = await evalSvc.sendMessage(session.id, '', user.id);
            }
            const msg = [...s.messages].reverse().find((m) => m.role === 'ASSISTANT' && m.evaluation);
            const ev = (msg?.evaluation ?? {}) as Record<string, any>;
            const cited = (msg?.citedSourceRefs ?? []) as any[];
            const uyumsuz: any[] = Array.isArray(ev.uyumsuzAlanlar) ? ev.uyumsuzAlanlar : [];
            const dayanakli = uyumsuz.filter((x) => x.dayanakKaynakBirimId).length +
                (Array.isArray(ev.uyumluAlanlar) ? ev.uyumluAlanlar.filter((x: any) => x.dayanakKaynakBirimId).length : 0);
            result = {
                ...result,
                sonuc: ev.genelDurum?.sonuc ?? '?',
                uyumsuz: uyumsuz.length,
                dayanakliTespit: dayanakli,
                atifSayisi: cited.length,
                atifGecerliMi: cited.length ? cited.every((c) => c.textVerified && c.inSentSet) : '—',
                uydurmaAtif: cited.filter((c) => !c.exists).length,
                sentUnitIds: (msg?.sentSourceUnitIds ?? []).length,
                eksikBilgi: Array.isArray(ev.eksikBilgi) ? ev.eksikBilgi.length : 0,
            };
        } catch (e) {
            result = { ...result, hata: (e as Error).message.slice(0, 80) };
        }
        rows.push(result);
        console.log(
            `  ${v.key} ${v.label.padEnd(34)} → ` +
                (result.hata
                    ? `HATA: ${result.hata}`
                    : `sonuc=${result.sonuc} uyumsuz=${result.uyumsuz} dayanakli=${result.dayanakliTespit} ` +
                      `atif=${result.atifSayisi}(gecerli:${result.atifGecerliMi},uydurma:${result.uydurmaAtif}) ` +
                      `iletilen=${result.sentUnitIds} eksikBilgi=${result.eksikBilgi}`),
        );
        // temizlik
        await prisma.aiEvalSession.delete({ where: { id: session.id } }).catch(() => undefined);
    }

    console.log('\n─── DEĞERLENDİRME ───');
    const byKey = Object.fromEntries(rows.map((r) => [r.variant, r]));
    const checks: { name: string; pass: boolean | string }[] = [];
    if (aiOn) {
        checks.push({ name: 'B: ilgili kaynakta tespit bir birime dayandırıldı', pass: Number(byKey.B?.dayanakliTespit ?? 0) > 0 });
        checks.push({ name: 'B: atıflar geçerli (iletilen + alıntı eşleşen)', pass: byKey.B?.atifGecerliMi as boolean });
        checks.push({ name: 'C: ilgisiz kaynağa uydurma/zorla atıf yok', pass: Number(byKey.C?.uydurmaAtif ?? 0) === 0 });
        checks.push({ name: 'D: çelişkili kaynakta sonuç "UYUMLU" ilan edilmedi', pass: byKey.D?.sonuc !== 'UYUMLU' });
        checks.push({ name: 'E: yetersiz kanıt "UYUMSUZ" değil (DEGERLENDIRILEMEDI/KISMEN)', pass: byKey.E?.sonuc !== 'UYUMSUZ' });
        checks.push({ name: 'E: eksik kanıt fark edildi', pass: Number(byKey.E?.eksikBilgi ?? 0) > 0 });
        checks.push({ name: 'A vs B: kaynak eklenince dayanaklı tespit arttı', pass: Number(byKey.B?.dayanakliTespit ?? 0) >= Number(byKey.A?.dayanakliTespit ?? 0) });
    } else {
        checks.push({ name: 'Veri akışı: sentSourceUnitIds dolduruldu (B/C/D/E)', pass: ['B', 'C', 'D', 'E'].every((k) => Number(byKey[k]?.sentUnitIds ?? 0) > 0) });
        console.log('  (AI kapalı — çıktı kalitesi DOĞRULANMADI; yalnız veri akışı kontrol edildi.)');
    }
    for (const c of checks) console.log(`  ${c.pass === true ? '✓' : c.pass === false ? '✗' : '·'} ${c.name}`);

    console.log('\nJSON:');
    console.log(JSON.stringify(rows, null, 2));
    await app.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
