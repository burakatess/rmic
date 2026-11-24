import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * Manuel aksiyon planı (bulgudan bağımsız): formdan oluştur → 2. kontrolcü onaylar → aksiyon detayında
 * takip kodu tıklanabilir → takip detayı aksiyonun açıklamasını doğrudan gösterir ve koda geri bağlanır.
 * SHOT_DIR verilirse ekran görüntüleri oraya yazılır.
 */
const API = 'http://127.0.0.1:3099/api';
const PASSWORD = 'TestE2E1234!';
const SHOT_DIR = process.env.SHOT_DIR;
const TITLE = `Erişim gözden geçirme prosedürü ${Date.now()}`;
const DESCRIPTION = 'Yetkili erişim listeleri üç ayda bir gözden geçirilecek; sonuçlar raporlanacak.';

async function login(page: Page, email: string): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
            await page.waitForLoadState('networkidle');
            await page.getByPlaceholder('ornek@sirket.com').fill(email);
            await page.getByPlaceholder('••••••••').fill(PASSWORD);
            await page.getByRole('button', { name: 'Giriş Yap' }).click();
            await page.waitForFunction(() => Boolean(localStorage.getItem('accessToken')), undefined, { timeout: 20_000 });
            const token = await page.evaluate(() => localStorage.getItem('accessToken'));
            if (token) return token;
        } catch (e) { lastError = e; }
    }
    throw lastError ?? new Error(`oturum açılamadı: ${email}`);
}
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
async function json<T = any>(res: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
    expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
    return res.json() as Promise<T>;
}
const shot = async (page: Page, name: string) => { if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true }); };

test('manuel aksiyon planı: oluştur → onay → takip koduna tıkla → takip detayında aksiyon açıklaması', async ({ page, request }) => {
    test.setTimeout(120_000);
    const token = await login(page, 'playwright-admin@e2e.local');
    const mgrToken = (await json<{ accessToken: string }>(await request.post(`${API}/auth/login`, { data: { email: 'playwright-manager@e2e.local', password: PASSWORD } }))).accessToken;
    const me = await json<{ id: string }>(await request.get(`${API}/auth/me`, { headers: auth(token) }));
    const mgr = await json<{ id: string }>(await request.get(`${API}/auth/me`, { headers: auth(mgrToken) }));

    await page.goto('/actions/new/manual', { waitUntil: 'domcontentloaded' });
    const form = page.getByTestId('manual-action-form');
    await expect(form).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Başlık *').fill(TITLE);
    await page.getByLabel('Açıklama *').fill(DESCRIPTION);
    await page.getByLabel('Sorumlu *').selectOption(me.id);
    await page.getByLabel('Hedef tarih *').fill(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
    await page.getByLabel('1. kontrolcü *').selectOption(me.id);
    await page.getByLabel('2. kontrolcü (onaycı) *').selectOption(mgr.id);
    await shot(page, 'manual-form');
    await page.getByRole('button', { name: 'Kaydet' }).click();

    await page.waitForURL(/\/actions\/[a-z0-9]+$/, { timeout: 30_000 });
    const actionId = page.url().split('/').pop()!;
    await expect(page.getByText('Manuel aksiyon planı', { exact: true })).toBeVisible();
    // 1. kontrolcü kaydederken onaya gönderdi; 2. kontrolcü onaylar → takip oluşur.
    await json(await request.post(`${API}/workflow/ACTION/${actionId}/transition`, { headers: auth(mgrToken), data: { action: 'APPROVE' } }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    const link = page.getByTestId('followup-link').first();
    await expect(link).toBeVisible({ timeout: 30_000 });
    await expect(link).toHaveText(/^T-AM-\d{4}-\d{4}-01$/);
    await shot(page, 'manual-action-detail');

    await link.click();
    await page.waitForURL(/\/follow-ups\/[a-z0-9]+$/, { timeout: 30_000 });
    await expect(page.getByTestId('related-action-description')).toHaveText(DESCRIPTION, { timeout: 30_000 });
    await expect(page.getByTestId('related-action')).toContainText(TITLE);
    await expect(page.getByText('Manuel aksiyon planından türedi; bağlı bulgu yok.')).toBeVisible();
    await shot(page, 'manual-followup-detail');
    // Aksiyon koduna tıklayınca aksiyon detayına döner (iki yönlü).
    await page.getByTestId('related-action').getByRole('link').first().click();
    await page.waitForURL(new RegExp(`/actions/${actionId}$`), { timeout: 30_000 });
});
