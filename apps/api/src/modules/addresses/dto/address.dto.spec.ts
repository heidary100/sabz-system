import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAddressDto } from './create-address.dto';
import { UpdateAddressDto } from './update-address.dto';

const VALID = {
  fullName: 'علی احمدی',
  phone: '09123456789',
  address: 'ساری، بلوار پاسداران، روبروی مرکز تخصصی',
};

describe('CreateAddressDto', () => {
  it('accepts a minimal valid address', async () => {
    expect(await validate(plainToInstance(CreateAddressDto, VALID))).toHaveLength(0);
  });

  it('accepts a full address with default promotion', async () => {
    const dto = plainToInstance(CreateAddressDto, {
      ...VALID,
      label: 'خانه',
      province: 'مازندران',
      city: 'ساری',
      postalCode: '4814938662',
      isDefault: true,
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects short names, bad mobiles, short addresses and bad postal codes', async () => {
    for (const patch of [
      { fullName: 'ع' },
      { phone: '0912' },
      { phone: 'not-a-mobile' },
      { address: 'کوتاه' },
      { postalCode: '12345' },
      { postalCode: 'abcdefghij' },
    ]) {
      expect(
        await validate(plainToInstance(CreateAddressDto, { ...VALID, ...patch })),
      ).not.toHaveLength(0);
    }
  });

  it('rejects missing required fields', async () => {
    expect(await validate(plainToInstance(CreateAddressDto, {}))).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(CreateAddressDto, { fullName: 'علی احمدی' })),
    ).not.toHaveLength(0);
  });
});

describe('UpdateAddressDto', () => {
  it('accepts an empty (no-op) patch', async () => {
    expect(await validate(plainToInstance(UpdateAddressDto, {}))).toHaveLength(0);
  });

  it('accepts partial patches including null clears', async () => {
    const dto = plainToInstance(UpdateAddressDto, {
      city: 'بابل',
      postalCode: null,
      isDefault: true,
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects invalid patched values', async () => {
    for (const patch of [
      { phone: '0912' },
      { address: 'کوتاه' },
      { postalCode: '123' },
      { fullName: 'ع' },
    ]) {
      expect(
        await validate(plainToInstance(UpdateAddressDto, patch)),
      ).not.toHaveLength(0);
    }
  });
});
