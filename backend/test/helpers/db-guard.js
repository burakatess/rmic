// E2E koruması — testler (resetDatabase TRUNCATE, prisma db push --accept-data-loss) yalnız
// AÇIKÇA tanımlı test veritabanında çalışır. Üç koşulun HEPSİ gerekir:
//   1. Açık test ortamı işareti: E2E_TEST_DATABASE=1 (.env.test / CI)
//   2. Tam olarak izin verilen veritabanı adı (ad "test" içeriyor diye kabul edilmez)
//   3. İzin verilen host:port — yerelde yalnız docker-compose.test.yml (127.0.0.1:55432),
//      CI'da (CI=true) GitHub Actions servis konteyneri (localhost:5432)
// Üretim/gerçek bağlantı yanlışlıkla verilirse veri temizliği başlamadan durur.
const ALLOWED_DATABASES = ['grc_db_test', 'grc_test_db'];
const LOCAL_ENDPOINTS = ['127.0.0.1:55432', 'localhost:55432'];
const CI_ENDPOINTS = ['localhost:5432', '127.0.0.1:5432'];

function assertTestDatabase(url, env = process.env) {
    const fail = (msg) => { throw new Error(`[db-guard] ${msg} — e2e durduruldu, veriye dokunulmadı.`); };
    if (env.E2E_TEST_DATABASE !== '1') fail('E2E_TEST_DATABASE=1 işareti yok (açık test ortamı beyanı gerekli)');
    if (env.NODE_ENV === 'production') fail('NODE_ENV=production altında e2e çalıştırılamaz');
    if (!url) fail('DATABASE_URL tanımsız');
    let parsed;
    try { parsed = new URL(url); } catch { fail('DATABASE_URL çözümlenemedi'); }
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    if (!ALLOWED_DATABASES.includes(name)) fail(`"${name}" izin verilen test veritabanlarından biri değil (${ALLOWED_DATABASES.join(', ')})`);
    const endpoint = `${parsed.hostname}:${parsed.port || '5432'}`;
    const allowed = env.CI === 'true' ? [...LOCAL_ENDPOINTS, ...CI_ENDPOINTS] : LOCAL_ENDPOINTS;
    if (!allowed.includes(endpoint)) fail(`${endpoint} izin verilen test sunucusu değil (${allowed.join(', ')})`);
    return name;
}
module.exports = { assertTestDatabase, ALLOWED_DATABASES, LOCAL_ENDPOINTS, CI_ENDPOINTS };
