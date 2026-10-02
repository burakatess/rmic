import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';

const EMAIL = 'playwright-admin@e2e.local';
const PASSWORD = 'TestE2E1234!';
const tokenCache = new Map<string, string>();

async function login(page: import('@playwright/test').Page, email = EMAIL) {
    await page.goto('/login');
    const cachedAccessToken = tokenCache.get(email);
    if (cachedAccessToken) {
        await page.evaluate((token) => localStorage.setItem('accessToken', token), cachedAccessToken);
        return;
    }
    await page.getByPlaceholder('ornek@sirket.com').fill(email);
    await page.getByPlaceholder('••••••••').fill(PASSWORD);
    await page.getByRole('button', { name: 'Giriş Yap' }).click();
    await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('accessToken')))).toBe(true);
    tokenCache.set(email, (await page.evaluate(() => localStorage.getItem('accessToken')))!);
}

test('oturum açar ve yeni bulguda yalnız KZ/KD seçeneklerini gösterir', async ({ page }) => {
    await login(page);
    await page.goto('/findings/new');
    await expect(page.getByRole('heading', { name: 'Yeni Bulgu Oluştur' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'KZ' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'KD' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Orta' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Düşük' })).toHaveCount(0);
});

test('kimliği doğrulanmamış kullanıcı korumalı bulgu ekranından girişe yönlendirilir', async ({ page }) => {
    await page.goto('/findings');
    await expect(page).toHaveURL(/\/login/);
});

test('bağlantı hatasından sonra kullanıcı giriş işlemini yeniden deneyebilir', async ({ page }) => {
    await page.route('**/api/auth/login', (route) => route.abort('connectionfailed'), { times: 1 });
    await page.goto('/login');
    await page.getByPlaceholder('ornek@sirket.com').fill(EMAIL);
    await page.getByPlaceholder('••••••••').fill(PASSWORD);
    await page.getByRole('button', { name: 'Giriş Yap' }).click();
    await expect(page.getByText('Giriş başarısız')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Giriş Yap' })).toBeEnabled();

    await page.getByRole('button', { name: 'Giriş Yap' }).click();
    await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('accessToken')))).toBe(true);
});

test('geçersiz veya süresi dolmuş token korumalı sayfada temizlenip girişe yönlendirilir', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.setItem('accessToken', 'expired-or-invalid-token'));
    await page.goto('/findings');
    await expect(page).toHaveURL(/\/login/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('accessToken'))).toBeNull();
});

test('onaylı bulgulu testin kontrol etkinliği envanterde tutarlı görünür', async ({ page }) => {
    await login(page);
    await page.goto('/controls');

    const controlRow = page.getByRole('row').filter({ hasText: 'E2E Test Kontrolü' });
    await expect(controlRow).toHaveCount(1);
    await expect(controlRow).toContainText('Etkin Değil');
});

test('kontrol envanteri BT ve BT dışı kontrollere göre filtrelenir', async ({ page }) => {
    await login(page);
    await page.goto('/controls');

    const typeFilter = page.locator('select:has(option[value="BT_DISI"])');
    await typeFilter.selectOption('BT_DISI');
    await expect(page.getByRole('row').filter({ hasText: 'E2E BT Dışı Kontrol' })).toHaveCount(1);
    await expect(page.getByRole('row').filter({ hasText: 'E2E Test Kontrolü' })).toHaveCount(0);

    await typeFilter.selectOption('BT');
    await expect(page.getByRole('row').filter({ hasText: 'E2E Test Kontrolü' })).toHaveCount(1);
    await expect(page.getByRole('row').filter({ hasText: 'E2E BT Dışı Kontrol' })).toHaveCount(0);
});

test('bulgu detayında kalıcı durum geçmişi kullanıcıya gösterilir', async ({ page }) => {
    await login(page);
    await page.goto('/findings');
    await page.getByRole('link', { name: /2026\.BT\.PW01/ }).click();
    await page.getByRole('button', { name: /Tarihçe/ }).click();

    await expect(page.getByText('Bulgu Güncellendi')).toBeVisible();
    await expect(page.getByText('Playwright geçmiş kaydı ekranda korunuyor.')).toBeVisible();
});

