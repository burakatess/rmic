import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CompleteActionDto } from '../../common/dto/attachment.dto';
import { UpdateStandaloneActionDto } from './dto/action.dto';

describe('Action DTO güvenlik sözleşmesi', () => {
    it('keyfi evidence alanını whitelist sözleşmesine dahil etmez', async () => {
        const dto = plainToInstance(CompleteActionDto, { evidence: 'https://attacker.example/x', evidenceIds: ['a'] });
        const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
        expect(errors.some(e => e.property === 'evidence')).toBe(true);
    });

    it.each(['TAMAMLANDI', 'KAPATILDI'])('%s genel update ile yazılamaz', async status => {
        const errors = await validate(plainToInstance(UpdateStandaloneActionDto, { status }));
        expect(errors.some(e => e.property === 'status')).toBe(true);
    });
});
