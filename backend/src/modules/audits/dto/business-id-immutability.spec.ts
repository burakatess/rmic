import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateFindingDto, UpdateActionDto } from './finding.dto';
import { CreateFollowUpDto, UpdateFollowUpDto } from './follow-up.dto';

const strictValidate = (value: object) =>
  validate(value, { whitelist: true, forbidNonWhitelisted: true });

describe('business identifier DTO immutability', () => {
  it.each([
    [UpdateFindingDto, { findingId: 'B-2026-9999' }],
    [UpdateActionDto, { actionId: 'A-2026-0002-99' }],
    [UpdateFollowUpDto, { followUpId: 'T-2026-0002-01-99' }],
    [UpdateFollowUpDto, { actionId: 'other-action' }],
  ])(
    '%p istemciden business identifier/hiyerarşi değişikliğini reddeder',
    async (Dto, input) => {
      const errors = await strictValidate(plainToInstance(Dto, input));
      expect(errors.length).toBeGreaterThan(0);
    },
  );

  it('yeni takipte parent actionId zorunludur', async () => {
    const errors = await strictValidate(plainToInstance(CreateFollowUpDto, {}));
    expect(errors.some((error) => error.property === 'actionId')).toBe(true);
  });
});
