import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function randOf<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function futureDate(days: number): Date { const d = new Date(); d.setDate(d.getDate() + days); return d; }
function pastDate(days: number): Date { const d = new Date(); d.setDate(d.getDate() - days); return d; }

/** Ayın son iş gününü döner (Cmt→Cuma, Paz→Cuma) */
function getLastBusinessDay(year: number, month: number): Date {
    // month: 0-indexed (0=Ocak)
    const lastDay = new Date(year, month + 1, 0); // Ayın son günü
    const dow = lastDay.getDay();
    if (dow === 0) lastDay.setDate(lastDay.getDate() - 2); // Pazar → Cuma
    else if (dow === 6) lastDay.setDate(lastDay.getDate() - 1); // Cumartesi → Cuma
    return lastDay;
}

/** Yılın tüm Cuma tarihlerini döner */
function getFridaysInYear(year: number): Date[] {
    const fridays: Date[] = [];
    const d = new Date(year, 0, 1);
    // İlk Cuma'yı bul
    while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
    while (d.getFullYear() === year) {
        fridays.push(new Date(d));
        d.setDate(d.getDate() + 7);
    }
    return fridays;
}

const turkishMonthIndex: Record<string, number> = {
    'Ocak': 0, 'Şubat': 1, 'Mart': 2, 'Nisan': 3, 'Mayıs': 4, 'Haziran': 5,
    'Temmuz': 6, 'Ağustos': 7, 'Eylül': 8, 'Ekim': 9, 'Kasım': 10, 'Aralık': 11,
};

