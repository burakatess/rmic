// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assertTestDatabase } = require('../../../test/helpers/db-guard');

describe('E2E veritabanı koruması', () => {
    const ok = { E2E_TEST_DATABASE: '1', NODE_ENV: 'test' };

    it('yerel test konteyneri (127.0.0.1:55432/grc_db_test) kabul edilir', () => {
        expect(assertTestDatabase('postgresql://u:p@127.0.0.1:55432/grc_db_test', ok)).toBe('grc_db_test');
    });

    it('açık test işareti yoksa durur', () => {
        expect(() => assertTestDatabase('postgresql://u:p@127.0.0.1:55432/grc_db_test', { NODE_ENV: 'test' })).toThrow('E2E_TEST_DATABASE');
    });

    it('adı "test" içerse de izin listesinde olmayan DB reddedilir', () => {
        expect(() => assertTestDatabase('postgresql://u:p@127.0.0.1:55432/grc_db_test_backup', ok)).toThrow('izin verilen');
        expect(() => assertTestDatabase('postgresql://u:p@127.0.0.1:55432/grc_db', ok)).toThrow('izin verilen');
    });

    it('geliştirme/üretim sunucusu (localhost:5432) yerelde reddedilir; yalnız CI servisinde kabul', () => {
        expect(() => assertTestDatabase('postgresql://u:p@localhost:5432/grc_db_test', ok)).toThrow('izin verilen test sunucusu');
        expect(assertTestDatabase('postgresql://u:p@localhost:5432/grc_test_db', { ...ok, CI: 'true' })).toBe('grc_test_db');
        expect(() => assertTestDatabase('postgresql://u:p@db.kurum.local:5432/grc_db_test', { ...ok, CI: 'true' })).toThrow('izin verilen test sunucusu');
    });

    it('NODE_ENV=production altında durur', () => {
        expect(() => assertTestDatabase('postgresql://u:p@127.0.0.1:55432/grc_db_test', { ...ok, NODE_ENV: 'production' })).toThrow('production');
    });
});
