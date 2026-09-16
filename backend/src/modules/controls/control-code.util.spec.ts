import { generateControlCode } from './control-code.util';

describe('generateControlCode', () => {
    it('BTK-XXXX formatında, 4 haneli sıfır dolgulu kod üretir', async () => {
        const db = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ value: 42 }]) };
        const code = await generateControlCode(db);
        expect(code).toBe('BTK-0042');
        expect(db.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('"RecordCounter"'), 'control-code');
    });

    it('9999 sonrasını kesmez, doğal olarak 5+ haneye genişler', async () => {
        const db = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ value: 10000 }]) };
        expect(await generateControlCode(db)).toBe('BTK-10000');
    });

    it('1 için dahi 4 haneli sıfır dolgu uygular', async () => {
        const db = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ value: 1 }]) };
        expect(await generateControlCode(db)).toBe('BTK-0001');
    });
});
