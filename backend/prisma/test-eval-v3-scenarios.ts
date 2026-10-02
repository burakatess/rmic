/**
 * KONTROL & KANIT DEĞERLENDİRME v3 — GERÇEK MODELLE SENARYO TESTİ (izole DB, SENTETİK veri).
 *
 * Görev §14'teki dört örneği + yeniden değerlendirmeyi çalıştırır:
 *   A. Şifreleme doğrulanamıyor        → "açık metindir" denmemeli
 *   B. TCP/389 + Kerberos              → yalnız port numarasından uyumsuzluk üretilmemeli
 *   C. Eski yazılım sürümü             → yalnız yeni sürüm var diye bulgu üretilmemeli
 *   D. Log yönetimi                    → merkezi toplama ve düzenli inceleme AYRI değerlendirilmeli
 *   E. A'nın yeniden değerlendirmesi   → yeni açıklama/kanıt sonucu etkiliyor mu, önceki cevap tekrar mı ediliyor
 *
 * GERÇEK model çağrısı yapar (AI_ENABLED gerekli); yalnız SENTETİK metin gönderir. `grc_db`'ye KARŞI ÇALIŞMAZ.
 * Otomatik kontroller yalnız KURAL ihlallerini yakalar; içerik kalitesini insan değerlendirmelidir.
 *
 * Kullanım (izole DB'de, kaynaklar import-system-sources.ts --apply ile alınmış olmalı):
 *   DATABASE_URL=postgresql://.../grc_sys_src_verify npx ts-node prisma/test-eval-v3-scenarios.ts
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-explicit-any -- tanı script'i */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { AiEvalService } from '../src/modules/ai/ai-eval.service';
import { loadAiConfig } from '../src/modules/ai/ai.constants';
import { BANNED_PHRASES } from '../src/modules/ai/eval-v3/eval-v3.constants';

const dbName = (process.env.DATABASE_URL || '').split('/').pop()?.split('?')[0];
if (!dbName || dbName === 'grc_db') {
    console.error('Bu script gerçek `grc_db` veritabanına KARŞI çalıştırılamaz. İzole bir DB kullanın.');
    process.exit(1);
}

interface Scenario {
    key: string;
    label: string;
    controlText: string;
    evidenceText: string;
    /** Otomatik kural kontrolleri — ihlal listesi döner. */
    check: (o: any) => string[];
}

const text = (o: any) => `${o?.controlResult?.text ?? ''} ${o?.finding?.explanation ?? ''} ${o?.impact ?? ''}`;

