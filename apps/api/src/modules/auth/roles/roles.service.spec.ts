import { PrismaService } from '../../../common/database/prisma.service';
import { AppRole } from '../enums/app-role.enum';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  let service: RolesService;
  let prisma: {
    user: { findUnique: jest.Mock };
    role: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
      role: {
        findUnique: jest.fn(),
      },
    };
    service = new RolesService(prisma as unknown as PrismaService);
  });

  it('returns the role names assigned to the user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      roles: [
        { role: { name: AppRole.CUSTOMER } },
        { role: { name: AppRole.PARTNER } },
      ],
    });

    await expect(service.findRoleNamesByUserId('user-1')).resolves.toEqual([
      AppRole.CUSTOMER,
      AppRole.PARTNER,
    ]);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        roles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
  });

  it('returns an empty array when the user has no roles', async () => {
    prisma.user.findUnique.mockResolvedValue({ roles: [] });

    await expect(service.findRoleNamesByUserId('user-1')).resolves.toEqual([]);
  });

  it('returns an empty array when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.findRoleNamesByUserId('user-1')).resolves.toEqual([]);
  });

  it('resolves the role id by name', async () => {
    prisma.role.findUnique.mockResolvedValue({ id: 'role-partner' });

    await expect(service.findRoleIdByName(AppRole.PARTNER)).resolves.toBe(
      'role-partner',
    );

    expect(prisma.role.findUnique).toHaveBeenCalledWith({
      where: { name: AppRole.PARTNER },
      select: { id: true },
    });
  });

  it('returns null when the role row does not exist', async () => {
    prisma.role.findUnique.mockResolvedValue(null);

    await expect(service.findRoleIdByName(AppRole.PARTNER)).resolves.toBeNull();
  });

  it('uses the provided transaction client for the lookup', async () => {
    const tx = {
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'role-partner' }) },
    };

    await expect(service.findRoleIdByName(AppRole.PARTNER, tx as never)).resolves.toBe(
      'role-partner',
    );
    expect(tx.role.findUnique).toHaveBeenCalled();
    expect(prisma.role.findUnique).not.toHaveBeenCalled();
  });
});
