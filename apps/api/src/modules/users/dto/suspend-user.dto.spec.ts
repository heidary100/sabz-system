import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SuspendUserDto } from './suspend-user.dto';

describe('SuspendUserDto', () => {
  it('accepts an empty body', async () => {
    const dto = plainToInstance(SuspendUserDto, {});
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.reason).toBeUndefined();
  });

  it('treats a null reason as absent', async () => {
    const dto = plainToInstance(SuspendUserDto, { reason: null });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.reason).toBeUndefined();
  });

  it('treats an empty or whitespace-only reason as absent', async () => {
    const empty = plainToInstance(SuspendUserDto, { reason: '' });
    const blank = plainToInstance(SuspendUserDto, { reason: '   ' });
    const emptyErrors = await validate(empty);
    const blankErrors = await validate(blank);

    expect(emptyErrors).toHaveLength(0);
    expect(blankErrors).toHaveLength(0);
    expect(empty.reason).toBeUndefined();
    expect(blank.reason).toBeUndefined();
  });

  it('trims a valid reason', async () => {
    const dto = plainToInstance(SuspendUserDto, {
      reason: '  تخلف در فروش  ',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.reason).toBe('تخلف در فروش');
  });

  it('rejects a non-string reason', async () => {
    const dto = plainToInstance(SuspendUserDto, { reason: 42 });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'reason')).toBe(true);
  });

  it('rejects an oversized reason', async () => {
    const dto = plainToInstance(SuspendUserDto, {
      reason: 'x'.repeat(501),
    });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'reason')).toBe(true);
  });
});
