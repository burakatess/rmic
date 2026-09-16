import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DashboardWorkItemsQueryDto } from './dashboard-query.dto';

// Regresyon: `enableImplicitConversion: true` global ValidationPipe ayarı,
// bir @Transform ile birlikte kullanıldığında "false" string'ini transform'a
// ulaşmadan `true` boolean'a çeviriyordu (Boolean('false') === true) — bu da
// includeCarryover=false isteğinin sessizce yok sayılmasına yol açıyordu.
// Gerçek isteğe benzer şekilde `enableImplicitConversion: true` İLE test edilir.
describe('DashboardWorkItemsQueryDto — includeCarryover transform', () => {
    const parse = (plain: Record<string, unknown>) =>
        plainToInstance(DashboardWorkItemsQueryDto, plain, { enableImplicitConversion: true });

    it('"false" string → boolean false (regresyon: implicit conversion tarafından true\'ya çevrilmemeli)', async () => {
        const dto = parse({ includeCarryover: 'false' });
        expect(dto.includeCarryover).toBe(false);
        expect(await validate(dto)).toHaveLength(0);
    });

    it('"true" string → boolean true', async () => {
        const dto = parse({ includeCarryover: 'true' });
        expect(dto.includeCarryover).toBe(true);
    });

    it('parametre verilmezse undefined kalır (servis katmanında varsayılan true uygulanır)', async () => {
        const dto = parse({});
        expect(dto.includeCarryover).toBeUndefined();
        expect(await validate(dto)).toHaveLength(0);
    });
});