test('risk ve kontrol ilişkisi iki detay ekranında da görünür', async ({ page }) => {
    await login(page);
    await page.goto('/controls');
    await page.getByRole('row').filter({ hasText: 'E2E Test Kontrolü' }).getByRole('link', { name: /E2E-CTRL-/ }).click();
    await page.getByRole('button', { name: /Eşleşen Riskler/ }).click();
    await expect(page.getByRole('link', { name: /R-PW-001/ })).toContainText('Playwright ilişkili risk');

    await page.getByRole('link', { name: /R-PW-001/ }).click();
    await page.getByRole('button', { name: /İç Kontrol Çalışmaları/ }).click();
    await expect(page.getByRole('link', { name: /E2E Test Kontrolü/ })).toBeVisible();
});

test('tek kontrol testine bağlı birden fazla bulgu kontrol detayında birlikte görünür', async ({ page }) => {
    await login(page);
    await page.goto('/controls');
    await page.getByRole('row').filter({ hasText: 'E2E Test Kontrolü' }).getByRole('link', { name: /E2E-CTRL-/ }).click();

    await expect(page.getByText('2 Açık Bulgu', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Etkin Değil', { exact: true }).first()).toBeVisible();
    const findingSummary = page.getByText(/Hata\/Bulgu:/);
    await expect(findingSummary).toContainText('2026.BT.PW01');
    await expect(findingSummary).toContainText('2026.BT.PW02');
    await page.getByRole('button', { name: /Bulgular & Aksiyonlar/ }).click();
    await expect(page.getByText('2026.BT.PW01', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('2026.BT.PW02', { exact: true }).first()).toBeVisible();
});

test('yıllık planda filtreliyken tümünü seç yalnız görünür satırları seçer', async ({ page }) => {
    await login(page);
    await page.goto('/controls/annual-plan?year=2026');
    const search = page.getByPlaceholder('Kod veya tanım ara...');
    await search.fill('E2E BT Dışı Kontrol');
    await expect(page.getByRole('row').filter({ hasText: 'E2E BT Dışı Kontrol' })).toHaveCount(1);
    await expect(page.getByRole('row').filter({ hasText: 'E2E Test Kontrolü' })).toHaveCount(0);

    await page.locator('table').first().locator('thead input[type="checkbox"]').check();
    await expect(page.getByText('1 seçili', { exact: true })).toBeVisible();
});

test('ay ve direktörlük filtresiyle ekrandaki bulgular Excel dışa aktarımıyla aynıdır', async ({ page }) => {
    await login(page);
    await page.goto('/reports/bulgu-takip');
    await page.getByRole('combobox').filter({ has: page.locator('option', { hasText: 'Playwright Test Direktörlüğü' }) }).selectOption({ label: 'Playwright Test Direktörlüğü' });
    await page.getByRole('button', { name: 'Raporu Oluştur' }).click();
    await expect(page.getByText('2026.BT.PW01', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('2026.BT.PW02', { exact: true }).first()).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Excel' }).click();
    const download = await downloadPromise;
    const workbookPath = await download.path();
    expect(workbookPath).not.toBeNull();

    const workbook = XLSX.readFile(workbookPath!);
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets['1-Tespit Edilen Bulgular']);
    expect(rows.map(row => row['Bulgu No']).sort()).toEqual(['2026.BT.PW01', '2026.BT.PW02']);
    expect(rows.every(row => row['Direktörlük'] === 'Playwright Test Direktörlüğü')).toBe(true);
});

test('kontrol envanterinde pasifleştirme ve yeniden aktifleştirme döngüsü çalışır', async ({ page }) => {
    await login(page);
    await page.goto('/controls');
    const row = page.getByRole('row').filter({ hasText: 'E2E BT Dışı Kontrol' });

    await row.getByTitle('Pasifleştir').click();
    await expect(row).toContainText('Pasif');
    await row.getByTitle('Aktifleştir').click();
    await expect(row).toContainText('Aktif');
});

test('yeni kontrol formu zorunlu alanları doğrular ve Unicode içerikle kayıt oluşturur', async ({ page }) => {
    await login(page);
    await page.goto('/controls/new');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByText('Kontrol Kodu zorunludur.')).toBeVisible();

    await page.getByPlaceholder('BTK.0001').fill('BTK.9090');
    await page.getByPlaceholder('Kontrolün kapsamı ve amacını detaylandırın...').fill('İş sürekliliği, erişim ve bütünlük kontrolü — ğüşöçıİ');
    await page.getByPlaceholder('Kontrolün dayandığı mevzuat maddesi, madde numarası ve yönetmelik adları...').fill('CBDDO Bilgi ve İletişim Güvenliği Rehberi');
    await page.getByPlaceholder(/1\. Test kanıtını/).fill('1. Kanıtı doğrula\n2. Sonucu kaydet');
    await page.getByRole('combobox').filter({ has: page.locator('option', { hasText: 'Playwright Test Direktörlüğü' }) }).selectOption({ label: 'Playwright Test Direktörlüğü' });
    await page.getByPlaceholder('Planlama veya icraya yönelik ek notlar...').fill('Türkçe karakterli otomasyon kaydı.');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();

    await expect(page).toHaveURL(/\/controls$/);
    await expect(page.getByRole('row').filter({ hasText: 'BTK.9090' })).toHaveCount(1);
});

test('aksiyon listeleri sorumlu kullanıcı ve gecikme filtresine göre ayrılır', async ({ page }) => {
    await login(page);
    await page.goto('/actions');
    await page.getByRole('button', { name: /Benim Aksiyonlarım/ }).click();
    await expect(page.getByRole('link', { name: 'A-PW-001' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'A-PW-002' })).toHaveCount(0);

    await page.getByRole('button', { name: /Gecikenler/ }).click();
    await expect(page.getByRole('link', { name: 'A-PW-001' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'A-PW-002' })).toHaveCount(0);

    await page.evaluate(() => localStorage.clear());
    await login(page, 'playwright-auditor@e2e.local');
    await page.goto('/actions');
    await page.getByRole('button', { name: /Benim Aksiyonlarım/ }).click();
    await expect(page.getByRole('link', { name: 'A-PW-002' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'A-PW-001' })).toHaveCount(0);
});

test('gecikmiş ve ertelenmiş takipler takip listesinde yeniden görünür', async ({ page }) => {
    await login(page);
    await page.goto('/follow-ups');
    await expect(page.getByText('2026.10.BT.PW02', { exact: true })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: '2026.10.BT.PW02' })).toContainText('Ertelendi');

    await page.getByRole('button', { name: /Gecikmiş/ }).click();
    await expect(page.getByText('2026.09.BT.PW01', { exact: true })).toBeVisible();
    await expect(page.getByText('2026.10.BT.PW02', { exact: true })).toHaveCount(0);
});

