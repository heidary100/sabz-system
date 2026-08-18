import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListAuditQueryDto } from './list-audit-query.dto';

describe('ListAuditQueryDto', () => {
  it('accepts an empty query', async () => {
    const dto = plainToInstance(ListAuditQueryDto, {});
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts default page and limit', async () => {
    const dto = plainToInstance(ListAuditQueryDto, {});
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBeUndefined();
    expect(dto.limit).toBeUndefined();
  });

  it('accepts valid page and limit', async () => {
    const dto = plainToInstance(ListAuditQueryDto, { page: 2, limit: 50 });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
  });

  it('rejects a page below 1', async () => {
    const dto = plainToInstance(ListAuditQueryDto, { page: 0 });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'page')).toBe(true);
  });

  it('rejects a non-integer page', async () => {
    const dto = plainToInstance(ListAuditQueryDto, { page: 1.5 });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'page')).toBe(true);
  });

  it('rejects a limit below 1', async () => {
    const dto = plainToInstance(ListAuditQueryDto, { limit: 0 });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'limit')).toBe(true);
  });

  it('rejects a limit above 100', async () => {
    const dto = plainToInstance(ListAuditQueryDto, { limit: 101 });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'limit')).toBe(true);
  });

  it('accepts a valid actorId and entityId', async () => {
    const id = '00000000-0000-0000-0000-000000000000';
    const dto = plainToInstance(ListAuditQueryDto, {
      actorId: id,
      entityId: id,
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid actorId', async () => {
    const dto = plainToInstance(ListAuditQueryDto, { actorId: 'not-a-uuid' });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'actorId')).toBe(true);
  });

  it('rejects an invalid entityId', async () => {
    const dto = plainToInstance(ListAuditQueryDto, { entityId: 'not-a-uuid' });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'entityId')).toBe(true);
  });

  it('trims action and entity', async () => {
    const dto = plainToInstance(ListAuditQueryDto, {
      action: '  USER_SUSPENDED  ',
      entity: '  User  ',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.action).toBe('USER_SUSPENDED');
    expect(dto.entity).toBe('User');
  });

  it('rejects an action longer than 64 characters', async () => {
    const dto = plainToInstance(ListAuditQueryDto, {
      action: 'x'.repeat(65),
    });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'action')).toBe(true);
  });

  it('rejects an entity longer than 64 characters', async () => {
    const dto = plainToInstance(ListAuditQueryDto, {
      entity: 'x'.repeat(65),
    });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'entity')).toBe(true);
  });

  it('accepts valid ISO date bounds', async () => {
    const dto = plainToInstance(ListAuditQueryDto, {
      from: '2026-08-18T00:00:00.000Z',
      to: '2026-08-18T23:59:59.999Z',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid date', async () => {
    const dto = plainToInstance(ListAuditQueryDto, { from: 'not-a-date' });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'from')).toBe(true);
  });

  it('rejects a non-string date', async () => {
    const dto = plainToInstance(ListAuditQueryDto, { to: 42 });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'to')).toBe(true);
  });
});