const SCENARIOS: Scenario[] = [
    {
        key: 'A', label: 'Şifreleme doğrulanamıyor',
        controlText: 'Kurum ağında iletilen verinin gizliliği için şifreli iletişim protokolleri kullanılır ve yapılandırması belgelenir.',
        evidenceText:
            'Yönetim beyanı: "Ağ iletişimimiz şifreli yapılmaktadır."\n' +
            'Sunulan tek kayıt: sunucu üzerinde alınan ağ trafiği örneğinin (pcap) 4 satırlık özeti — protokol alanı boş bırakılmıştır, TLS/şifreleme bilgisi çıkarılamamıştır.',
        check: (o) => [
            ...(/a[çc][ıi]k metindir/i.test(text(o)) ? ['"açık metindir" ifadesi kullanıldı (kanıt şifrelemenin yokluğunu KESİN göstermiyor)'] : []),
            ...(o.finding?.exists ? ['Kanıt yetersizken bulgu üretildi'] : []),
        ],
    },
    {
        key: 'B', label: 'TCP/389 + Kerberos (LDAP signing/sealing)',
        controlText: 'Dizin servisi (Active Directory) ile yapılan kimlik doğrulama ve sorgulama bağlantıları güvenli kanal üzerinden yapılır.',
        evidenceText:
            'Ağ trafiği özeti: istemci → DC bağlantıları TCP/389 üzerinde görülmektedir.\n' +
            'GPO çıktısı: "Domain controller: LDAP server signing requirements = Require signing"; "Network security: LDAP client signing requirements = Negotiate signing/Require signing"; ' +
            'kimlik doğrulama Kerberos (GSS-API) ile yapılmaktadır, SASL sealing etkin.',
        check: (o) => [
            ...(o.controlResult?.status === 'NON_COMPLIANT' && /389/.test(text(o)) && !/sign|seal|gss|kerberos/i.test(text(o))
                ? ['Yalnız port numarasına dayanarak uyumsuzluk üretildi'] : []),
            ...(!/sign|seal|gss|kerberos/i.test(text(o)) ? ['LDAP signing/sealing veya GSS-API/Kerberos bilgisi değerlendirilmedi'] : []),
        ],
    },
    {
        key: 'C', label: 'Eski yazılım sürümü',
        controlText: 'Sunucularda kullanılan yazılımlar için güvenlik güncellemeleri belirlenen sürelerde uygulanır ve yaşam döngüsü sonu yazılımlar izlenir.',
        evidenceText:
            'Envanter kaydı: Web sunucusu Apache HTTP Server 2.4.41 kurulu. Üretici sitesinde daha yeni sürüm (2.4.62) yayımlanmıştır.\n' +
            'Kurulu sürümün güvenlik yamalarının uygulanıp uygulanmadığı, üretici desteğinin sürüp sürmediği veya kurum yama politikası ile ilişkisine dair bir kayıt sunulmamıştır.',
        check: (o) => [
            ...(o.finding?.exists && !/g[üu]venlik g[üu]ncelle|yama|ya[şs]am d[öo]ng|destek/i.test(o.finding?.explanation ?? '')
                ? ['Yalnız yeni sürüm bulunduğu için bulgu üretildi'] : []),
        ],
    },
    {
        key: 'D', label: 'Log yönetimi',
        controlText: 'Sistem ve uygulama iz kayıtları merkezi bir kayıt yönetim sisteminde toplanır ve düzenli aralıklarla incelenir.',
        evidenceText:
            'Uygulama sunucusundaki log dizininin ekran görüntüsü: kayıtlar yerel disk üzerinde tutulmaktadır; merkezi log sistemine (SIEM) gönderim yapılandırması sunulmamıştır.\n' +
            'Haftalık log inceleme tutanağı (son 4 hafta) imzalı olarak sunulmuştur; tutanakta hangi kaynakların incelendiği belirtilmemiştir.',
        check: (o) => [
            ...(!/merkezi/i.test(text(o)) ? ['Merkezi toplama ayrıca değerlendirilmedi'] : []),
            ...(!/inceleme|tutanak/i.test(text(o)) ? ['Düzenli inceleme ayrıca değerlendirilmedi'] : []),
        ],
    },
];

