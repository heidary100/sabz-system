import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

describe('UpdateProfileDto', () => {
  async function errorsOf(input: unknown): Promise<{ property: string }[]> {
    const dto = plainToInstance(UpdateProfileDto, input);
    const errors = await validate(dto);
    return errors.map((error) => ({ property: error.property }));
  }

  it('accepts a payload with any subset of editable fields', async () => {
    await expect(errorsOf({})).resolves.toEqual([]);
    await expect(errorsOf({ firstName: 'Ali' })).resolves.toEqual([]);
    await expect(
      errorsOf({ firstName: 'Ali', lastName: 'Ahmadi', address: 'Tehran' }),
    ).resolves.toEqual([]);
  });

  it('rejects null names because the columns are not nullable', async () => {
    await expect(errorsOf({ firstName: null })).resolves.toEqual([
      { property: 'firstName' },
    ]);
    await expect(errorsOf({ lastName: null })).resolves.toEqual([
      { property: 'lastName' },
    ]);
  });

  it('allows null address so clients can clear it', async () => {
    await expect(errorsOf({ address: null })).resolves.toEqual([]);
  });

  it('rejects non-string values', async () => {
    await expect(errorsOf({ firstName: 123 })).resolves.toEqual([
      { property: 'firstName' },
    ]);
    await expect(errorsOf({ address: ['x'] })).resolves.toEqual([
      { property: 'address' },
    ]);
  });

  it('rejects values exceeding the maximum lengths', async () => {
    await expect(errorsOf({ firstName: 'a'.repeat(101) })).resolves.toEqual([
      { property: 'firstName' },
    ]);
    await expect(errorsOf({ lastName: 'a'.repeat(101) })).resolves.toEqual([
      { property: 'lastName' },
    ]);
    await expect(errorsOf({ address: 'a'.repeat(501) })).resolves.toEqual([
      { property: 'address' },
    ]);
  });
});
