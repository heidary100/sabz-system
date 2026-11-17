import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateMerchMediaDto } from './update-merch-media.dto';

function validate(input: Record<string, unknown>): string[] {
  return validateSync(plainToInstance(UpdateMerchMediaDto, input)).flatMap(
    (error) => Object.values(error.constraints ?? {}),
  );
}

describe('UpdateMerchMediaDto', () => {
  it('accepts a string or null alt text and omitted alt text', () => {
    expect(validate({ altFa: 'متن جایگزین' })).toEqual([]);
    expect(validate({ altFa: null })).toEqual([]);
    expect(validate({})).toEqual([]);
  });

  it('rejects non-string and overlong alt text', () => {
    expect(validate({ altFa: 42 }).length).toBeGreaterThan(0);
    expect(validate({ altFa: 'x'.repeat(161) }).length).toBeGreaterThan(0);
  });
});
