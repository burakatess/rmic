import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * Yıllık plan uçtan uca mutlu yol (7 adım):
 * 1) plan taslağı hazırlanır → 2) onaya gönderilir (gönderen kendi planını onaylayamaz)
 * → 3) başka yönetici notla onaylar → 4) onaylı plan uygulanır → 5) ana kontrol güncellenir
 * → 6) sürüm etki sinyali Akış Sağlığı'nda görünür → 7) etki kararı uygulanınca sinyal kendiliğinden kaybolur.
 */
const API = 'http://127.0.0.1:3099/api';
const PASSWORD = 'TestE2E1234!';
const YEAR = new Date().getFullYear() + 1; // Akış Sağlığı yıl seçicisi ±1 yıl gösterir
const CONTROL_NAME = 'E2E Plan Akışı Kontrolü';

async function login(page: Page, email: string): Promise<string> {
    await page.goto('/login');
    await page.getByPlaceholder('ornek@sirket.com').fill(email);
    await page.getByPlaceholder('••••••••').fill(PASSWORD);
    await page.getByRole('button', { name: 'Giriş Yap' }).click();
    await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('accessToken'))), { timeout: 30_000 }).toBe(true);
    return (await page.evaluate(() => localStorage.getItem('accessToken')))!;
}

/** Dev sunucusu sayfayı ilk derlerken gezinti iptal edilebilir (ERR_ABORTED); kısa süre yeniden denenir. */
async function gotoStable(page: Page, url: string) {
    for (let attempt = 0; ; attempt++) {
        try { await page.goto(url, { waitUntil: 'domcontentloaded' }); return; }
        catch (e) { if (attempt >= 2 || !/ERR_ABORTED|Timeout/.test(String(e))) throw e; }
    }
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
async function json<T = any>(res: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
    expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
    return res.json() as Promise<T>;
}

test('yıllık plan: hazırla → gönder → başka yönetici onaylar → uygula → kontrol güncelle → sürüm etkisi → sinyal çözülür', async ({ browser, request }) => {
    test.setTimeout(150_000);
    const adminCtx = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
    const mgrCtx = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
    const admin = await adminCtx.newPage();
    const manager = await mgrCtx.newPage();
    const adminToken = await login(admin, 'playwright-admin@e2e.local');
    const mgrToken = await login(manager, 'playwright-manager@e2e.local');

    // ── 1) Taslak: kontrol kapsama alınır, takvim ve kontrolcüler atanır ─────────────────
    const controls = await json<{ data: Array<{ id: string; name: string }> }>(
        await request.get(`${API}/controls`, { headers: auth(adminToken), params: { search: CONTROL_NAME, limit: '50' } }));
    const control = controls.data.find(c => c.name === CONTROL_NAME);
    expect(control, 'seed kontrolü bulunamadı').toBeTruthy();
    const me = await json<{ id: string }>(await request.get(`${API}/auth/me`, { headers: auth(adminToken) }));
    const mgr = await json<{ id: string }>(await request.get(`${API}/auth/me`, { headers: auth(mgrToken) }));

    const ws0 = await json<{ draftRevision: number }>(await request.get(`${API}/controls/annual-plan/${YEAR}/workspace`, { headers: auth(adminToken) }));
    await json(await request.post(`${API}/controls/annual-plan/${YEAR}/draft/items`, {
        headers: auth(adminToken),
        data: {
            expectedRevision: ws0.draftRevision,
            items: [{ controlId: control!.id, inScope: true, frequency: 'QUARTERLY', referenceMonth: 2, assigneeId: me.id, secondControllerId: mgr.id, reason: 'Playwright plan akışı' }],
        },
    }));

    await gotoStable(admin, `/controls/annual-plan?year=${YEAR}`);
    await expect(admin.getByTestId('plan-stepper').getByText('Taslak')).toBeVisible();
    await expect(admin.getByTestId('plan-stepper').locator('li[aria-current="step"]')).toContainText('Taslak');

    // ── 2) Önizle → Onaya Gönder; gönderen kendi planını onaylayamaz ─────────────────────
    await admin.getByRole('button', { name: 'Önizle', exact: true }).click();
    await admin.getByRole('button', { name: 'Onaya Gönder' }).click();
    await expect(admin.getByTestId('plan-stepper').locator('li[aria-current="step"]')).toContainText('Onay Bekliyor');
    await expect(admin.getByText('gönderen kendi planını onaylayamaz')).toBeVisible();
    await expect(admin.getByRole('button', { name: 'Onayla', exact: true })).toHaveCount(0);

    // ── 3) Başka yönetici: gerekçesiz "Değişiklik İste" kapalı; notla onay ──────────────
    await gotoStable(manager, `/controls/annual-plan?year=${YEAR}`);
    await manager.getByRole('button', { name: 'Değişiklik İste' }).click();
    await expect(manager.getByRole('button', { name: 'Gönder' })).toBeDisabled(); // gerekçe zorunlu
    await manager.getByRole('button', { name: 'Vazgeç' }).click();
    await manager.getByRole('button', { name: 'Onayla', exact: true }).click();
    await manager.getByLabel(/Karar notu/).fill('Kapsam ve takvim uygun');
    await manager.getByRole('dialog').getByRole('button', { name: 'Onayla', exact: true }).click();
    await expect(manager.getByTestId('plan-stepper').locator('li[aria-current="step"]')).toContainText('Onaylandı');
    await manager.getByRole('button', { name: /Karar geçmişi/ }).click();
    await expect(manager.getByTestId('plan-history')).toContainText('Kapsam ve takvim uygun');
    await expect(manager.getByTestId('plan-history')).toContainText('Playwright Yönetici');

    // ── 4) Onaylı plan uygulanır ────────────────────────────────────────────────────────
    await manager.getByRole('button', { name: 'Önizle', exact: true }).click();
    await manager.getByRole('button', { name: 'Onaylanmış Planı Uygula' }).click();
    await expect(manager.getByTestId('plan-stepper')).toHaveAttribute('data-status', 'APPLIED');
    const scopeVersion = async () => {
        const c = await json<{ yearScopes: Array<{ year: number; controlVersion: number | null }> }>(await request.get(`${API}/controls/${control!.id}`, { headers: auth(adminToken) }));
        return c.yearScopes.find(s => s.year === YEAR)?.controlVersion;
    };
    const appliedVersion = await scopeVersion();
    expect(appliedVersion, 'plan uygulanınca yıl kapsamı oluşmalı').toBeDefined();

    // Sinyal henüz yok: kapsam güncel sürümde.
    const healthBefore = await json<{ data: Array<{ code: string; entityId: string }> }>(
        await request.get(`${API}/workflow-health/items`, { headers: auth(adminToken), params: { scope: 'ORG', year: String(YEAR), pageSize: '200' } }));
    expect(healthBefore.data.filter(i => i.code === 'CONTROL_VERSION_OUTDATED' && i.entityId === control!.id)).toHaveLength(0);

    // ── 5) Ana kontrol güncellenir (tanım değişimi → sürüm artar) ─────────────────────
    await gotoStable(admin, `/controls/${control!.id}/edit`);
    await admin.getByPlaceholder('Kontrolün kapsamı ve amacını detaylandırın...').fill('Yeni sürümü tetikleyen güncellenmiş kontrol tanımı');
    await admin.getByRole('button', { name: 'Değişiklikleri Kaydet' }).click();
    await expect(admin.getByText('Kontrol Sürümü Etki Analizi')).toBeVisible();   // etki analizi penceresi

    // ── 6) Sinyal Akış Sağlığı'nda görünür (karar verilmeden pencere kapatıldı: "Şimdilik Koru") ──
    await admin.getByRole('button', { name: 'Şimdilik Koru' }).click();
    const healthMid = await json<{ data: Array<{ code: string; entityId: string }> }>(
        await request.get(`${API}/workflow-health/items`, { headers: auth(adminToken), params: { scope: 'ORG', year: String(YEAR), pageSize: '200' } }));
    expect(healthMid.data.filter(i => i.code === 'CONTROL_VERSION_OUTDATED' && i.entityId === control!.id)).toHaveLength(1);
    await gotoStable(admin, '/workflow-health');
    await admin.locator('select', { has: admin.locator(`option[value="${YEAR}"]`) }).first().selectOption(String(YEAR));
    await expect(admin.getByText(CONTROL_NAME).first()).toBeVisible();

    // ── 7) Etki kararı: yeni sürüm uygulanır → sinyal kendiliğinden kaybolur ──────────────
    await gotoStable(admin, `/controls/${control!.id}/edit?versionImpact=1`);
    await expect(admin.getByText('Kontrol Sürümü Etki Analizi')).toBeVisible();
    await admin.getByRole('combobox').filter({ hasText: 'Mevcut sürümü koru' }).selectOption('APPLY_TO_NOT_STARTED');
    await admin.getByRole('button', { name: 'Kararları Uygula' }).click();
    await expect.poll(async () => {
        const h = await json<{ data: Array<{ code: string; entityId: string }> }>(
            await request.get(`${API}/workflow-health/items`, { headers: auth(adminToken), params: { scope: 'ORG', year: String(YEAR), pageSize: '200' } }));
        return h.data.filter(i => i.code === 'CONTROL_VERSION_OUTDATED' && i.entityId === control!.id).length;
    }).toBe(0);
    expect((await scopeVersion()) ?? 0).toBeGreaterThan(appliedVersion ?? 0);

    await adminCtx.close();
    await mgrCtx.close();
});
