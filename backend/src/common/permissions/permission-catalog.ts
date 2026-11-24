/**
 * KANONİK İZİN KATALOĞU — tek kaynak.
 *
 * - Backend dekoratörleri / servis kontrolleri bu anahtarları kullanır.
 * - Rol yönetimi ekranı kataloğu `GET /admin/permissions` üzerinden alır (frontend'de
 *   elle tutulan liste yoktur).
 * - Rol oluşturma/güncelleme, katalogda olmayan YENİ anahtarı reddeder.
 *
 * `enforcedIn` dürüst bir göstergedir: 'api' = backend isteği reddeder; 'ui' = yalnız
 * menü/buton görünürlüğü (backend ayrıca rol/izin ile korur); boş = ayrılmış, henüz
 * hiçbir yerde denetlenmiyor (yöneticiyi yanıltmamak için ekranda belirtilir).
 *
 * Yeni izin eklerken: buraya ekle → kullanıldığı guard/servis → system-roles.ts
 * (varsayılan) → hedefli izin geçişi (prisma/permission-migration.ts).
 */
export type PermissionEnforcement = 'api' | 'ui';

export interface PermissionDef {
    key: string;
    group: string;
    label: string;
    description: string;
    enforcedIn: PermissionEnforcement[];
}

export const PERMISSION_GROUPS: { key: string; label: string }[] = [
    { key: 'dashboard', label: 'Gösterge Paneli' },
    { key: 'scope', label: 'Kayıt Kapsamı ve Kanıt' },
    { key: 'risk', label: 'Risk Yönetimi' },
    { key: 'control', label: 'Kontrol Yönetimi' },
    { key: 'finding', label: 'Bulgular' },
    { key: 'action', label: 'Aksiyonlar' },
    { key: 'report', label: 'Raporlar' },
    { key: 'ai', label: 'Yapay Zeka' },
    { key: 'admin', label: 'Sistem Yönetimi (menü)' },
];

