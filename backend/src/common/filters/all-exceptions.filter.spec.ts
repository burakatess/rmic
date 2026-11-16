import { bodyParserError } from './all-exceptions.filter';

describe('bodyParserError', () => {
    it('gövde ayrıştırıcı hatalarını 4xx yapar, diğerlerine dokunmaz', () => {
        expect(bodyParserError({ type: 'entity.too.large', status: 413 })).toEqual({ statusCode: 413, message: 'İstek gövdesi çok büyük.' });
        expect(bodyParserError({ type: 'entity.parse.failed', status: 400 })).toEqual({ statusCode: 400, message: 'İstek gövdesi okunamadı.' });
        expect(bodyParserError(new TypeError('x'))).toBeNull();
        expect(bodyParserError({ type: 'other', status: 400 })).toBeNull();
        expect(bodyParserError({ type: 'entity.x', status: 500 })).toBeNull();
    });
});
