import { ApiError } from '@/lib/api';
import { classifyLoadError } from '@/lib/load-error';

describe('classifyLoadError — 403/404/ağ/sunucu ayrımı', () => {
    it('404 ve 403 farklı mesaj; ikisi de yeniden denenmez', () => {
        const nf = classifyLoadError(new ApiError('x', 404), 'Bulgu');
        const fb = classifyLoadError(new ApiError('x', 403), 'Bulgu');
        expect(nf).toMatchObject({ kind: 'not-found', title: 'Bulgu bulunamadı', retryable: false });
        expect(fb).toMatchObject({ kind: 'forbidden', title: 'Erişim yetkiniz yok', retryable: false });
        expect(nf.description).not.toEqual(fb.description);
    });

    it('5xx sunucu hatası ve fetch ağ hatası "bulunamadı" sayılmaz, yeniden denenebilir', () => {
        expect(classifyLoadError(new ApiError('x', 500), 'Risk')).toMatchObject({ kind: 'server', title: 'Risk yüklenemedi', retryable: true });
        expect(classifyLoadError(new TypeError('Failed to fetch'), 'Risk')).toMatchObject({ kind: 'network', retryable: true });
    });
});