async function main() {
    console.log('🌱 Kapsamlı seed başlıyor...');

    // ── 1. Temizlik ──────────────────────────────────────────────────────────
    console.log('🧹 Temizleniyor...');
    await prisma.findingStatusHistory.deleteMany({});
    await prisma.findingStatusLog.deleteMany({});
    await prisma.followUpAttachment.deleteMany({});
    await prisma.actionAttachment.deleteMany({});
    await prisma.findingAttachment.deleteMany({});
    await prisma.attachment.deleteMany({});
    await prisma.findingFollowUp.deleteMany({});
    await prisma.action.deleteMany({});
    await prisma.finding.deleteMany({});
    await prisma.controlTest.deleteMany({});
    await prisma.controlRiskMapping.deleteMany({});
    await prisma.control.deleteMany({});
    await prisma.controlRegulation.deleteMany({});
    await prisma.riskRegulation.deleteMany({});
    await prisma.regulationArticle.deleteMany({});
    await prisma.regulation.deleteMany({});
    await prisma.riskAssessment.deleteMany({});
    await prisma.riskHistory.deleteMany({});
    await prisma.riskActionRisk.deleteMany({});
    await prisma.riskAction.deleteMany({});
    await prisma.riskControlRisk.deleteMany({});
    await prisma.riskControl.deleteMany({});
    await prisma.risk.deleteMany({});
    await prisma.riskCategory.deleteMany({});
    await prisma.riskEntryRMControl.deleteMany({});
    await prisma.riskManagementControl.deleteMany({});
    await prisma.riskEntry.deleteMany({});
    await prisma.processRisk.deleteMany({});
    await prisma.systemRisk.deleteMany({});
    await prisma.process.deleteMany({});
    await prisma.system.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
    await prisma.directorate.deleteMany({});
    await prisma.systemOption.deleteMany({});
    await prisma.parameter.deleteMany({});
    await prisma.auditExecution.deleteMany({});
    await prisma.auditPlan.deleteMany({});
    console.log('✅ Temizlik tamamlandı');

    // ── 2. Roller ────────────────────────────────────────────────────────────
    const [adminRole, managerRole, auditorRole, analystRole, viewerRole] = await Promise.all([
        prisma.role.create({ data: { name: 'SYSTEM_ADMIN',         permissions: ['*'] } }),
        prisma.role.create({ data: { name: 'RISK_CONTROL_MANAGER', permissions: ['finding:view','finding:create','finding:update','action:*','control:*'] } }),
        prisma.role.create({ data: { name: 'AUDITOR',              permissions: ['finding:view','finding:create','action:view','action:create','control:view','control:test'] } }),
        prisma.role.create({ data: { name: 'RISK_ANALYST',         permissions: ['finding:view','control:view'] } }),
        prisma.role.create({ data: { name: 'VIEWER',               permissions: ['finding:view','control:view','action:view'] } }),
    ]);
    console.log('✅ 5 rol');

    // ── 3. Direktörlükler ────────────────────────────────────────────────────
    const [dirBTAg, dirBG, dirUG, dirAO, dirISY] = await Promise.all([
        prisma.directorate.create({ data: { name: 'BT Ağ Yönetimi',       code: 'BT-AG', gmy: 'GMY-1' } }),
        prisma.directorate.create({ data: { name: 'Bilgi Güvenliği',       code: 'BG',    gmy: 'GMY-1' } }),
        prisma.directorate.create({ data: { name: 'Uygulama Geliştirme',   code: 'UG',    gmy: 'GMY-2' } }),
        prisma.directorate.create({ data: { name: 'Altyapı Operasyonları', code: 'AO',    gmy: 'GMY-2' } }),
        prisma.directorate.create({ data: { name: 'İş Süreçleri Yönetimi', code: 'ISY',   gmy: 'GMY-3' } }),
    ]);
    const directorates = [dirBTAg, dirBG, dirUG, dirAO, dirISY];
    console.log('✅ 5 direktörlük');

    // ── 4. Kullanıcılar ──────────────────────────────────────────────────────
    const pw = await bcrypt.hash('Test1234!', 10);
    const [uAdmin, uBurak, uMgr1, uMgr2, uAud1, uAud2, uAud3, uAna1, uAna2, uBirim] = await Promise.all([
        prisma.user.create({ data: { email: 'admin@rmic.com',   passwordHash: pw, firstName: 'Sistem', lastName: 'Admin',   department: 'Sistem Yönetimi', roleId: adminRole.id,   isActive: true } }),
        prisma.user.create({ data: { email: 'burak@rmic.com',   passwordHash: pw, firstName: 'Burak',  lastName: 'Ateş',    department: 'İç Kontrol',      roleId: adminRole.id,   isActive: true } }),
        prisma.user.create({ data: { email: 'mgr1@rmic.com',    passwordHash: pw, firstName: 'Ahmet',  lastName: 'Yılmaz',  department: 'İç Kontrol',      roleId: managerRole.id, isActive: true } }),
        prisma.user.create({ data: { email: 'mgr2@rmic.com',    passwordHash: pw, firstName: 'Fatma',  lastName: 'Kaya',    department: 'İç Kontrol',      roleId: managerRole.id, isActive: true } }),
        prisma.user.create({ data: { email: 'aud1@rmic.com',    passwordHash: pw, firstName: 'Mehmet', lastName: 'Demir',   department: 'İç Kontrol',      roleId: auditorRole.id, isActive: true } }),
        prisma.user.create({ data: { email: 'aud2@rmic.com',    passwordHash: pw, firstName: 'Zeynep', lastName: 'Çelik',   department: 'İç Kontrol',      roleId: auditorRole.id, isActive: true } }),
        prisma.user.create({ data: { email: 'aud3@rmic.com',    passwordHash: pw, firstName: 'Ali',    lastName: 'Öztürk',  department: 'İç Kontrol',      roleId: auditorRole.id, isActive: true } }),
        prisma.user.create({ data: { email: 'ana1@rmic.com',    passwordHash: pw, firstName: 'Ayşe',   lastName: 'Şahin',   department: 'Risk Yönetimi',   roleId: analystRole.id, isActive: true } }),
        prisma.user.create({ data: { email: 'ana2@rmic.com',    passwordHash: pw, firstName: 'Emre',   lastName: 'Arslan',  department: 'Risk Yönetimi',   roleId: analystRole.id, isActive: true } }),
        prisma.user.create({ data: { email: 'birim@rmic.com',   passwordHash: pw, firstName: 'Selin',  lastName: 'Doğan',   department: 'BT Ağ Yönetimi', roleId: viewerRole.id,  isActive: true } }),
    ]);
    const auditors = [uAud1, uAud2, uAud3];
    const managers = [uMgr1, uMgr2];
    console.log('✅ 10 kullanıcı');

    // ── 5. Riskler ───────────────────────────────────────────────────────────
    const [catOps, catBT, catUyum, catGuv] = await Promise.all([
        prisma.riskCategory.create({ data: { name: 'Operasyonel Risk', color: '#EF4444' } }),
        prisma.riskCategory.create({ data: { name: 'BT Riski',         color: '#8B5CF6' } }),
        prisma.riskCategory.create({ data: { name: 'Uyum Riski',       color: '#F59E0B' } }),
        prisma.riskCategory.create({ data: { name: 'Güvenlik Riski',   color: '#EC4899' } }),
    ]);

    const riskDefs = [
        { id: 'R-2026-0001', name: 'Yetkisiz Ağ Erişimi',       cat: catBT.id,   p: 3, i: 4, rp: 2, ri: 3 },
        { id: 'R-2026-0002', name: 'Veri Sızıntısı',            cat: catGuv.id,  p: 4, i: 5, rp: 2, ri: 4 },
        { id: 'R-2026-0003', name: 'Sistem Kesintisi',           cat: catOps.id,  p: 3, i: 4, rp: 1, ri: 4 },
        { id: 'R-2026-0004', name: 'Uyumsuzluk Riski',          cat: catUyum.id, p: 2, i: 4, rp: 2, ri: 3 },
        { id: 'R-2026-0005', name: 'İş Sürekliliği Riski',      cat: catOps.id,  p: 2, i: 5, rp: 2, ri: 4 },
        { id: 'R-2026-0006', name: 'Yazılım Güvenlik Açığı',    cat: catBT.id,   p: 4, i: 3, rp: 2, ri: 3 },
        { id: 'R-2026-0007', name: 'Tedarikçi Riski',           cat: catOps.id,  p: 2, i: 3, rp: 2, ri: 2 },
        { id: 'R-2026-0008', name: 'İçeriden Tehdit',           cat: catGuv.id,  p: 3, i: 4, rp: 2, ri: 3 },
        { id: 'R-2026-0009', name: 'Kimlik Avı Saldırısı',      cat: catGuv.id,  p: 4, i: 3, rp: 2, ri: 2 },
        { id: 'R-2026-0010', name: 'Veri Bütünlüğü Riski',      cat: catBT.id,   p: 3, i: 4, rp: 2, ri: 3 },
    ];
    const risks: any[] = [];
    for (const r of riskDefs) {
        risks.push(await prisma.risk.create({ data: {
            riskId: r.id, name: r.name, description: `${r.name} — kapsamlı risk açıklaması`,
            status: 'ASSESSED', ownerId: randOf([uAna1, uAna2, uMgr1]).id, categoryId: r.cat,
            inherentProbability: r.p, inherentImpact: r.i, inherentRiskScore: r.p * r.i,
            residualProbability: r.rp, residualImpact: r.ri, residualRiskScore: r.rp * r.ri,
        }}));
    }
    console.log('✅ 10 risk');

    // ── 6. Kontroller ────────────────────────────────────────────────────────
    const cDefs = [
        { name: 'Ağ Erişim Hakları Gözden Geçirmesi',       type: 'BT',     freq: 'MONTHLY',    dir: dirBTAg, mehaz: 'BDDK 7.1.3' },
        { name: 'Güvenlik Duvarı Kural Denetimi',            type: 'BT',     freq: 'MONTHLY',    dir: dirBG,   mehaz: 'ISO 27001 A.13' },
        { name: 'Uygulama Erişim Log Kontrolü',              type: 'BT',     freq: 'MONTHLY',    dir: dirUG,   mehaz: 'BDDK 7.2.1' },
        { name: 'Sunucu Yama Uyum Kontrolü',                 type: 'BT',     freq: 'MONTHLY',    dir: dirAO,   mehaz: 'ISO 27001 A.12.6' },
        { name: 'Yedekleme Doğrulama Testi',                 type: 'BT',     freq: 'MONTHLY',    dir: dirAO,   mehaz: 'BDDK 8.3.1' },
        { name: 'Sızdırmazlık Testi (Penetrasyon)',          type: 'BT',     freq: 'QUARTERLY',  dir: dirBG,   mehaz: 'ISO 27001 A.14.2', months: ['Mart','Haziran','Eylül','Aralık'] },
        { name: 'Veri Sınıflandırma Uyumluluk Kontrolü',    type: 'BT',     freq: 'QUARTERLY',  dir: dirBG,   mehaz: 'GDPR Art.5',       months: ['Mart','Haziran','Eylül','Aralık'] },
        { name: 'Uygulama Güvenlik Kodu Gözden Geçirme',    type: 'BT',     freq: 'QUARTERLY',  dir: dirUG,   mehaz: 'OWASP Top 10',     months: ['Mart','Haziran','Eylül','Aralık'] },
        { name: 'Ağ Bant Genişliği Kapasite Planlaması',    type: 'BT',     freq: 'QUARTERLY',  dir: dirBTAg, mehaz: 'BDDK 8.1',         months: ['Mart','Haziran','Eylül','Aralık'] },
        { name: 'BCP Test Tatbikatı',                        type: 'BT',     freq: 'SEMI_ANNUAL',dir: dirAO,   mehaz: 'ISO 22301',        months: ['Mart','Eylül'] },
        { name: 'Bordro Doğrulama Kontrolü',                 type: 'BT_DISI',freq: 'MONTHLY',    dir: dirISY,  mehaz: 'İK-03' },
        { name: 'Tedarikçi Fatura Mutabakatı',               type: 'BT_DISI',freq: 'MONTHLY',    dir: dirISY,  mehaz: 'SAT-02' },
        { name: 'Nakit Yönetim Limitleri Kontrolü',          type: 'BT_DISI',freq: 'MONTHLY',    dir: dirISY,  mehaz: 'BDDK 5.2' },
        { name: 'Müşteri Şikayet Takip Kontrolü',            type: 'BT_DISI',freq: 'MONTHLY',    dir: dirISY,  mehaz: 'MÜŞ-01' },
        { name: 'Operasyonel Risk Göstergesi Takibi',        type: 'BT_DISI',freq: 'MONTHLY',    dir: dirISY,  mehaz: 'BDDK 3.1' },
        { name: 'Kredi Riski Portföy Değerlendirmesi',       type: 'BT_DISI',freq: 'QUARTERLY',  dir: dirISY,  mehaz: 'Basel III',        months: ['Mart','Haziran','Eylül','Aralık'] },
        { name: 'Yasal Mevzuat Uyum Değerlendirmesi',        type: 'BT_DISI',freq: 'QUARTERLY',  dir: dirISY,  mehaz: 'SPK 5.1',          months: ['Mart','Haziran','Eylül','Aralık'] },
        { name: 'Personel Yetki Matrisi Gözden Geçirme',    type: 'BT_DISI',freq: 'QUARTERLY',  dir: dirISY,  mehaz: 'YET-01',           months: ['Mart','Haziran','Eylül','Aralık'] },
        { name: 'İş Sürekliliği Planı Güncelleme',           type: 'BT_DISI',freq: 'SEMI_ANNUAL',dir: dirISY,  mehaz: 'ISO 22301',        months: ['Haziran','Aralık'] },
        { name: 'KVKK Uyumluluk Değerlendirmesi',            type: 'BT',     freq: 'SEMI_ANNUAL',dir: dirBG,   mehaz: 'KVKK Md.12',       months: ['Haziran','Aralık'] },
        { name: 'ISO 27001 İç Denetim',                      type: 'BT',     freq: 'ANNUAL',     dir: dirBG,   mehaz: 'ISO 27001',        months: ['Mart'] },
        { name: 'Yıllık Risk Değerlendirmesi',               type: 'BT_DISI',freq: 'ANNUAL',     dir: dirISY,  mehaz: 'BDDK 1.1',         months: ['Ocak'] },
        { name: 'Tüm Kullanıcı Hesapları Yıllık Gözden Geçirme', type: 'BT', freq: 'ANNUAL',    dir: dirBTAg, mehaz: 'ISO 27001 A.9',    months: ['Ocak'] },
        { name: 'Kritik Sistem Değişiklik Kontrolü',          type: 'BT',    freq: 'AD_HOC',     dir: dirAO,   mehaz: 'ITIL',             months: ['Ocak'] },
        { name: 'Acil Durum Müdahale Tatbikatı',              type: 'BT',    freq: 'AD_HOC',     dir: dirBG,   mehaz: 'ISO 27001 A.16',   months: ['Şubat'] },
        { name: 'Güvenlik Olay Log Taraması',                 type: 'BT',    freq: 'WEEKLY',     dir: dirBG,   mehaz: 'SOC Prosedürü' },
        { name: 'Yedekleme Tamamlanma Doğrulama',             type: 'BT',    freq: 'WEEKLY',     dir: dirAO,   mehaz: 'YD-01' },
        { name: 'Kritik Servis Sağlık Kontrolü',              type: 'BT',    freq: 'DAILY',      dir: dirAO,   mehaz: 'SLA' },
        { name: 'Fraud Alarm Gözden Geçirme',                 type: 'BT_DISI',freq: 'DAILY',     dir: dirISY,  mehaz: 'MASAK 2.1' },
        { name: 'Döviz Pozisyon Limiti Kontrolü',              type: 'BT_DISI',freq: 'DAILY',     dir: dirISY,  mehaz: 'BDDK 5.3' },
    ];

    let ctrlNum = 1;
    const controls: any[] = [];
    for (const def of cDefs) {
        const owner = randOf([uMgr1, uMgr2, uAud1, uAud2, uAud3]);
        const c = await prisma.control.create({ data: {
            controlId: `K-2026-${(ctrlNum++).toString().padStart(4, '0')}`,
            name: def.name,
            description: `${def.name} için kapsamlı test prosedürü. Dayanak: ${def.mehaz}`,
            type: def.type as any,
            nature: randOf(['PREVENTIVE', 'DETECTIVE']) as any,
            automation: randOf(['MANUAL', 'AUTOMATED', 'SEMI_AUTOMATED']) as any,
            frequency: def.freq as any,
            status: 'ACTIVE',
            directorateId: def.dir.id,
            directorate: def.dir.name,
            gmy: def.dir.gmy,
            mehaz: def.mehaz,
            selectedMonths: (def as any).months || [],
            ownerId: owner.id,
            testPerformerId: randOf(auditors).id,
            reviewerId: randOf(managers).id,
            effectivenessStatus: randOf(['NOT_TESTED','EFFECTIVE','PARTIALLY_EFFECTIVE','INEFFECTIVE']) as any,
            testSteps: `1. İlgili sisteme erişin\n2. Kayıtları gözden geçirin\n3. Anormallikleri raporlayın`,
        }});
        controls.push(c);
    }
    console.log(`✅ ${controls.length} kontrol`);

    // Risk-Kontrol eşleştirme
    for (let i = 0; i < controls.length; i++) {
        try {
            await prisma.controlRiskMapping.create({ data: { controlId: controls[i].id, riskId: risks[i % risks.length].id, mappingType: 'PRIMARY' } });
        } catch { /* duplicate ok */ }
    }

    // ── Risk Yönetimi Kontrolleri (RiskControl) & Aksiyonları (RiskAction) ───
    console.log('🎯 Risk Yönetimi Kontrolleri ve Aksiyonları ekleniyor...');
    const riskR10 = risks.find(r => r.riskId === 'R-2026-0010');
    if (riskR10) {
        const rc1 = await prisma.riskControl.create({
            data: {
                kontrolId: 'RC-2026-0001',
                kontrolTanimi: 'Veri tabanı bütünlük kısıtlarının günlük otomatik kontrolü ve raporlanması.',
                kontrolTuru: 'Önleyici',
                kontrolIslevi: 'Otomatik',
                birSeviyeKontrolSikligi: 'Günlük',
                kontrolPuani: 4.0,
                kontrolSkoru: '16',
                butunlesikKontrolSeviyesi: 'YÜKSEK',
                status: 'AKTIF',
                risks: {
                    create: {
                        riskId: riskR10.id
                    }
                }
            }
        });

        const rc2 = await prisma.riskControl.create({
            data: {
                kontrolId: 'RC-2026-0002',
                kontrolTanimi: 'Kritik veri tablolarındaki şüpheli değişiklikler için günlük audit log analizi yapılması.',
                kontrolTuru: 'Tespit Edici',
                kontrolIslevi: 'Yarı Otomatik',
                birSeviyeKontrolSikligi: 'Günlük',
                kontrolPuani: 3.0,
                kontrolSkoru: '12',
                butunlesikKontrolSeviyesi: 'ORTA',
                status: 'AKTIF',
                risks: {
                    create: {
                        riskId: riskR10.id
                    }
                }
            }
        });

        await prisma.riskAction.create({
            data: {
                aksiyonId: 'RA-2026-0001',
                aksiyonTanimi: 'Veri bütünlüğü kontrolü raporlama şablonlarının otomatik maile bağlanması.',
                aksiyonSahibi: 'Ayşe Şahin',
                status: 'DEVAM_EDIYOR',
                hedeflenenTamamlanmaTarihi: futureDate(45),
                riskControlId: rc1.id,
                risks: {
                    create: {
                        riskId: riskR10.id
                    }
                }
            }
        });

        await prisma.riskAction.create({
            data: {
                aksiyonId: 'RA-2026-0002',
                aksiyonTanimi: 'Şüpheli değişiklik audit alarm limitlerinin revize edilmesi.',
                aksiyonSahibi: 'Ahmet Yılmaz',
                status: 'ACIK',
                hedeflenenTamamlanmaTarihi: futureDate(60),
                riskControlId: rc2.id,
                risks: {
                    create: {
                        riskId: riskR10.id
                    }
                }
            }
        });
        console.log('✅ Risk Yönetimi RYK Kontrolleri ve Aksiyonları eklendi.');
    }

    // ── 7. Kontrol Testleri (Frekansa Dayalı Üretim) ─────────────────────────
    let testNum = 1;
    const genTestNo = () => `TST-2026-${(testNum++).toString().padStart(4, '0')}`;
    const controlTests: any[] = [];
    const currentYear = 2026;
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-indexed

    for (const ctrl of controls) {
        // Frekansa göre planlanan tarih listesini üret
        let plannedDates: Date[] = [];

        switch (ctrl.frequency) {
            case 'DAILY':
                // Günlük kontroller için test kaydı üretilmez
                break;

            case 'WEEKLY': {
                // Her Cuma tarihli kayıt
                plannedDates = getFridaysInYear(currentYear);
                break;
            }

            case 'MONTHLY': {
                // 12 kayıt — her ayın son iş günü
                for (let m = 0; m < 12; m++) {
                    plannedDates.push(getLastBusinessDay(currentYear, m));
                }
                break;
            }

            case 'QUARTERLY':
            case 'SEMI_ANNUAL':
            case 'ANNUAL':
            case 'AD_HOC': {
                // Seçili aylardaki son iş günleri
                const months: string[] = (ctrl as any).selectedMonths || [];
                for (const monthName of months) {
                    const mi = turkishMonthIndex[monthName];
                    if (mi === undefined) continue;
                    plannedDates.push(getLastBusinessDay(currentYear, mi));
                }
                break;
            }
        }

        // Tarih sırasına göre sırala
        plannedDates.sort((a, b) => a.getTime() - b.getTime());

        // Her planlanan tarih için test kaydı oluştur
        let hasIssueFinding = false; // En az 1 bulgulu test olsun
        for (let di = 0; di < plannedDates.length; di++) {
            const plannedDate = plannedDates[di];
            const testMonth = plannedDate.getMonth();
            const isPast = plannedDate < now;
            const isCurrentMonth = testMonth === currentMonth && plannedDate.getFullYear() === now.getFullYear();
            const isFuture = !isPast && !isCurrentMonth;

            let status: string;
            let findingStatus: string | null = null;
            let resultText: string | null = null;
            let evidenceSummary: string | null = null;
            let completedAt: Date | null = null;
            let approvedAt: Date | null = null;
            let approvedById: string | null = null;

            if (isPast && !isCurrentMonth) {
                // Geçmiş ay testleri — gerçekçi dağılım
                const roll = Math.random();
                if (!hasIssueFinding && di === Math.min(2, plannedDates.length - 1)) {
                    // İlk birkaç testten birinde bulgu olsun
                    status = 'TAMAMLANDI';
                    findingStatus = 'BULGUSU_VAR';
                    resultText = 'Test sırasında kontrol zayıflığı tespit edildi.';
                    evidenceSummary = 'Eksiklik kanıtları doküman halinde hazır.';
                    completedAt = new Date(plannedDate.getTime() + randInt(1, 5) * 86400000);
                    hasIssueFinding = true;
                } else if (roll < 0.65) {
                    status = 'ONAYLANDI';
                    findingStatus = 'BULGUSU_YOK';
                    resultText = 'Test başarıyla tamamlandı, bulgu tespit edilmedi.';
                    evidenceSummary = 'Sistem kayıtları kontrol edildi.';
                    completedAt = new Date(plannedDate.getTime() + randInt(1, 5) * 86400000);
                    approvedAt = new Date(completedAt.getTime() + randInt(1, 3) * 86400000);
                    approvedById = randOf(managers).id;
                } else if (roll < 0.85) {
                    status = 'TAMAMLANDI';
                    findingStatus = 'BULGUSU_YOK';
                    resultText = 'Kontrol testi tamamlandı, onay bekliyor.';
                    evidenceSummary = 'İlgili belgeler incelendi.';
                    completedAt = new Date(plannedDate.getTime() + randInt(1, 5) * 86400000);
                } else {
                    status = 'DEVAM_EDIYOR';
                }
            } else if (isCurrentMonth) {
                // Mevcut ay — çoğunlukla bekliyor veya devam ediyor
                status = Math.random() < 0.6 ? 'BEKLIYOR' : 'DEVAM_EDIYOR';
            } else {
                // Gelecek aylar — hepsi bekliyor
                status = 'BEKLIYOR';
            }

            const test = await prisma.controlTest.create({ data: {
                testNo: genTestNo(),
                controlId: ctrl.id,
                isAutoGenerated: true,
                plannedDate,
                status: status as any,
                findingStatus: findingStatus as any,
                resultText,
                evidenceSummary,
                completedAt,
                approvedAt,
                approvedById,
                assigneeId: ctrl.testPerformerId || ctrl.ownerId,
                directorateId: ctrl.directorateId,
            }});
            controlTests.push(test);
        }

        // Kontrolün son test tarihini güncelle
        const lastCompleted = controlTests
            .filter(t => t.controlId === ctrl.id && t.completedAt)
            .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0];
        if (lastCompleted) {
            await prisma.control.update({ where: { id: ctrl.id }, data: { lastTestDate: lastCompleted.completedAt } });
        }
    }
    console.log(`✅ ${controlTests.length} kontrol testi`);

    // ── 8. Bulgular ──────────────────────────────────────────────────────────
    const issueTests = controlTests.filter(t => t.findingStatus === 'BULGUSU_VAR');
    const fTemplates = [
        { summary: 'Ağ Erişim Hakları Gözden Geçirme Eksikliği',   desc: 'Ağ erişim hakları periyodik gözden geçirilmemektedir.' },
        { summary: 'Yetkisiz Güvenlik Duvarı Değişikliği',          desc: 'Güvenlik duvarı kurallarında yetkisiz değişiklik tespit edildi.' },
        { summary: 'Yetersiz Log Yönetimi',                          desc: 'Kritik sistemlerde loglama mekanizması yetersiz kalmaktadır.' },
        { summary: 'Yama Yönetim Gecikmesi',                         desc: 'Kritik yamalar belirlenen sürede uygulanmamaktadır.' },
        { summary: 'Yedekleme Test Eksikliği',                       desc: 'Yedekleme restore testleri planlandığı şekilde yapılmamaktadır.' },
        { summary: 'Kullanıcı Hesap Kontrolü Eksikliği',             desc: 'Kullanıcı hesapları yıllık gözden geçirilmemektedir.' },
        { summary: 'Tedarikçi Sözleşme Eksikliği',                   desc: 'Tedarikçi sözleşmelerinde bilgi güvenliği maddeleri eksik.' },
        { summary: 'Zayıf Kimlik Doğrulama Politikası',              desc: 'Kimlik doğrulama politikası güncel standartları karşılamamaktadır.' },
        { summary: 'BCP Tatbikat Eksikliği',                         desc: 'BCP tatbikatları planlandığı şekilde gerçekleştirilmemiştir.' },
        { summary: 'Güvenlik Farkındalık Eğitimi Eksikliği',         desc: 'Personel güvenlik farkındalık eğitimleri tamamlanmamıştır.' },
        { summary: 'Bordro Hesaplama Tutarsızlığı',                   desc: 'Bordro hesaplamalarında tutarsızlık tespit edilmiştir.' },
        { summary: 'Müşteri Şikayet Takip Eksikliği',                desc: 'Müşteri şikayet kayıt süreci takip edilmemektedir.' },
        { summary: 'ORI Raporlama Gecikmesi',                        desc: 'Operasyonel risk göstergeleri zamanında raporlanmamaktadır.' },
        { summary: 'Onay Limiti Aşımı',                              desc: 'Belirlenen eşiklerin üzerinde onay mekanizması bypass edilmiş.' },
        { summary: 'Değişiklik Yönetimi Uyumsuzluğu',               desc: 'Sistem değişiklik yönetimi prosedürüne uyulmamıştır.' },
        { summary: 'Döviz Pozisyon Limiti Aşımı',                    desc: 'Günlük döviz pozisyon limiti aşılmıştır.' },
        { summary: 'KVKK Uyumsuzluğu',                               desc: 'KVKK kapsamında veri işleme süreçlerinde eksiklik tespit edildi.' },
        { summary: 'ISO 27001 Gereklilik Eksikliği',                  desc: 'ISO 27001 gerekliliklerinin bir bölümü karşılanmamaktadır.' },
        { summary: 'Penetrasyon Testi Bulgularının Kapatılmaması',   desc: 'Penetrasyon testi sonuçlarındaki bulgular giderilmemiş.' },
        { summary: 'Yetersiz Uygulama Erişim Yetkilendirmesi',       desc: 'Kritik uygulama kaynakları için erişim yetkilendirmesi yetersiz.' },
    ];

    let fNum = 1;
    const genFId = (t?: string) => `B-2026-${(fNum++).toString().padStart(4, '0')}`;

    const wflows = ['TASLAK','MUTABAKATA_GONDERILDI','IC_KONTROL_ONAYINA_GONDERILDI','MUTABAKAT_YAPILDI'];
    const rstats = ['DEVAM_EDIYOR','KISMEN_KAPATILDI','KAPATILDI'];
    const sevs = ['CRITICAL','HIGH','MEDIUM','LOW'];

    const findings: any[] = [];
    for (let i = 0; i < Math.min(issueTests.length, 20); i++) {
        const test = issueTests[i];
        const ctrl = controls.find(c => c.id === test.controlId);
        const tmpl = fTemplates[i % fTemplates.length];
        const ftype = ctrl?.type === 'BT_DISI' ? 'IB' : 'BT';
        const sev = sevs[i % sevs.length];
        const wf = wflows[i % wflows.length];
        const rs = wf === 'MUTABAKAT_YAPILDI' ? 'KAPATILDI' : rstats[i % 3];

        const f = await prisma.finding.create({ data: {
            findingId: genFId(ftype),
            description: tmpl.desc,
            summary: tmpl.summary,
            impact: 'Kontrol zayıflığı operasyonel ve uyum risklerini artırabilir.',
            severity: sev as any,
            findingType: ftype as any,
            workflowStatus: wf as any,
            resolutionStatus: rs as any,
            status: rs === 'KAPATILDI' ? 'CLOSED' : rs === 'KISMEN_KAPATILDI' ? 'PARTIALLY_CLOSED' : 'IN_PROGRESS',
            controlId: ctrl?.id || null,
            controlTestId: test.id,
            directorateId: ctrl?.directorateId || null,
            relatedDepartment: ctrl?.directorate || null,
            gmy: ctrl?.gmy || null,
            iletisimKisisi: `${randOf(['Ahmet','Mehmet','Ayşe','Fatma'])} ${randOf(['Yılmaz','Kaya','Demir'])}`,
            assigneeId: randOf(auditors).id,
            birimCevabi: wf !== 'TASLAK' ? `Birim değerlendirmesi: ${tmpl.summary} konusunda gerekli aksiyonlar planlanmaktadır.` : null,
            internalControlAssessment: ['MUTABAKAT_YAPILDI','IC_KONTROL_ONAYINA_GONDERILDI'].includes(wf) ? `İKS değerlendirmesi: Bulgu geçerliliği teyit edilmiş, aksiyon takibi yapılmaktadır.` : null,
            closedDate: rs === 'KAPATILDI' ? pastDate(randInt(1, 15)) : null,
            testDate: rs !== 'KAPATILDI' ? futureDate(randInt(30, 90)) : null,
            source: 'CONTROL_TEST' as any,
        }});
        findings.push(f);

        // Risk eşleştirme
        try {
            await prisma.finding.update({ where: { id: f.id }, data: { linkedRisks: { connect: { id: risks[i % risks.length].id } } } });
        } catch { /* ok */ }
    }
    console.log(`✅ ${findings.length} bulgu`);

    // ── 9. Aksiyonlar ────────────────────────────────────────────────────────
    let aNum = 1;
    const genAId = () => `A-2026-${(aNum++).toString().padStart(4, '0')}`;
    const aDescs = [
        'Erişim hakları gözden geçirilecek, gereksiz yetkiler kaldırılacaktır.',
        'Güvenlik duvarı kuralları denetlenecek ve revize edilecektir.',
        'Loglama kapsamı genişletilecek, merkezi log yönetim sistemi kurulacaktır.',
        'Yama uygulaması için acil eylem planı hazırlanacaktır.',
        'Yedekleme prosedürü güncellenecek, test sıklığı artırılacaktır.',
        'Kullanıcı hesapları gözden geçirilecek, atıl hesaplar kapatılacaktır.',
        'Tedarikçi sözleşmeleri güvenlik maddeleri eklenerek yenilenecektir.',
        'Parola politikası güçlendirilecek, MFA devreye alınacaktır.',
        'BCP tatbikatı yeniden planlanacak ve tamamlanacaktır.',
        'Güvenlik farkındalık eğitim programı tüm personele verilecektir.',
    ];

    const actions: any[] = [];
    for (let i = 0; i < Math.min(findings.length, 20); i++) {
        const f = findings[i];
        const isClosed = f.resolutionStatus === 'KAPATILDI';
        const aStat = isClosed ? 'KAPATILDI' : f.resolutionStatus === 'KISMEN_KAPATILDI' ? 'TAMAMLANDI' : ['BEKLIYOR','DEVAM_EDIYOR'][i % 2];
        const dueDate = aStat === 'KAPATILDI' ? pastDate(randInt(1, 30)) : futureDate(randInt(30, 120));

        const a1 = await prisma.action.create({ data: {
            actionId: genAId(), findingId: f.id,
            description: aDescs[i % aDescs.length],
            ownerId: randOf([uMgr1, uMgr2, ...auditors]).id,
            directorateId: f.directorateId, responsibleDepartment: f.relatedDepartment,
            status: aStat as any, dueDate,
            completedAt: aStat === 'KAPATILDI' ? pastDate(randInt(1, 15)) : null,
            notes: 'Aksiyon öncelikli takip edilmektedir.', controlId: f.controlId,
        }});
        actions.push(a1);

        if (i % 3 === 0) {
            const a2 = await prisma.action.create({ data: {
                actionId: genAId(), findingId: f.id,
                description: `Ek düzeltici aksiyon: ${f.summary} için süreç iyileştirme çalışması.`,
                ownerId: randOf(managers).id,
                directorateId: f.directorateId,
                status: 'BEKLIYOR', dueDate: futureDate(randInt(60, 180)), controlId: f.controlId,
            }});
            actions.push(a2);
        }

        // targetResolutionDate hesapla
        const openActs = await prisma.action.findMany({ where: { findingId: f.id, status: { not: 'KAPATILDI' } }, select: { dueDate: true } });
        if (openActs.length > 0) {
            const maxD = new Date(Math.max(...openActs.map(a => new Date(a.dueDate).getTime())));
            await prisma.finding.update({ where: { id: f.id }, data: { targetResolutionDate: maxD } });
        }
    }
    console.log(`✅ ${actions.length} aksiyon`);

    // ── 10. Bulgu Takip Çalışmaları ──────────────────────────────────────────
    let fuNum = 1;
    const genFuId = () => `T-2026-${(fuNum++).toString().padStart(4, '0')}`;
    const followUps: any[] = [];

    for (const action of actions.slice(0, 30)) {
        const f = findings.find(fi => fi.id === action.findingId);
        if (!f) continue;

        const fuStat = action.status === 'KAPATILDI' ? 'ONAYLANDI' : action.status === 'TAMAMLANDI' ? 'TAMAMLANDI' : 'BEKLIYOR';
        const result = fuStat === 'ONAYLANDI' ? 'YETERLI' : fuStat === 'TAMAMLANDI' ? 'YETERSIZ' : null;
        const resOut = result === 'YETERLI' ? 'KAPATILDI' : result === 'YETERSIZ' ? 'YENI_AKSIYON_GEREKLI' : 'DEVAM_EDIYOR';

        const fu = await prisma.findingFollowUp.create({ data: {
            followUpId: genFuId(), findingId: f.id, actionId: action.id,
            status: fuStat as any, plannedDate: action.dueDate, directorateId: f.directorateId,
            birimCevabi: fuStat !== 'BEKLIYOR' ? 'Birim aksiyonları değerlendirdi ve ilerleme bildirdi.' : null,
            currentStatusDetail: fuStat !== 'BEKLIYOR' ? `${f.summary} konusunda alınan aksiyonlar devam etmektedir.` : null,
            internalControlAssessment: ['ONAYLANDI','TAMAMLANDI'].includes(fuStat) ? 'İKS değerlendirmesi tamamlandı.' : null,
            result: result as any, resolutionOutcome: resOut as any,
            evaluatorId: ['ONAYLANDI','TAMAMLANDI'].includes(fuStat) ? randOf(managers).id : null,
            evaluatedAt: ['ONAYLANDI','TAMAMLANDI'].includes(fuStat) ? pastDate(randInt(1,10)) : null,
            approvalStatus: fuStat === 'ONAYLANDI' ? 'ONAYLANDI' : 'BEKLIYOR',
            approvedBy: fuStat === 'ONAYLANDI' ? randOf(managers).id : null,
            approvedAt: fuStat === 'ONAYLANDI' ? pastDate(randInt(1,5)) : null,
        }});
        followUps.push(fu);
    }
    console.log(`✅ ${followUps.length} takip çalışması`);

    // ── 11. Audit Trail & StatusLog ──────────────────────────────────────────
    for (const f of findings.slice(0, 10)) {
        await prisma.findingStatusLog.create({ data: {
            findingId: f.id,
            text: `${f.summary} için ilk değerlendirme tamamlandı. Aksiyon planı hazırlanmaktadır.`,
            authorId: randOf(auditors).id, authorName: 'İKS Çalışanı',
        }});
        await prisma.findingStatusHistory.create({ data: {
            findingId: f.id, operation: 'FINDING_CREATED', changeType: 'FINDING_CREATED',
            userId: randOf(auditors).id, evaluator: 'Sistem',
            explanation: `Bulgu kaydı oluşturuldu: ${f.findingId}`,
            workflowStatus: 'TASLAK' as any,
        }});
    }

    // ── 12. Attachments ──────────────────────────────────────────────────────
    for (let i = 0; i < 10; i++) {
        await prisma.attachment.create({ data: {
            fileName: `kanit-${i+1}-${Date.now()}.pdf`, originalName: `Kanıt Belgesi ${i+1}.pdf`,
            mimeType: 'application/pdf', sizeBytes: randInt(50000, 2000000),
            entityType: i % 2 === 0 ? 'FINDING' : 'CORRECTIVE_ACTION',
            entityId: i % 2 === 0 ? (findings[i % findings.length]?.id || 'na') : (actions[i % actions.length]?.id || 'na'),
            uploadedById: randOf(auditors).id,
        }});
    }

    // ── 13. Parametreler ─────────────────────────────────────────────────────
    await prisma.parameter.createMany({ data: [
        { category: 'SLA', key: 'finding_close_days_critical', value: 30, description: 'KZ kapanma SLA (gün)' },
        { category: 'SLA', key: 'finding_close_days_high',     value: 60, description: 'KD kapanma SLA (gün)' },
        { category: 'SLA', key: 'finding_close_days_medium',   value: 90, description: 'ÖK kapanma SLA (gün)' },
        { category: 'GENERAL', key: 'app_name',    value: 'RMIC - İç Kontrol Sistemi' },
        { category: 'GENERAL', key: 'current_year', value: 2026 },
    ]});

    // ── Özet ─────────────────────────────────────────────────────────────────
    console.log('\n🎉 Seed tamamlandı!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`👥 Kullanıcılar:         10`);
    console.log(`🏢 Direktörlükler:        5`);
    console.log(`🔒 Kontroller:           ${controls.length}`);
    console.log(`🧪 Kontrol Testleri:     ${controlTests.length}`);
    console.log(`🔍 Bulgular:             ${findings.length}`);
    console.log(`⚡ Aksiyonlar:           ${actions.length}`);
    console.log(`📋 Takip Çalışmaları:    ${followUps.length}`);
    console.log(`⚠️  Riskler:              ${risks.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n🔑 Giriş bilgileri:');
    console.log('   admin@rmic.com  |  burak@rmic.com  →  Test1234!');
}

main()
    .catch(e => { console.error('❌ Seed hatası:', e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); await pool.end(); });
