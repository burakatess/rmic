export interface DemoLoginVisibilityInput {
    nodeEnv?: string;
    configuredValue?: string;
    hostname?: string;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Demo kimlik bilgileri yalnız açık yapılandırmada veya yerel çalışma ortamında
 * gösterilir. `false` değeri localhost dahil her yerde kesin kapatma anahtarıdır.
 */
export function shouldShowDemoLogin({
    nodeEnv,
    configuredValue,
    hostname,
}: DemoLoginVisibilityInput): boolean {
    if (configuredValue === 'true') return true;
    if (configuredValue === 'false') return false;
    if (nodeEnv !== 'production') return true;
    return !!hostname && LOOPBACK_HOSTS.has(hostname.toLowerCase());
}
