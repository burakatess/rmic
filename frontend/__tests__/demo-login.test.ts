import { shouldShowDemoLogin } from '@/lib/demo-login';

describe('demo login görünürlüğü', () => {
    it('production build localhost üzerinde demo hesapları gösterir', () => {
        expect(shouldShowDemoLogin({ nodeEnv: 'production', hostname: 'localhost' })).toBe(true);
        expect(shouldShowDemoLogin({ nodeEnv: 'production', hostname: '127.0.0.1' })).toBe(true);
    });

    it('production kurumsal hostta varsayılan olarak gizler', () => {
        expect(shouldShowDemoLogin({ nodeEnv: 'production', hostname: 'grc.example.com' })).toBe(false);
    });

    it('açık yapılandırma hosttan bağımsız çalışır ve false kesin kapatır', () => {
        expect(shouldShowDemoLogin({ nodeEnv: 'production', configuredValue: 'true', hostname: 'grc.example.com' })).toBe(true);
        expect(shouldShowDemoLogin({ nodeEnv: 'development', configuredValue: 'false', hostname: 'localhost' })).toBe(false);
    });
});
