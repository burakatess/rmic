import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * Kontrol detayı: süreç sorumluları yıl kapsamından gelir, test planında gerçek test sorumlusu ve
 * iş akışı durumu görünür, değişiklik geçmişi alan farkıyla listelenir, yönetici pasifleştirip
 * yeniden aktifleştirebilir. SHOT_DIR verilirse ekran görüntüleri oraya yazılır.
 */
const API = 'http://127.0.0.1:3099/api';
const PASSWORD = 'TestE2E1234!';
const YEAR = new Date().getFullYear();
const CONTROL_NAME = 'E2E Plan Akışı Kontrolü';
const SHOT_DIR = process.env.SHOT_DIR;

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

test('kontrol detayı: yıl bazlı sorumlular, test planı, değişiklik geçmişi, pasifleştir/aktifleştir', async ({ page, request }) => {
    test.setTimeout(120_000);
    const token = await login(page, 'playwright-admin@e2e.local');
    const mgrToken = (await json<{ accessToken: string }>(await request.post(`${API}/auth/login`, { data: { email: 'playwright-manager@e2e.local', password: PASSWORD } }))).accessToken;
    const me = await json<{ id: string }>(await request.get(`${API}/auth/me`, { headers: auth(token) }));
    const mgr = await json<{ id: string }>(await request.get(`${API}/auth/me`, { headers: auth(mgrToken) }));
    const list = await json<{ data: Array<{ id: string; name: string; controlId: string }> }>(
        await request.get(`${API}/controls`, { headers: auth(token), params: { search: CONTROL_NAME, limit: '50' } }));
    const control = list.data.find(c => c.name === CONTROL_NAME)!;
    expect(control).toBeTruthy();

    // Bu yılın kapsamı: 1. kontrolcü yönetici, 2. kontrolcü admin (zaten varsa dokunulmaz).
    const scopeRes = await request.post(`${API}/controls/${control.id}/scope`, {
        headers: auth(token), data: { years: [YEAR], frequency: 'QUARTERLY', assigneeId: mgr.id, secondControllerId: me.id, includePastPeriods: true },
    });
    expect([200, 201, 400, 409]).toContain(scopeRes.status());
    // Geçmişte alan farkı görünsün.
    await json(await request.put(`${API}/controls/${control.id}`, { headers: auth(token), data: { notes: `Detay ekranı notu ${Date.now()}` } }));

    await page.goto(`/controls/${control.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: CONTROL_NAME })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Sorumlu (1. kontrolcü)')).toBeVisible();
    await expect(page.getByText(`${YEAR} dönem kontrolü`)).toBeVisible();
    await shot(page, 'detail-summary');

    await page.getByRole('tab', { name: /Test Planı/ }).click();
    const row = page.getByTestId('control-test-row').first();
    await expect(row).toBeVisible();
    await expect(row).not.toContainText('Atanmamış'); // gerçek test sorumlusu (eskiden kontrol sahibi yazıyordu)
    await shot(page, 'detail-tests');

    await page.getByRole('tab', { name: /Bulgular/ }).click();
    await shot(page, 'detail-findings');

    await page.getByRole('tab', { name: 'Değişiklik Geçmişi' }).click();
    const history = page.getByTestId('control-history');
    await expect(history).toContainText('Kontrol güncellendi');
    await expect(history).toContainText('Notlar');
    await shot(page, 'detail-history');

    // Pasifleştir → rozet ve geçmiş; sonra yeniden aktifleştir (sonraki testleri etkilemesin).
    await page.getByRole('button', { name: 'Pasifleştir' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Pasifleştir' }).click();
    await expect(page.getByText('Envanterde pasif', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Aktifleştir' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Aktifleştir' }).click();
    await expect(page.getByText('Envanterde pasif', { exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Değişiklik Geçmişi' }).click();
    await expect(page.getByTestId('control-history')).toContainText('Envanterde aktifleştirildi');
});
