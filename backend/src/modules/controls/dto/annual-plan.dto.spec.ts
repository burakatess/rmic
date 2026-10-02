import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ApplyPlanDto } from './annual-plan.dto';

describe('ApplyPlanDto assignment decisions', () => {
    it('accepts explicit KEEP and REASSIGN decisions', async () => {
        const dto = plainToInstance(ApplyPlanDto, { expectedRevision: 1, assignmentDecisions: [{ controlId: 'c1', taskId: 't1', action: 'KEEP' }, { controlId: 'c1', taskId: 't2', action: 'REASSIGN' }] });
        expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    });
    it.each([
        { controlId: 'c1', taskId: 't1', action: 'DELETE' },
        { controlId: 'c1', taskId: '', action: 'KEEP' },
        { taskId: 't1', action: 'KEEP' },
        { controlId: 'c1', taskId: 't1', action: 'KEEP', userId: 'fake-actor' },
    ])('rejects invalid nested decisions %j', async decision => {
        const dto = plainToInstance(ApplyPlanDto, { expectedRevision: 1, assignmentDecisions: [decision] });
        expect((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
    });
});
