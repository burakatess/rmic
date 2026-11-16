import { ApiError } from './api';

/**
 * Ana kayıt isteğinin neden başarısız olduğunu kullanıcıya doğru anlatmak için ortak
 * sınıflandırma. 403 / 404 / ağ / sunucu hatası aynı "bulunamadı" mesajına indirgenmez.
 */
export type LoadErrorKind = 'not-found' | 'forbidden' | 'network' | 'server';

export interface LoadError {
    kind: LoadErrorKind;
    title: string;
    description: string;
    retryable: boolean;
}

export function classifyLoadError(err: unknown, entity: string): LoadError {
    if (err instanceof ApiError) {
        if (err.status === 404) {
            return { kind: 'not-found', title: `${entity} bulunamadı`, description: `Aradığınız ${entity.toLocaleLowerCase('tr')} kaydı mevcut değil veya erişiminiz dışında.`, retryable: false };
        }
        if (err.status === 403) {
            return { kind: 'forbidden', title: 'Erişim yetkiniz yok', description: `Bu ${entity.toLocaleLowerCase('tr')} kaydını görüntüleme yetkiniz bulunmuyor.`, retryable: false };
        }
        if (err.status > 0) {
            return { kind: 'server', title: `${entity} yüklenemedi`, description: 'Sunucu isteği tamamlayamadı. Biraz sonra tekrar deneyin.', retryable: true };
        }
    }
    // fetch ağ hatasında TypeError fırlatır (ApiError oluşmaz)
    return { kind: 'network', title: `${entity} yüklenemedi`, description: 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.', retryable: true };
}