test('doğrudan bulgu risk ilişkisi ve takip formu kayıtlı alanlarla yeniden açılır', async ({ page }) => {
    await login(page);
    await page.goto('/findings');
    await page.getByRole('link', { name: /2026\.BT\.PW01/ }).click();

    await page.getByRole('button', { name: /İlişkili Riskler/ }).click();
    await expect(page.getByRole('link', { name: /R-PW-001/ })).toContainText('Playwright ilişkili risk');

    await page.getByRole('button', { name: /Takip Çalışmaları/ }).click();
    const followUpLink = page.getByRole('link', { name: '2026.10.BT.PW02' });
    await followUpLink.locator('xpath=../../..').getByRole('button', { name: 'Düzenle' }).click();
    await expect(page.getByPlaceholder('Birimin bu takip dönemindeki yanıtı…')).toHaveValue('Birim düzeltme çalışmalarını sürdürüyor.');
    await expect(page.getByPlaceholder(/Bu takip dönemindeki bulgunun güncel durumunu/)).toHaveValue('Kontrol iyileştirmesi devam ediyor.');
    await expect(page.getByPlaceholder("İKS'nin bu takip çalışmasına yönelik değerlendirmesi…")).toHaveValue('Kanıtların yeni tarihte tekrar incelenmesi gerekiyor.');
    await expect(page.getByPlaceholder('Kısa değerlendirme notu…')).toHaveValue('Eksik çalışma nedeniyle ileri tarihe ertelendi.');
});

