import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Yerel + LDAP kullanıcı yönetimi — GERÇEK OpenLDAP'a karşı (backend/test/ldap/setup-ldap-test.sh).
 * E2E_LDAP_HOST yoksa atlanır. Backend SETTINGS_ENCRYPTION_KEY ile çalışmalıdır.
 * SHOT_DIR verilirse ekran görüntüleri yazılır.
 */
const LDAP_HOST = process.env.E2E_LDAP_HOST;
const SHOT_DIR = process.env.SHOT_DIR;
const shot = async (page: Page, name: string) => { if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true }); };
const SUFFIX = Date.now();

async function login(page: Page, id: string, password: string) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
            await page.waitForLoadState('networkidle');
            await page.getByPlaceholder('ornek@sirket.com').fill(id);
            await page.getByPlaceholder('••••••••').fill(password);
            await page.getByRole('button', { name: 'Giriş Yap' }).click();
            await page.waitForFunction(() => Boolean(localStorage.getItem('accessToken')), undefined, { timeout: 20_000 });
            return;
        } catch (e) { lastError = e; }
    }
    throw lastError;
}

test.skip(!LDAP_HOST, 'E2E_LDAP_HOST tanımlı değil (test LDAP sunucusu yok)');

test('LDAP/LDAPS bağlantısı ekle → test et → LDAP kullanıcısını dizinden ekle → kurum şifresiyle giriş', async ({ page, browser }) => {
    test.setTimeout(180_000);
    const ca = readFileSync(join(__dirname, '../../backend/test/ldap/certs/ca.crt'), 'utf8');
    await login(page, 'playwright-admin@e2e.local', 'TestE2E1234!');
    await page.goto('/admin/integrations', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('ldap-connections')).toBeVisible({ timeout: 30_000 });

    const addConnection = async (name: string, protocol: 'LDAP' | 'LDAPS', port: number, withCa: boolean) => {
        await page.getByRole('button', { name: '+ Bağlantı ekle' }).click();
        const form = page.getByTestId('ldap-form');
        await form.getByLabel('Bağlantı adı *').fill(name);
        await form.getByLabel('Sunucu (ana bilgisayar adı / IP) *').fill(LDAP_HOST!);
        await form.getByLabel(protocol === 'LDAPS' ? 'LDAPS (TLS, 636)' : 'LDAP (389)').check();
        await expect(form.getByLabel('Port')).toHaveValue(protocol === 'LDAPS' ? '636' : '389'); // varsayılan port
        await form.getByLabel('Port').fill(String(port));
        await form.getByLabel('Temel DN (Base DN) *').fill('dc=rmic,dc=test');
        await form.getByLabel('Servis hesabı DN').fill('cn=admin,dc=rmic,dc=test');
        await form.getByLabel('Servis hesabı şifresi').fill('LdapAdmin!2026');
        if (withCa) {
            await form.getByRole('button', { name: /Gelişmiş/ }).click();
            await form.getByLabel('Kurum CA sertifikası (PEM, isteğe bağlı)').fill(ca);
        }
        await page.getByRole('button', { name: 'Bağlantıyı test et' }).click();
        await expect(page.getByTestId('ldap-test-result')).toContainText('Bağlantı başarılı', { timeout: 20_000 });
        await shot(page, `ldap-form-${protocol.toLowerCase()}`);
        await page.getByRole('button', { name: 'Kaydet' }).click();
        await expect(page.getByTestId('ldap-connection-row').filter({ hasText: name })).toBeVisible();
    };
    await addConnection(`Test LDAP ${SUFFIX}`, 'LDAP', 1389, false);
    await addConnection(`Test LDAPS ${SUFFIX}`, 'LDAPS', 1636, true);
    await expect(page.getByTestId('ldap-connection-row').filter({ hasText: `Test LDAPS ${SUFFIX}` })).toContainText(`ldaps://${LDAP_HOST}:1636`);
    await shot(page, 'ldap-connections');

    // Kullanıcı Yönetimi → Yeni Kullanıcı → LDAP'tan ekle
    await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Yeni Kullanıcı/ }).click();
    await page.getByRole('tab', { name: /LDAP'tan ekle/ }).click();
    const imp = page.getByTestId('ldap-user-import');
    await imp.getByLabel('LDAP bağlantısı').selectOption({ label: `Test LDAPS ${SUFFIX} (LDAPS:1636)` });
    await imp.getByLabel('Dizinde ara').fill('ayse');
    await imp.getByRole('button', { name: 'Ara' }).click();
    const pick = imp.getByLabel('ayse.ldap seç');
    await expect(pick).toBeVisible({ timeout: 20_000 });
    if (await pick.isEnabled()) { // önceki koşudan eklenmişse "Zaten ekli"
        await pick.check();
        await imp.getByLabel('Rol').selectOption({ index: 1 });
        await shot(page, 'ldap-user-import');
        await imp.getByRole('button', { name: 'LDAP kullanıcısını ekle' }).click();
    } else {
        await page.keyboard.press('Escape');
    }
    await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('row').filter({ hasText: 'ayse.ldap@rmic.test' })).toContainText('LDAP', { timeout: 30_000 });
    await shot(page, 'users-with-ldap');

    // Kaynak süzgeci: "LDAP Kullanıcısı" kartı yalnız LDAP kullanıcılarını bırakır; Yerel seçilince LDAP kullanıcısı çıkar.
    await page.getByText('LDAP Kullanıcısı', { exact: true }).click();
    const rows = page.getByRole('row').filter({ hasText: '@' });
    await expect(rows.first()).toBeVisible();
    for (const t of await rows.allInnerTexts()) expect(t).toContain('LDAP');
    await expect(page.getByRole('row').filter({ hasText: 'playwright-admin@e2e.local' })).toHaveCount(0);
    await shot(page, 'users-ldap-filter');
    await page.getByText('LDAP Kullanıcısı', { exact: true }).click(); // süzgeci kaldır
    await expect(page.getByRole('row').filter({ hasText: 'playwright-admin@e2e.local' })).toHaveCount(1);

    // LDAP kullanıcısı kurum kullanıcı adı + LDAP şifresiyle girer.
    const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
    const p2 = await ctx.newPage();
    await login(p2, 'ayse.ldap', 'Dizin!2026');
    await expect(p2).not.toHaveURL(/\/login/);
    await ctx.close();
});
