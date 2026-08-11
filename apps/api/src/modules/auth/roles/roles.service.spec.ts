import { PrismaService } from '../../../common/database/prisma.service';
import { AppRole } from '../enums/app-role.enum';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  let service: RolesService;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = {
      user: {
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
});