test('ikinci kontrolcü değişiklik gerekçesi bulgu tarihçesinde görünür', async ({ page }) => {
    await login(page);
    await page.goto('/findings');
    await page.getByRole('link', { name: /2026\.BT\.PW01/ }).click();
    await page.getByRole('button', { name: /Tarihçe/ }).click();

    await expect(page.getByText('FOLLOWUP_SECOND_CONTROLLER_CHANGED')).toBeVisible();
    await expect(page.getByText('İkinci kontrolcü gerekçeli olarak değiştirildi.')).toBeVisible();
});

test('kontrol testi taslağı ve kanıtı sayfa yeniden açıldığında korunur', async ({ page }) => {
    await login(page);
    await page.goto('/controls/testing');
    const draftHref = await page.getByRole('link', { name: '2026.KBT-PWDRAFT', exact: true }).getAttribute('href');
    expect(draftHref).toBeTruthy();
    await page.goto(draftHref!);
    await expect(page.getByText('taslak-kanit.pdf', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder(/Gerçekleştirilen test\/inceleme/)).toHaveValue('Kaydedilmiş Playwright taslak değerlendirmesi');
    await expect(page.getByPlaceholder('İncelenen kanıtların kısa özeti...')).toHaveValue('Taslak kanıt özeti yeniden açıldığında korunur.');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('taslak-kanit.pdf', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder(/Gerçekleştirilen test\/inceleme/)).toHaveValue('Kaydedilmiş Playwright taslak değerlendirmesi');
});

test('onaylı kontrol testinde kanıt görünür ve değiştirme arayüzü kilitlidir', async ({ page }) => {
    await login(page);
    await page.goto('/controls/testing');
    await page.getByRole('link', { name: '2026.KBT-PWLOCK', exact: true }).click();

    await expect(page.getByText('onayli-kanit.pdf', { exact: true })).toBeVisible();
    await expect(page.getByText('Onaylanmış testin kanıtları değiştirilemez. Önce SYSTEM_ADMIN final onayı iptal etmeli.')).toBeVisible();
    await expect(page.getByText(/Kanıt Yükle/)).toHaveCount(0);
});

test('yıllık plan kaydedilmiş taslağı yeniden açar ve geri alırken dönem kayıtlarını korur', async ({ page }) => {
    await login(page);
    await page.goto('/controls/annual-plan?year=2026&scope=ORG');
    await expect(page.getByText('Değişiklik Var', { exact: true })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'E2E BT Dışı Kontrol' })).toContainText('Değişti');

    await page.reload();
    await expect(page.getByText('Değişiklik Var', { exact: true })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'E2E BT Dışı Kontrol' })).toContainText('Değişti');

    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Değişiklikleri Geri Al' }).click();
    await expect(page.getByText('Değişiklik Var', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('row').filter({ hasText: 'E2E Test Kontrolü' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'E2E BT Dışı Kontrol' })).toBeVisible();
});

test('yıllık planda iki seçili dönem kontrolüne toplu kontrolcü atanır', async ({ page }) => {
    await login(page);
    await page.goto('/controls/annual-plan?year=2026&scope=ORG');
    await page.getByRole('button', { name: 'Kontrolcü Atamaları' }).click();
    const table = page.locator('table').first();
    await expect(table.getByRole('row').filter({ hasText: 'E2E Test Kontrolü' })).toBeVisible();
    await expect(table.getByRole('row').filter({ hasText: 'E2E BT Dışı Kontrol' })).toBeVisible();
    await table.locator('thead input[type="checkbox"]').check();
    await expect(page.getByText('2 seçili', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Kontrolcü Ata', exact: true }).click();
    await page.getByRole('dialog').getByRole('combobox').selectOption({ label: 'Playwright Denetçi' });
    await page.getByRole('dialog').getByRole('button', { name: 'Uygula' }).click();
    await expect(page.getByText('2 kontrole atama uygulandı.')).toBeVisible();
    await expect(page.getByText('2 seçili', { exact: true })).toBeVisible();
});
