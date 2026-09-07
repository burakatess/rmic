# RMIC UI/UX Standardization Analysis — Enterprise Design System v2

> **GÜNCELLEME NOTU (Faz 16, 2026-07-28):** Bu dokümanda "Legacy/Gen-1" olarak işaretlenen
> `admin/users`, `admin/roles`, `admin/parameters`, `admin/integrations`, `compliance/regulations`,
> `compliance/regulations/library` sayfaları artık tamamı Design System v2'ye taşınmış durumda
> (`PageShell`/`PageHeader`/`DataTable`, `alert()` yok, gerçek backend verisi). Bu doküman aşağıdaki
> envanter tablosu için artık güncel değil — kod tabanının fiilî durumunu esas alın.

> Sprint hedefi: Yeni özellik değil, mevcut frontend'in tek bir kurumsal tasarım dili altında standartlaştırılması.
> **Kesin kural:** Backend, Prisma, API contract, DTO, controller, service, iş kuralları, ID formatları değişmeyecek.
>
> Bu doküman, kod tabanının fiilî envanterine dayanır (tüm `app/(dashboard)` sayfaları + `components/` ağacı satır satır incelendi). Onaylanmadan büyük refactor'a başlanmayacaktır.

---

## 1. Yönetici Özeti

RMIC frontend'inde **iki tasarım nesli** yan yana yaşıyor:

- **Gen-2 (kanonik):** `PageHeader` + `FilterBar` + `DataTable` + `slate-*` paleti, `flex flex-col h-full bg-slate-50/50` sayfa kabuğu. Risks, Controls, Findings, Actions, Follow-ups, Approvals, Audits/plans bu neslin üzerinde.
- **Gen-1 (legacy):** Inline `<h1>` başlıklar, `gray-*` paleti, `space-y-6` kabuk, elle yazılmış `<table>`, `alert()`/`prompt()` ile feedback. Compliance/* ve Admin/* sayfalarının çoğu bu neslin üzerinde.

İyi haber: **Sağlam bir component temeli zaten var.** `DataTable` (540 satır: sıralama, sayfalama, kolon gizleme, kolon resize, kolon filtreleri, localStorage persistence, skeleton loading) enterprise table gereksinimlerinin ~%70'ini bugün karşılıyor. `PageHeader`, `FilterBar`, `StatusBadge`, `Modal`, `Toast`, `EmptyState` mevcut ve liste sayfalarında yaygın kullanımda.

Kötü haber: **Detay sayfaları bu temeli neredeyse hiç kullanmıyor** (5 detay sayfasının 4'ü kendi header/tab/badge/loading kodunu inline yazmış), KPI kartları en az **4 farklı stilde** kopyalanmış, hızlı filtre chip'leri **3 farklı idiyomla** yazılmış ve `globals.css`'teki zengin token sistemi Tailwind'e bağlanmadığı için fiilen **iki paralel styling sistemi** var.

Strateji: **Yeni bir tasarım icat etmek değil, Gen-2'yi Design System v2 olarak resmîleştirip her sayfayı ona taşımak.**

---

## 2. Mevcut Ekran Envanteri

### 2.1 Liste sayfaları

| Sayfa | Satır | Kabuk | PageHeader | Breadcrumb | KPI | Filtre | Tablo | Nesil |
|---|---|---|---|---|---|---|---|---|
| `dashboard` | 630 | Gen-2 | ✓ | ✗ | 4+3 bespoke link-kart | — | — (Recharts + heatmap) | Gen-2 (bespoke) |
| `risks` | 669 | Gen-2 | ✓ | ✓ | 5 kart, statik | FilterBar + kolon filtreleri | DataTable | **Kanonik referans** |
| `controls` | 658 | Gen-2 | ✓ | ✓ | 5 kart, `rounded-2xl` + ikon (farklı stil) | Bespoke panel + preset chip'ler | DataTable + bulk delete | Gen-2 (sapmalı) |
| `controls/testing` | 770 | Gen-2 | ✓ | ✓ | 7 kart, tıklanabilir, **dinamik class riski** | Ay çubuğu + FilterBar | DataTable + sağ WorkspacePanel | Gen-2 (sapmalı) |
| `findings` | 644 | Gen-2 | ✓ | ✓ | 6 kart, emoji, tıklanabilir, **dinamik class riski** | Saved-view chip'leri + FilterBar | DataTable + bulk delete | Gen-2 |
| `actions` | 372 | Gen-2 | ✓ | ✓ | 4 kart, statik | FilterBar | DataTable + bulk delete | Gen-2 (risks ikizi) |
| `follow-ups` | 469 | Gen-2 | ✓ | ✓ | 6 kart, emoji, kısmen no-op onClick | FilterBar | DataTable + bulk delete | Gen-2 |
| `approvals` | 342 | Gen-2 | ✓ | ✓ | 3 kart, statik | FilterBar (kolon filtresi yok) | DataTable → modal | Gen-2 |
| `reports` | 120 | Gen-2 | ✓ | ✗ | — (link-kart hub) | — | — | Gen-2 (hub) |
| `reports/monthly` | 684 | Gen-2 | ✓ | ✗ | rapor içi KPI | — | elle `<table>` (print) | Gen-2 (print) |
| `reports/bulgu-takip` | 658 | Gen-2 | ✓ | ✗ | — | ay/aralık toggle | elle `<table>` + sunum modu | Gen-2 (print) |
| `reports/ek6` | 257 | Gen-2 | ✓ | ✓ | — | — | elle `<table>` (print) | Gen-2 (print) |
| `audits/plans` | 275 | Gen-2 | ✓ | ✓ | KPI **dinamik class riski** | FilterBar | DataTable — **DEMO data** | Gen-2 |
| `audits/executions` | 185 | Gen-2 | ✓ | ✓ | 4 kart statik | — | kart grid — **DEMO data** | Gen-2 (sapmalı) |
| `compliance/regulations` | 233 | **Gen-1** | ✗ inline h1 | ✗ | — | — | liste satırları + indigo gradient hero | **Legacy** |
| `compliance/regulations/library` | 348 | Gen-2 | ✓ (üstüne manuel breadcrumb) | çift | — | bespoke arama | kart grid + custom modal | Karışık |
| `compliance/mapping` | 207 | **Gen-1** | ✗ inline h1 | ✗ | 4 renkli-zemin kart | chip'ler | elle `<table>` — **DEMO data** | **Legacy** |
| `admin/audit-logs` | 333 | `space-y-6` | ✓ | ✗ | — | bespoke (tek gerçek date-range) | DataTable → modal | Karışık |
| `admin/users` | 534 | **Gen-1** | ✗ inline h1 | ✗ | 4 renkli-zemin kart | kendi arama kartı | elle `<table>`, **`alert()`** | **Legacy** |
| `admin/roles` | 359 | **Gen-1** | ✗ inline h1 | ✗ | — | — | master-detail panel | **Legacy** |
| `admin/parameters` | 614 | **Gen-1** | ✗ inline h1 | ✗ | — | — | akordiyon — **DEMO data** | **Legacy** |
| `admin/risk-proposals` | 157 | `space-y-6` | ✓ | ✗ | — | chip'ler | kart listesi | Karışık |
| `admin/integrations` | 27 | kendine özgü | ✗ inline h1 | ✗ | — | — | placeholder | **Legacy** |

### 2.2 Detay sayfaları

| Aspect | `actions/[id]` (173) | `risks/[id]` (749) | `controls/[id]` (628) | `findings/[id]` (1041) | `audits/plans/[id]` (580) |
|---|---|---|---|---|---|
| Header | ✓ `PageHeader` | inline custom kart | inline custom | inline **sticky** custom | inline custom |
| Tab'lar | yok | inline (6 tab) | inline (4 tab) | inline (6 tab) | inline (4 tab) |
| Ortak `Tabs` kullanımı | — | ✗ | ✗ | ✗ | ✗ |
| Badge | `StatusBadge` | inline color map | karışık | `StatusBadge` + inline | inline color map |
| Palet | slate | **gray** | slate | slate | **gray** |
| Timeline/history | — | **mock `AUDIT_LOG`** | — | gerçek API | mock |
| Ekler | — | — | — | bespoke `AttachmentList` (FileUpload kullanmıyor) | — |
| Veri | API | API | API | API | **%100 mock, hiç API çağrısı yok** |

Ortak `Tabs` componenti sadece **orphan** `RiskDetailDrawer` içinde kullanılıyor; canlı hiçbir sayfada yok.

---

## 3. Tespit Edilen UI Tutarsızlıkları

### 3.1 Yapısal
1. **İki sayfa kabuğu:** `flex flex-col h-full bg-slate-50/50 px-8 pt-8` (Gen-2) vs `space-y-6` (Gen-1) vs `min-h-screen bg-gray-50 max-w-[1400px]` (integrations).
2. **PageHeader adaptasyonu eksik:** 6 sayfada inline `<h1>`; breadcrumb PageHeader kullanan sayfalarda dahi tutarsız (dashboard, reports, audit-logs'ta yok; library'de çift).
3. **Detay sayfaları ortak layout kullanmıyor:** 5 sayfadan 4'ü header/tab/loading'i kopyala-yapıştır inline yazmış.
4. **Palet kayması:** `slate-*` vs `gray-*` (risks/[id], audits, compliance, admin, ResizableTable, Header'da gray).

### 3.2 KPI kartları — en az 4 farklı stil
1. `risks`/`actions`/`approvals`/`audits`: `rounded-xl p-4/5 shadow-sm border-<color>-200`, statik.
2. `controls`: `rounded-2xl border-slate-100` + ikon karosu.
3. `findings`/`follow-ups`/`controls-testing`: emoji ikonlu, `<button>` click-to-filter.
4. `admin/users`/`compliance/mapping`: renkli zemin (`bg-green-50` vb.).
- Değer boyutları tutarsız: `text-4xl` (dashboard) / `text-2xl` (çoğu) / `text-xl` (testing).
- Click-to-filter davranışı rastgele: bazı kartlar filtre uyguluyor, bazıları ölü, bazıları **no-op `() => {}`** handler'lı.

### 3.3 Filtreleme — 3 chip idiyomu, 4 panel deseni
- `FilterBar` 11 sayfada kullanılıyor; `controls`, `audit-logs`, `compliance/library` bespoke panel yazmış.
- Chip'ler: `controls` (applyPreset), `findings` (savedViews + canlı sayaçlar), `compliance/mapping` & `risk-proposals` (düz toggle) — ortak component yok.
- Kolon filtreleri `approvals` ve `audits`'ta hiç yok.
- Aktif filtre chip'leri (silinebilir "GMY: BT" tarzı) hiçbir sayfada yok.

### 3.4 Tablo
- `DataTable`: 9 liste sayfası + audit-logs. **Elle `<table>`:** compliance/mapping, admin/users, reports/*. **Kart listesi:** executions, risk-proposals, regulations.
- `ResizableTable` ve `useResizableColumns` — aynı resize mantığının **ölü kopyaları** (3 implementasyon, 1'i canlı).

### 3.5 State ve feedback
- Loading: DataTable skeleton'ı (iyi) vs 5+ farklı elle `animate-spin` çember.
- Hata: `useToast` (çoğu) vs sessiz `console.error` (actions, dashboard) vs **`alert()`** (admin/users) vs **`prompt()`/`confirm()`** (testing, approvals workflow gerekçeleri).
- `EmptyState` componenti sadece `reports/ek6`'da doğrudan kullanılıyor.
- `controls` boş durum aksiyonu `window.location.href` kullanıyor (router yerine).

### 3.6 Muhtemel görsel bug: Dinamik Tailwind class interpolasyonu
`findings`, `follow-ups`, `controls/testing`, `audits/plans` KPI kartlarında `border-${color}-100`, `text-${color}-700` şeklinde dinamik string'ler var. Tailwind v4 bu class'ları statik olarak göremediği için **üretilmez → KPI renkleri sessizce kaybolur**. Standardizasyonda `KpiCard` variant map'iyle (statik class listeleri) çözülecek.

### 3.7 Ölü / öksüz kod
- `components/ui/Card.tsx` — hiçbir yerden import edilmiyor (ayrıca `MyWorkSection` ve `findings/[id]` içinde 2 lokal `Card` tanımı daha var → **3 farklı Card**).
- `ResizableTable.tsx`, `hooks/useResizableColumns.ts` — ölü.
- `risks/components/RiskDetailDrawer.tsx` + `RiskFormModal.tsx` — öksüz (risks/page kendi lokal RiskFormModal'ını tanımlıyor); `DetailDrawer` yalnızca bu öksüz zincir üzerinden erişilebilir → fiilen ölü.
- `components/charts/` — **boş klasör**; Recharts doğrudan dashboard ve monthly report içinde inline.

### 3.8 Token sistemi bağlantısız
`globals.css`'te "Enterprise Banking Grade" başlıklı zengin CSS variable seti var (primary 50-900, severity, status, spacing, shadow, radius) ama **Tailwind v4 `@theme`'e bağlanmamış**; componentler hardcoded `bg-blue-600`/`text-slate-700` kullanıyor. `--font-sans` next/font'un `--font-inter` değişkenini referans almıyor (optimizasyon boşa gidiyor). Dark mode hiç yok (bu sprintte hedef değil — light-only kalacak).

### 3.9 Veri katmanı
react-query/SWR yok; her sayfa kendi `useState + useEffect + api.getX()` üçlüsünü kopyalıyor. Backend'e dokunmadan, `useListPage` benzeri tek bir hook ile bu tekrar ortadan kaldırılabilir (fetch + arama + filtre + sıralama + sayfalama state'i).

### 3.10 Mock/demo yüzeyler (UI borcu olarak işaretlendi, bu sprintte veri bağlamayacağız)
`audits/plans` + `audits/plans/[id]` + `audits/executions` (tamamı demo), `compliance/mapping`, `admin/parameters`, `risks/[id]` history tab'ı, Header'daki arama ve bildirimler. Bu sayfaların **görünümü** standarda taşınacak; veri bağlama backend işi olduğu için kapsam dışı.

---

## 4. Design System v2 Kuralları

### 4.1 Görsel dil
- **Hedef:** Enterprise SaaS — Jira Enterprise / ServiceNow / Archer çizgisi. Veri-yoğun, taranabilir, sade.
- **Palet:** Primary **blue-600 (#2563EB)** (mevcut), nötr **slate** (gray tamamen terk edilir), semantik: `red` (kritik/gecikmiş), `orange` (yüksek), `amber` (bekliyor/uyarı), `emerald` (başarı/kapalı), `sky` (bilgi), `violet` (yalnızca test/onay workflow vurgusu — mevcut kullanım korunur), `slate` (nötr/iptal).
- **Tipografi:** Inter (mevcut) — `next/font` değişkeni `--font-sans`'a doğru bağlanır. Sayfa başlığı `text-xl font-bold text-slate-800`, section başlığı `text-sm font-semibold text-slate-700`, tablo gövdesi `text-sm`, KPI değeri `text-2xl font-bold` (dashboard dahil tek boyut). Sayısal kolonlarda `tabular-nums`.
- **Yüzeyler:** Kart = `bg-white rounded-xl border border-slate-200 shadow-sm`. `rounded-2xl`, iç içe kart, dekoratif köşe blob'ları ve gradient hero'lar kaldırılır (dashboard'daki kartlar da bu standarda iner).
- **Spacing:** 4/8px ritmi; sayfa kabuğu `px-8 pt-8 pb-12`; section arası `space-y-6`; kart içi `p-4`/`p-5`.
- **Etkileşim:** hover `hover:bg-slate-50` / `hover:border-slate-300`, geçişler 150-200ms, tıklanabilir her şeyde `cursor-pointer`, görünür focus ring (`focus-visible:ring-2 ring-blue-100`).
- **İkon:** Mevcut inline SVG'ler korunur ama **emoji ikonlar kaldırılır** (KPI ve FileUpload'daki emojiler SVG'ye çevrilir).
- **Erişilebilirlik:** metin kontrastı ≥ 4.5:1, renk tek başına anlam taşımaz (badge'lerde metin var), `aria-sort`, `aria-label` ikon butonlarda.

### 4.2 Token düzeltmesi (minimal, frontend-only)
`globals.css`'teki `:root` değişkenleri korunur; kritik olanlar Tailwind v4 `@theme inline` bloğuna bağlanır (`--color-primary-*`, severity, status). Bu sprintte tüm hardcoded class'ları değişkene çevirme zorunluluğu yok — hedef, **yeni ortak componentlerin** tek noktadan tema alması. `--font-sans: var(--font-inter), ...` düzeltilir.

### 4.3 Badge standardı
`StatusBadge` mevcut 9 variant'ıyla tek kaynak olur; tüm inline color map'ler silinir.

| Anlam | Variant | Örnekler |
|---|---|---|
| KZ / Kritik / Gecikmiş | `critical` | KZ, GECIKMIS, IPTAL edilmiş SLA |
| KD / Yüksek | `high` | KD |
| Açık / Devam ediyor | `info` | DEVAM_EDIYOR, ACIK |
| Bekliyor / Taslak sonrası | `warning` | BEKLIYOR, MUTABAKATA_GONDERILDI |
| Kapalı / Onaylandı / Yeterli | `success` | KAPATILDI, ONAYLANDI, YETERLI |
| Taslak / İptal / Pasif | `neutral` | TASLAK, IPTAL, pasif kontrol |

### 4.4 Standart liste sayfası iskeleti
```
PageShell
└─ PageHeader (breadcrumb + başlık + açıklama + sağ aksiyonlar)
└─ KpiGrid > KpiCard[] (4-6, tümü click-to-filter)
└─ QuickFilterBar (chip'ler: Benim Kayıtlarım / Bu Ay / Gecikenler / ...)
└─ AdvancedFilterPanel (katlanabilir; arama + dropdown + multi-select + date-range)
└─ ActiveFilterChips (silinebilir chip'ler + "Tümünü temizle")
└─ EnterpriseDataTable (DataTable v2) + DataTableToolbar
```

### 4.5 Standart detay sayfası iskeleti
```
DetailShell
└─ DetailHeader (breadcrumb + ID + başlık + StatusBadge'ler + sağ aksiyonlar)
└─ Mini KPI / summary şeridi (opsiyonel)
└─ Tabs (ortak component)
   ├─ Genel Bakış  ├─ İlişkiler (RelationshipLinks)  ├─ Timeline/History
   ├─ Ekler (FileUpload)  └─ Audit Trail
```

### 4.6 Navigasyon standardı
Her ilişkili kayıt ID'si `<Link>` olur: Risk ↔ Kontrol ↔ Test ↔ Bulgu ↔ Aksiyon ↔ Takip, ayrıca Direktörlük ve Owner/Assignee. `window.location.href` kullanımı router'a çevrilir. Follow-up detayı yoksa `?tab=takip` deep-link deseni korunur (backend eklenmez).

### 4.7 Responsive kurallar
- Desktop (≥1024): tam özellikli tablo, sticky header + sticky ilk kolon.
- Tablet (768-1024): toolbar sadeleşir, `defaultHidden` kolonlar devreye girer, KPI grid 2-3 kolona düşer (`grid-cols-2 lg:grid-cols-4` deseni; mevcut sabit `grid-cols-7` gibi kullanımlar düzeltilir).
- Mobile (<768): KPI grid 2 kolon, tablo kontrollü yatay scroll (ilk kolon sticky), filtre paneli tam genişlik akordiyon. Yatay taşma yasak.

---

## 5. Ortak Component Haritası

**Prensip: sıfırdan yazmak yerine mevcut componenti genişlet.** Parantez içinde temel alınacak mevcut kod.

| Component | Durum | Kaynak / Not |
|---|---|---|
| `PageShell` | **yeni** (küçük) | Gen-2 kabuğunu (`flex flex-col h-full bg-slate-50/50 px-8 pt-8`) tek component'e alır |
| `PageHeader` | **genişlet** | Mevcut `PageHeader.tsx`; breadcrumb zorunlu prop olur |
| `Breadcrumbs` | mevcut | PageHeader içinde kalır, ayrı export |
| `KpiGrid` + `KpiCard` | **yeni** | 4 farklı inline stili tek component'e indirir: ikon (SVG), başlık, değer, variant, opsiyonel delta, `onClick` → filtre; statik variant class map'leri (dinamik interpolasyon bug'ını çözer) |
| `QuickFilterBar` | **yeni** | controls preset + findings savedViews + mapping chip idiyomlarını birleştirir; sayaç desteği |
| `AdvancedFilterPanel` | **genişlet** | `FilterBar.tsx` üzerine katlanabilir gövde, multi-select, date-range (audit-logs'taki date-range deseni buraya taşınır), user/direktörlük picker |
| `ActiveFilterChips` | **yeni** | filtre state'inden chip üretir; tek tek silme + tümünü temizle |
| `EnterpriseDataTable` | **genişlet** | `DataTable.tsx` (540 satır) üzerine: yoğunluk (comfortable/compact/ultra), sticky ilk kolon, saved views (localStorage), toolbar entegrasyonu, export placeholder, bulk-action bar |
| `DataTableToolbar` | **yeni** | Kolonlar / Yoğunluk / Kaydedilmiş Görünüm / Export / Temizle / Yenile |
| `SavedViewMenu` + `DensityControl` | **yeni** | localStorage (`view-<storageKey>`); filtre + kolon + sıralama + yoğunluk kaydeder |
| `useListPage` hook | **yeni** | fetch + loading/error + arama + filtre + quick-filter + aktif chip state'ini tek yerde toplar (API çağrıları aynen `lib/api.ts` üzerinden) |
| `DetailShell` + `DetailHeader` | **yeni** | 4 detay sayfasındaki inline header/tab iskeletini soyutlar |
| `Tabs` | **mevcut — adapte et** | `Tabs.tsx` canlıya alınır; 4 sayfadaki inline tab kopyaları silinir |
| `StatusBadge` | **mevcut** | Tüm inline color map'ler bu componente yönlendirilir |
| `RelationshipLinks` | **yeni** (küçük) | ID → route map'i tek yerde; monospace ID linki deseni |
| `Timeline` | **yeni** | findings/[id]'deki gerçek history render'ı temel alınır |
| `EmptyState` / `LoadingState` / `ErrorState` | **mevcut / yeni / yeni** | `EmptyState` var; `LoadingState` (tek spinner/skeleton dili) ve `ErrorState` (retry'lı) eklenir |
| `FileUpload` | **mevcut** | findings/[id]'deki bespoke `AttachmentList` bununla değiştirilir; emoji ikonlar SVG olur |

**Kaldırılacak duplicate/ölü kod:** `ui/Card` (veya canlandırılıp 3 lokal Card buna yönlendirilir — karar: canlandır), `ResizableTable`, `useResizableColumns`, öksüz `RiskDetailDrawer`/`RiskFormModal` dosyaları, boş `charts/` klasörü, inline tab kopyaları, 4 KPI stil kopyası, `alert()/prompt()/confirm()` çağrıları (Modal/ConfirmDialog + gerekçe input'lu Modal'a çevrilir).

---

## 6. Modül Bazlı Dönüşüm Planı

Sıra (kullanıcı direktifi + bağımlılık mantığı):

| Faz | Kapsam | İçerik |
|---|---|---|
| **0. Component Foundation** | `components/ui`, `globals.css`, hooks | PageShell, KpiCard/KpiGrid, QuickFilterBar, AdvancedFilterPanel, ActiveFilterChips, DataTable v2 (+toolbar, density, saved views, sticky ilk kolon), DetailShell/DetailHeader, Timeline, LoadingState/ErrorState, useListPage; token @theme bağlantısı; ölü kod temizliği. **Build.** |
| **1. Dashboard** | `dashboard/page.tsx` | KPI'lar KpiCard'a, dekoratif blob'lar sade karta, section başlıkları standart; MyWorkSection kart dili hizalanır. |
| **2. Risk Yönetimi** | `risks`, `risks/[id]`, alt sayfalar | Liste iskelete taşınır (kanonik olduğu için düşük efor); KPI'lara click-to-filter eklenir; detay DetailShell + ortak Tabs'a geçer; mock AUDIT_LOG tab'ı "veri bekleniyor" EmptyState'e çevrilir; gray→slate. |
| **3. Kontrol Yönetimi** | `controls`, `controls/[id]`, edit | Bespoke filtre paneli AdvancedFilterPanel+QuickFilterBar'a; `rounded-2xl` KPI'lar KpiCard'a; detay DetailShell'e; tests tablosu DataTable'a. |
| **4. Test Yönetimi** | `controls/testing` | Ay çubuğu QuickFilterBar variant'ı olur; 7'li KPI 4-6'ya konsolide + dinamik class bug'ı çözülür; WorkspacePanel korunur ama DetailShell dilinde; `prompt()` → Modal. |
| **5. Onaylar** | `approvals` | Kolon filtreleri eklenir; ApprovalDetailModal DetailShell diline yaklaşır; `prompt()` → gerekçe Modal'ı. |
| **6. Bulgu Yönetimi** | `findings`, `findings/[id]`, edit | savedViews → QuickFilterBar+SavedViewMenu; emoji KPI → KpiCard; 1041 satırlık detay DetailShell + Tabs + Timeline + FileUpload'a bölünür. |
| **7. Aksiyon Yönetimi** | `actions`, `actions/[id]` | KPI click-to-filter; turuncu buton override'ı kaldırılır; sessiz console.error → toast; detay DetailShell'e. |
| **8. Takip Çalışmaları** | `follow-ups` | Emoji KPI → KpiCard; no-op KPI onClick'leri gerçek filtreye bağlanır; overdue gösterimi actions ile ortaklaşır. |
| **9. Denetim** | `audits/plans`, `[id]`, `executions` | Liste iskelete; executions kart grid'i DataTable'a (veya standart karta); detay DetailShell'e. Demo veri görsel olarak korunur, "demo" olduğu belli edilir. |
| **10. Raporlama** | `reports/*` | Hub kartları sade standarda; export butonları standart Button/toolbar; print `<table>`'ları `grc-table` sınıfıyla hizalanır (print davranışı bozulmaz). |
| **11. Legacy temizlik** | `compliance/*`, `admin/*` | Gen-1 sayfalar PageShell+PageHeader+slate'e taşınır; admin/users elle tablosu DataTable'a; `alert()` → toast; mapping chip'leri QuickFilterBar'a. |
| **12. Final** | genel | Duplicate taraması, responsive tur, walkthrough.md güncellemesi, build + backend regression. |

Her fazın çıkışında: `npm run build:frontend` + görsel kontrol (desktop/mobile) + kısa commit.

---

## 7. Migration Stratejisi

1. **Additive-first:** Faz 0'da yeni componentler eskilerin yanına eklenir; hiçbir sayfa kırılmaz.
2. **Modül modül, build build:** Her faz kendi build doğrulamasıyla biter; kırmızı build'le faz atlanmaz.
3. **Backend'e sıfır dokunuş:** Tüm filtre/saved-view/density state'i frontend + localStorage. API çağrıları `lib/api.ts` üzerinden aynen sürer. Veri eksikse (demo sayfalar) UI standardı uygulanır, veri bağlama backlog'a yazılır.
4. **Davranış koruma:** Bulk delete, workflow butonları, print çıktıları, Excel import/export mevcut davranışıyla korunur; sadece görsel dil değişir.
5. **Ölü kod silme fazın sonunda:** Bir component tüm kullanıcılarından arındırıldığı fazda silinir, önce değil.
6. Repo'da commit edilmemiş 3 dosya var (`next.config.ts`, `login/page.tsx`, `Sidebar.tsx`) — refactor öncesi bunların commit'lenmesi/stash'lenmesi önerilir ki sprint diff'i temiz kalsın.

## 8. Riskler

| Risk | Etki | Önlem |
|---|---|---|
| DataTable v2 genişletmesi mevcut 10 kullanıcı sayfayı kırabilir | Yüksek | Yeni özellikler opsiyonel prop; mevcut prop API'si korunur; her fazda build |
| 1041 satırlık findings/[id] refactor'u davranış kaybettirebilir | Yüksek | Tab tab taşı; workflow butonlarını aynen koru; manuel smoke test |
| Dinamik class düzeltmesi renkleri değiştirebilir (şu an zaten kırık olabilir) | Düşük | KpiCard variant map'i ile bilinçli renk seçimi |
| localStorage saved-view şeması ileride backend'e taşınırsa uyumsuzluk | Orta | Şemayı versiyonla (`{v:1, ...}`) |
| Print raporları (monthly, ek6) stil değişiminden bozulabilir | Orta | Print alanlarına minimum dokunuş; print preview kontrolü |
| Legacy admin/compliance sayfalarında gizli davranış bağımlılıkları | Orta | Bu sayfalar en son faz; işlev birebir korunur |

## 9. Kabul Kriterleri

- [ ] Backend/Prisma/API dosyalarında sıfır değişiklik (`git diff --stat backend/ shared/` boş).
- [ ] Tüm liste ekranları `PageShell + PageHeader(breadcrumb'lı)` kullanıyor; inline `<h1>` kalmadı.
- [ ] Tüm KPI kartları tek `KpiCard`'dan geliyor; dinamik `${color}` interpolasyonu kalmadı; tüm KPI'lar click-to-filter.
- [ ] Filtre hiyerarşisi her listede aynı: KPI → QuickFilter chip → AdvancedFilterPanel → kolon filtresi → ActiveFilterChips.
- [ ] Tüm listeler `EnterpriseDataTable` + `DataTableToolbar` (sıralama, kolon yönetimi, yoğunluk, saved view, sticky header/ilk kolon, ortak empty/loading/error).
- [ ] 5 detay sayfası `DetailShell + DetailHeader + Tabs` kullanıyor; inline tab kopyası kalmadı.
- [ ] Tüm statü/önem göstergeleri `StatusBadge`'den; `gray-*` paleti kalmadı.
- [ ] İlişkili tüm ID'ler link (`RelationshipLinks`); `window.location.href` kalmadı.
- [ ] `alert()/prompt()/confirm()` kalmadı; feedback Toast/Modal ile.
- [ ] Ölü kod silindi: ResizableTable, useResizableColumns, öksüz RiskDetailDrawer/RiskFormModal, boş charts/.
- [ ] 375px ve 768px'te yatay taşma yok; tablolar kontrollü scroll ediyor.
- [ ] `npm run build:frontend` temiz; `npm run build:backend` + `npm run test:backend` regresyonsuz.
- [ ] walkthrough.md güncellendi.

## 10. Kapsam Dışı (sonraki sprint adayları)

- Dark mode (token altyapısı hazırlanıyor ama uygulanmıyor).
- Saved views / export'un backend'e taşınması.
- Demo sayfalara (audits, compliance/mapping, admin/parameters) gerçek API bağlanması; Header arama + bildirim backend'i.
- react-query/SWR geçişi (bu sprintte sadece `useListPage` ile tekrar azaltılır).
- Gerçek dosya upload backend'i (FileUpload UI standardı yeterli).