export const PERMISSION_CATALOG: PermissionDef[] = [
    { key: 'dashboard:view', group: 'dashboard', label: 'Görüntüleme', description: 'Gösterge paneli ve çalışma panosu', enforcedIn: ['api', 'ui'] },

    { key: 'scope:org', group: 'scope', label: 'Kurum geneli kayıt kapsamı', description: 'Tüm modüllerde kurum genelindeki kayıtları görür; yazma/onay/export izinleri ayrıca gerekir', enforcedIn: ['api'] },
    { key: 'scope:org:risk', group: 'scope', label: 'Risk — kurum geneli kapsam', description: 'Yalnız risk modülünde kurum geneli kapsam', enforcedIn: ['api'] },
    { key: 'evidence:view', group: 'scope', label: 'Kanıt görüntüleme/indirme', description: 'Erişebildiği kayıtların kanıtlarını açar; salt okunur rolden türetilmez', enforcedIn: ['api'] },

    { key: 'risk:view', group: 'risk', label: 'Görüntüleme', description: 'Risk menüsü ve aramada risk sonuçları', enforcedIn: ['api', 'ui'] },
    { key: 'risk:create', group: 'risk', label: 'Oluşturma', description: 'Risk oluşturma butonları', enforcedIn: ['ui'] },
    { key: 'risk:delete', group: 'risk', label: 'Silme', description: 'Risk/kontrol alanı/aksiyon tablosu silme butonları', enforcedIn: ['ui'] },
    { key: 'risk:directorate:change', group: 'risk', label: 'Direktörlük değiştirme', description: 'Riskin bağlı direktörlüğünü değiştirir (erişimi etkiler, denetim kaydı yazılır)', enforcedIn: ['api'] },
    { key: 'risk:sim:view', group: 'risk', label: 'Simülasyon — görüntüleme', description: 'Risk simülasyonu senaryoları', enforcedIn: ['api', 'ui'] },
    { key: 'risk:sim:create', group: 'risk', label: 'Simülasyon — oluşturma', description: 'Senaryo oluşturma', enforcedIn: ['api', 'ui'] },
    { key: 'risk:sim:edit', group: 'risk', label: 'Simülasyon — düzenleme', description: 'Senaryo düzenleme', enforcedIn: ['api', 'ui'] },
    { key: 'risk:sim:delete', group: 'risk', label: 'Simülasyon — silme', description: 'Kayıtlı simülasyonları silme (envantere aktarım yapılmış olanlar silinemez)', enforcedIn: ['api', 'ui'] },
    { key: 'risk:sim:transfer', group: 'risk', label: 'Simülasyon — envantere aktarma', description: 'Senaryoyu gerçek envantere aktarma', enforcedIn: ['api', 'ui'] },

    { key: 'control:view', group: 'control', label: 'Kontrol Havuzu görüntüleme', description: 'Ortak ana veri; ilişkili test/bulgu/kanıtlar kendi kapsamından geçer', enforcedIn: ['api', 'ui'] },
    { key: 'control:test', group: 'control', label: 'Test yürütme / birinci kontrolcü', description: 'Kontrol testi yapma; Yıllık Planda birinci kontrolcü olarak atanabilme', enforcedIn: ['api', 'ui'] },
    { key: 'control:approve', group: 'control', label: 'Test onayı / ikinci kontrolcü', description: 'Kontrol testini onaylama/geri gönderme; Yıllık Planda ikinci kontrolcü olabilme', enforcedIn: ['api'] },
    { key: 'test:execute', group: 'control', label: 'Test yürütme (eski IKS)', description: 'IKS rolleri için geriye uyumluluk; control:test ile eşdeğer DEĞİL — geçiş planına bakın', enforcedIn: ['api'] },

    { key: 'finding:view', group: 'finding', label: 'Görüntüleme', description: 'Bulgu menüsü ve kayıtları (kapsam ayrıca uygulanır)', enforcedIn: ['api', 'ui'] },
    { key: 'finding:create', group: 'finding', label: 'Oluşturma', description: 'Bulgu oluşturma', enforcedIn: ['api', 'ui'] },
    { key: 'finding:update', group: 'finding', label: 'Düzenleme', description: 'Bulgu düzenleme', enforcedIn: ['api', 'ui'] },
    { key: 'finding:delete', group: 'finding', label: 'Silme (her taslak)', description: 'Süreci başlamamış TASLAK bulguyu silme', enforcedIn: ['api', 'ui'] },
    { key: 'finding:delete:own', group: 'finding', label: 'Kendi taslağını silme', description: 'Yalnız kendi oluşturduğu TASLAK bulguyu silme', enforcedIn: ['api', 'ui'] },

    { key: 'action:view', group: 'action', label: 'Görüntüleme', description: 'Aksiyon menüsü ve kayıtları (kapsam ayrıca uygulanır)', enforcedIn: ['api', 'ui'] },
    { key: 'action:create', group: 'action', label: 'Oluşturma', description: 'Aksiyon oluşturma', enforcedIn: ['api', 'ui'] },
    { key: 'action:update', group: 'action', label: 'Güncelleme', description: 'Aksiyon güncelleme/tamamlama (birim kullanıcısı yalnız kendi aksiyonu)', enforcedIn: ['api', 'ui'] },

    { key: 'report:view', group: 'report', label: 'Görüntüleme', description: 'Kapsamlı raporlar (kendi kayıt kapsamında)', enforcedIn: ['api', 'ui'] },
    { key: 'report:export', group: 'report', label: 'Dışa aktarma', description: 'Rapor dışa aktarma (Word/Excel)', enforcedIn: ['api'] },
    { key: 'report:org', group: 'report', label: 'Kurum geneli raporlar', description: 'Kurum geneli yönetim raporları — kayıt kapsamı VERMEZ', enforcedIn: ['api'] },

    { key: 'ai:view', group: 'ai', label: 'Görüntüleme', description: 'Yapay zeka menüsü ve kaynak kataloğu', enforcedIn: ['ui'] },
    { key: 'ai:run', group: 'ai', label: 'Çalıştırma', description: 'Kontrol & kanıt değerlendirme çalıştırma', enforcedIn: ['api', 'ui'] },
    { key: 'ai:admin', group: 'ai', label: 'Yönetim', description: 'Kaynak kütüphanesi ve AI ayarları', enforcedIn: ['ui'] },
    { key: 'ai:accept', group: 'ai', label: 'Öneri kabul (ayrılmış)', description: 'Henüz hiçbir yerde denetlenmiyor', enforcedIn: [] },
    { key: 'ai:review', group: 'ai', label: 'İnceleme (ayrılmış)', description: 'Henüz hiçbir yerde denetlenmiyor', enforcedIn: [] },

    // Sistem Yönetimi ekranları backend'de SYSTEM_ADMIN rolüyle korunur; bu izinler yalnız menüyü gösterir.
    { key: 'user:view', group: 'admin', label: 'Kullanıcılar menüsü', description: 'Yalnız menü görünürlüğü', enforcedIn: ['ui'] },
    { key: 'role:manage', group: 'admin', label: 'Roller menüsü', description: 'Yalnız menü görünürlüğü', enforcedIn: ['ui'] },
    { key: 'parameter:view', group: 'admin', label: 'Parametreler menüsü', description: 'Yalnız menü görünürlüğü', enforcedIn: ['ui'] },
    { key: 'audit_log:view', group: 'admin', label: 'Denetim izleri menüsü', description: 'Yalnız menü görünürlüğü', enforcedIn: ['ui'] },
    { key: 'audit:view', group: 'admin', label: 'Denetim yönetimi menüsü', description: 'Yalnız menü görünürlüğü', enforcedIn: ['ui'] },
    { key: 'audit:execute', group: 'admin', label: 'Denetim yürütme menüsü', description: 'Yalnız menü görünürlüğü', enforcedIn: ['ui'] },
    { key: 'compliance:view', group: 'admin', label: 'Mevzuat menüsü', description: 'Yalnız menü görünürlüğü', enforcedIn: ['ui'] },
    { key: 'compliance:map', group: 'admin', label: 'Mevzuat eşleştirme menüsü', description: 'Yalnız menü görünürlüğü', enforcedIn: ['ui'] },
];

