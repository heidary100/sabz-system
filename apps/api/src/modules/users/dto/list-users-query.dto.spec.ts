import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserStatus } from '@prisma/client';
import { AppRole } from '../../auth/enums/app-role.enum';
import { ListUsersQueryDto } from './list-users-query.dto';

describe('ListUsersQueryDto', () => {
  it('accepts an empty query', async () => {
    const dto = plainToInstance(ListUsersQueryDto, {});
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts default page and limit', async () => {
    const dto = plainToInstance(ListUsersQueryDto, {});
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBeUndefined();
    expect(dto.limit).toBeUndefined();
  });

  it('accepts valid page and limit', async () => {
    const dto = plainToInstance(ListUsersQueryDto, { page: 2, limit: 50 });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
  });

  it('rejects a page below 1', async () => {
    const dto = plainToInstance(ListUsersQueryDto, { page: 0 });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'page')).toBe(true);
  });

  it('rejects a non-integer page', async () => {
    const dto = plainToInstance(ListUsersQueryDto, { page: 1.5 });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'page')).toBe(true);
  });

  it('rejects a limit below 1', async () => {
    const dto = plainToInstance(ListUsersQueryDto, { limit: 0 });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'limit')).toBe(true);
  });

  it('rejects a limit above 100', async () => {
    const dto = plainToInstance(ListUsersQueryDto, { limit: 101 });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'limit')).toBe(true);
  });

  it('trims the search term', async () => {
    const dto = plainToInstance(ListUsersQueryDto, { search: '  علی  ' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.search).toBe('علی');
  });

  it('rejects a search term longer than 32 characters', async () => {
    const dto = plainToInstance(ListUsersQueryDto, { search: 'x'.repeat(33) });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'search')).toBe(true);
  });

  it('rejects a non-string search term', async () => {
    const dto = plainToInstance(ListUsersQueryDto, { search: 42 });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'search')).toBe(true);
  });

  it('accepts a valid status', async () => {
    const dto = plainToInstance(ListUsersQueryDto, { status: UserStatus.ACTIVE });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.status).toBe(UserStatus.ACTIVE);
  });

  it('rejects an invalid status', async () => {
    const dto = plainToInstance(ListUsersQueryDto, { status: 'NOT_A_STATUS' });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'status')).toBe(true);
  });

  it('accepts a valid role', async () => {
    const dto = plainToInstance(ListUsersQueryDto, { role: AppRole.OPERATOR });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.role).toBe(AppRole.OPERATOR);
  });

  it('rejects an invalid role', async () => {
    const dto = plainToInstance(ListUsersQueryDto, { role: 'PWNED' });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });
});