import { BadRequestException } from '@nestjs/common';
import { MAX_PAGE_LIMIT, parsePaging, safeOrderBy } from './list-query';

describe('parsePaging', () => {
    it('varsayılanları uygular', () => {
        expect(parsePaging({}, 20)).toEqual({ page: 1, limit: 20, skip: 0 });
    });

    it('limit tavana indirilir (sınırsız take yok)', () => {
        expect(parsePaging({ limit: '1000000' }, 20).limit).toBe(MAX_PAGE_LIMIT);
        expect(parsePaging({ limit: '500' }, 20).limit).toBe(500);
    });

    it('negatif/sayısal olmayan değerler varsayılana döner', () => {
        expect(parsePaging({ page: '-3', limit: 'abc' }, 50)).toEqual({ page: 1, limit: 50, skip: 0 });
        expect(parsePaging({ page: '3', limit: '10' }, 50)).toEqual({ page: 3, limit: 10, skip: 20 });
    });
});

describe('safeOrderBy', () => {
    const fields = { id: 'id', createdAt: 'createdAt', dueDate: 'dueDate' };

    it('izinli alan ve yönü döner, varsayılanı uygular', () => {
        expect(safeOrderBy('dueDate', 'ASC', fields, 'createdAt', 'desc')).toEqual([{ dueDate: 'asc' }, { id: 'asc' }]);
        expect(safeOrderBy(undefined, undefined, fields, 'createdAt', 'desc')).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
    });

    it('id sıralamasında ikincil anahtar eklenmez; diğerlerinde kararlı sıra için id eklenir', () => {
        expect(safeOrderBy('id', 'desc', fields, 'createdAt', 'desc')).toEqual([{ id: 'desc' }]);
        expect(safeOrderBy('createdAt', 'asc', fields, 'createdAt', 'desc').at(-1)).toEqual({ id: 'asc' });
    });

    it('bilinmeyen veya ilişki alanını reddeder', () => {
        expect(() => safeOrderBy('passwordHash', 'asc', fields, 'createdAt', 'desc')).toThrow(BadRequestException);
        expect(() => safeOrderBy('owner', 'asc', fields, 'createdAt', 'desc')).toThrow(BadRequestException);
    });

    it('geçersiz yönü reddeder', () => {
        expect(() => safeOrderBy('id', 'sideways', fields, 'createdAt', 'desc')).toThrow(BadRequestException);
    });
});
