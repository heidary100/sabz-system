import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RejectPartnerDto } from './reject-partner.dto';

describe('RejectPartnerDto', () => {
  it('rejects a missing reason', async () => {
    const dto = plainToInstance(RejectPartnerDto, {});
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'reason')).toBe(true);
  });

  it('rejects a whitespace-only reason', async () => {
    const dto = plainToInstance(RejectPartnerDto, { reason: '   ' });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'reason')).toBe(true);
  });

  it('trims a valid reason', async () => {
    const dto = plainToInstance(RejectPartnerDto, {
      reason: '  مدارک ناقص  ',
      reviewNotes: '  پیگیری شد  ',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.reason).toBe('مدارک ناقص');
    expect(dto.reviewNotes).toBe('پیگیری شد');
  });
});