const KEYS = new Set(PERMISSION_CATALOG.map(p => p.key));
const RESOURCES = new Set(PERMISSION_CATALOG.map(p => p.key.split(':')[0]));

/**
 * Bilinen anahtar mı? Tam anahtar, `*` veya katalogdaki bir kaynağın `<kaynak>:*`
 * joker karakteri kabul edilir (matchesPermission semantiğiyle aynı).
 */
export function isKnownPermission(key: string): boolean {
    if (key === '*') return true;
    if (KEYS.has(key)) return true;
    const m = /^([a-z_]+):\*$/.exec(key);
    return !!m && RESOURCES.has(m[1]);
}

/**
 * Eski (rol ekranının eski elle tutulan listesinden kalma) anahtarlar için AÇIK eşleme.
 * `equivalent: true` yalnız anlamı birebir aynı olanlardır; diğerleri otomatik
 * BİRLEŞTİRİLMEZ — rapor yalnız öneri sunar, DB'deki izinler sessizce değişmez.
 */
export const LEGACY_PERMISSION_MAP: Record<string, { target: string | null; equivalent: boolean; note: string }> = {
    'dashboard:read': { target: 'dashboard:view', equivalent: true, note: 'Adlandırma farkı' },
    'finding:read': { target: 'finding:view', equivalent: true, note: 'Adlandırma farkı' },
    'action:read': { target: 'action:view', equivalent: true, note: 'Adlandırma farkı' },
    'control:read': { target: 'control:view', equivalent: true, note: 'Adlandırma farkı' },
    'risk:read': { target: 'risk:view', equivalent: true, note: 'Adlandırma farkı' },
    'report:read': { target: 'report:view', equivalent: true, note: 'Adlandırma farkı' },
    'audit:read': { target: 'audit:view', equivalent: true, note: 'Adlandırma farkı (yalnız menü)' },
    'compliance:read': { target: 'compliance:view', equivalent: true, note: 'Adlandırma farkı (yalnız menü)' },
    'dashboard:read:own': { target: null, equivalent: false, note: '"Kendi" sınırı artık kayıt kapsamıyla (üyelik/atama) belirlenir' },
    'finding:read:own': { target: null, equivalent: false, note: '"Kendi" sınırı artık kayıt kapsamıyla (üyelik/atama) belirlenir' },
    'action:read:own': { target: null, equivalent: false, note: '"Kendi" sınırı artık kayıt kapsamıyla belirlenir' },
    'action:update:own': { target: 'action:update', equivalent: false, note: 'action:update birim kullanıcısını zaten kendi aksiyonuyla sınırlar; yönetici için kapsamı genişletir' },
    'action:upload:own': { target: null, equivalent: false, note: 'Kanıt yükleme rol bazlı korunur; ayrı izin yok' },
    'control:create': { target: null, equivalent: false, note: 'API rol bazlı (SYSTEM_ADMIN/RCM); izinle denetlenmiyor' },
    'control:update': { target: null, equivalent: false, note: 'API rol bazlı; izinle denetlenmiyor' },
    'control:delete': { target: null, equivalent: false, note: 'API rol bazlı; izinle denetlenmiyor' },
    'risk:update': { target: null, equivalent: false, note: 'API rol bazlı; izinle denetlenmiyor' },
    'audit:create': { target: null, equivalent: false, note: 'API rol bazlı; izinle denetlenmiyor' },
    'audit:update': { target: null, equivalent: false, note: 'API rol bazlı; izinle denetlenmiyor' },
    'admin:*': { target: null, equivalent: false, note: 'Sistem yönetimi SYSTEM_ADMIN rolüyle korunur' },
    'system:*': { target: null, equivalent: false, note: 'Sistem yönetimi SYSTEM_ADMIN rolüyle korunur' },
};

export function describePermission(key: string): PermissionDef | undefined {
    return PERMISSION_CATALOG.find(p => p.key === key);
}