async function main() {
    const aiOn = loadAiConfig().enabled;
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const prisma = app.get(PrismaService);
    const svc = app.get(AiEvalService);
    const user = await prisma.user.findFirst({ where: { role: { name: 'SYSTEM_ADMIN' } } });
    if (!user) throw new Error('SYSTEM_ADMIN kullanıcı yok.');

    const pool = await prisma.sourceUnit.count({
        where: { version: { approvalStatus: 'APPROVED', source: { isSystemManaged: true, isActive: true } } },
    });
    console.log(`DB: ${dbName} · taranabilir onaylı sistem birimi: ${pool} · AI: ${aiOn ? 'AÇIK' : 'KAPALI'}\n`);
    if (!aiOn) {
        console.log('AI kapalı: yalnız veri akışı doğrulandı; ÇIKTI KALİTESİ DOĞRULANMADI.');
        await app.close();
        return;
    }

    const report: any[] = [];
    const runOne = async (s: Scenario, extraNote?: string, sid?: string) => {
        const session = sid
            ? await svc.getSession(sid, user.id)
            : await svc.createSession({ controlText: s.controlText, evidenceText: s.evidenceText, period: 'Haziran 2026' } as any, user.id);
        const t0 = Date.now();
        const res: any = await svc.runEvaluation(
            session.id,
            { controlText: s.controlText, evidenceText: s.evidenceText, contentVersion: session.contentVersion, additionalNote: extraNote ?? null } as any,
            '', user.id,
        ).catch((e: Error) => ({ __error: e.message }));
        const ms = Date.now() - t0;
        if (res.__error) return { sessionId: session.id, error: res.__error, ms };
        const le = res.latestEvaluation;
        const o = le.effective;
        const violations = [
            ...s.check(o),
            ...BANNED_PHRASES.filter((b) => b.pattern.test(text(o))).map((b) => `Kaçınılması gereken ifade: "${b.label}"`),
        ];
        const sent = new Set<string>(le.sentSourceUnitIds ?? []);
        const foreign = (o.references ?? []).filter((r: any) => !sent.has(r.sourceUnitId)).map((r: any) => r.articleNumber);
        if (foreign.length) violations.push(`Gönderilmeyen birime atıf: ${foreign.join(', ')}`);
        return {
            sessionId: session.id, ms, status: o.controlResult?.status, controlResultText: o.controlResult?.text,
            finding: o.finding, references: (o.references ?? []).map((r: any) => `${r.articleNumber} [${r.assessment}] p.${r.page ?? '-'} skor=${r.retrievalScore}`),
            rejectedReferences: o.rejectedReferences, additionalEvidenceRequired: o.additionalEvidenceRequired,
            reEvaluation: o.reEvaluation, retrieval: { method: le.retrievalNote?.method, sent: le.retrievalNote?.sentUnitIds?.length, top: (le.retrievalNote?.candidates ?? []).slice(0, 5).map((c: any) => `${c.unitCode}:${c.fused}`) },
            needsReview: res.needsReview, needsReviewReason: res.needsReviewReason, violations,
        };
    };

    let sessionA: string | undefined;
    for (const s of SCENARIOS) {
        console.log(`── ${s.key}. ${s.label}`);
        const r: any = await runOne(s);
        if (s.key === 'A') sessionA = r.sessionId;
        console.log(JSON.stringify(r, null, 2), '\n');
        report.push({ scenario: s.key, label: s.label, ...r });
    }
    if (sessionA) {
        console.log('── E. A senaryosunun YENİDEN değerlendirmesi (yeni açıklama + yeni kanıt)');
        const A = SCENARIOS[0];
        const reEv: Scenario = { ...A, evidenceText: `${A.evidenceText}\nYENİ KANIT: Sunucu TLS yapılandırma çıktısı — "ssl_protocols TLSv1.2 TLSv1.3; ssl_ciphers HIGH:!aNULL:!MD5" ve sertifika zinciri doğrulama çıktısı (Verify return code: 0 (ok)) ekte sunulmuştur.` };
        const r: any = await runOne(reEv, 'Yönetim açıklaması: Ağ trafiği örneği alınırken protokol alanı yanlış maskelenmiş; ilgili sunucuların TLS yapılandırma çıktısı ve sertifika doğrulaması ek kanıt olarak eklenmiştir.', sessionA);
        console.log(JSON.stringify(r, null, 2), '\n');
        const first = report.find((x) => x.scenario === 'A');
        r.differsFromFirst = first?.controlResultText !== r.controlResultText || first?.status !== r.status;
        report.push({ scenario: 'E', label: 'A yeniden değerlendirme', ...r });
    }

    const total = report.reduce((n, r) => n + (r.violations?.length ?? 0), 0);
    console.log(`Otomatik kural ihlali toplamı: ${total} (İÇERİK KALİTESİ ayrıca insan tarafından okunmalıdır.)`);
    fs.writeFileSync(path.join(__dirname, 'test-eval-v3-scenarios-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), db: dbName, report }, null, 2));
    await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
