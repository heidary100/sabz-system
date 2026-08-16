import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ApprovePartnerDto } from './approve-partner.dto';

describe('ApprovePartnerDto', () => {
  it('accepts a valid tier id', async () => {
    const dto = plainToInstance(ApprovePartnerDto, {
      tierId: '00000000-0000-4000-8000-000000000000',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a missing tier id', async () => {
    const dto = plainToInstance(ApprovePartnerDto, {});
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'tierId')).toBe(true);
  });

  it('rejects a non-UUID tier id', async () => {
    const dto = plainToInstance(ApprovePartnerDto, { tierId: 'tier-1' });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'tierId')).toBe(true);
  });

  it('trims review notes', async () => {
    const dto = plainToInstance(ApprovePartnerDto, {
      tierId: '00000000-0000-4000-8000-000000000000',
      reviewNotes: '  اسناد کامل است  ',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.reviewNotes).toBe('اسناد کامل است');
  });
});
