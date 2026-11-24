/**
 * Sistem rollerinin VARSAYILAN izinleri. seed-system.ts eksik rolleri bununla oluşturur;
 * mevcut rolleri EZMEZ (bkz. seed-system.plan.ts). access-scope-dry-run.ts DB ile farkı raporlar.
 */
// Uygulamanın kullandığı 7 rol (5 çekirdek + 2 IKS — seed-roles.ts ile aynı liste,
// idempotent upsert olduğu için burada birleştirmek güvenli).
export const SYSTEM_ROLES: { name: string; description?: string; permissions: string[] }[] = [
    { name: 'SYSTEM_ADMIN', description: 'Sistem Yöneticisi — tüm yetkiler', permissions: ['*'] },
    {
        name: 'RISK_CONTROL_MANAGER', description: 'Risk ve Kontrol Yöneticisi',
        permissions: [
            'dashboard:view',
            'finding:view', 'finding:create', 'finding:update', 'finding:delete', 'action:*', 'control:*',
            'report:view', 'report:export', 'report:org',
            // Kayıt kapsamı (kurum geneli) ve kanıt erişimi — report:org'dan AYRI izinler.
            'scope:org', 'evidence:view',
            // Risk modülü: oluşturma/düzenleme/değerlendirme (backend risk uçları bu role açık;
            // arayüz izinle aynı hizada olsun — 2026-11 kararı). risk:sim:* bunu kapsar.
            'risk:*',
            // Riskin direktörlüğünü değiştirmek erişimi etkiler → ayrı izin + denetim kaydı.
            'risk:directorate:change',
            'ai:view', 'ai:run', 'ai:accept', 'ai:review', 'ai:admin',
            // Doğal dil sorgu + kaynak gizlilik seviyesi (rol adı yerine izin): RCM tüm seviyeleri görür.
            'ai:query', 'ai:source:restricted', 'ai:source:confidential',
        ],
    },
    {
        // AUDITOR varsayılanı SCOPED raporlar: kendi denetim görevi kapsamındaki
        // kayıtları görüntüler/dışa aktarır. Kurum geneli özet (report:org) ROL'den
        // gelmez — gerektiğinde yetkili yönetici açıkça ekler.
        name: 'AUDITOR', description: 'Denetçi',
        permissions: [
            'dashboard:view',
            'finding:view', 'finding:create', 'finding:delete:own', 'action:view', 'action:create', 'control:view', 'control:test',
            'report:view', 'report:export',
            // Merkezi iç kontrol: kurum geneli KAYIT kapsamı. Kurum geneli RAPOR (report:org)
            // ve yazma/onay/export izinleri bundan bağımsızdır.
            'scope:org', 'evidence:view',
            'ai:view', 'ai:run', 'ai:accept',
            'ai:query', 'ai:source:restricted',
        ],
    },
    // Risk modülünde kurum geneli; test/bulgu/aksiyon/takipte birim + doğrudan atama.
    { name: 'RISK_ANALYST', description: 'Risk Analisti', permissions: ['dashboard:view', 'finding:view', 'control:view', 'scope:org:risk', 'evidence:view', 'ai:query'] },
    // AUDITEE (denetlenen birim): yalnızca kendisine atanmış kayıtların raporları.
    // Kurum geneli özet / dışa aktarma KAPALI.
    // Kapsam: DirectorateMembership birimleri + doğrudan atanan işler (çoklu üyelik yönetici yetkisi VERMEZ).
    // control:view = Kontrol Havuzu ana verisi; düzenleme, plan uygulama, diğer birimlerin
    // test/bulgu/aksiyonları veya kanıt indirme yetkisi VERMEZ (bunlar kendi politikasından geçer).
    { name: 'AUDITEE', description: 'Denetlenen Birim', permissions: ['dashboard:view', 'finding:view', 'action:view', 'action:update', 'report:view', 'evidence:view', 'control:view'] },
    // Salt okunur, birim kapsamı. Export ve kanıt indirme bu rolden TÜRETİLMEZ (ayrı izin gerekir).
    { name: 'VIEWER', description: 'Görüntüleyici', permissions: ['dashboard:view', 'finding:view', 'control:view', 'action:view'] },
    {
        name: 'IKS_EMPLOYEE', description: 'İç Kontrol Sistemi Çalışanı',
        permissions: ['dashboard:view', 'control:view', 'finding:view', 'action:view', 'test:execute', 'ai:query'],
    },
    {
        name: 'IKS_MANAGER', description: 'İç Kontrol Sistemi Yöneticisi',
        permissions: [
            'dashboard:view', 'control:view', 'finding:view', 'action:view', 'test:execute',
            'finding:update', 'finding:create', 'action:update', 'action:create', 'report:view',
            // Önceden rol adıyla veriliyordu (AI_EVAL_ROLES/AI_QUERY_ROLES + KISITLI seviye): izin karşılıkları.
            'ai:run', 'ai:query', 'ai:source:restricted',
        ],
    },
];

