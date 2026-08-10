import { PrismaService } from '../../common/database/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    service = new AuthService(prisma as unknown as PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return a user when a matching mobile is found', async () => {
    const user = { id: 'uuid', mobile: '+989123456789' };
    prisma.user.findUnique.mockResolvedValue(user);

    const result = await service.findUserByMobile('+989123456789');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { mobile: '+989123456789' },
    });
    expect(result).toEqual(user);
  });

  it('should return null when no user matches the mobile', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.findUserByMobile('+989000000000');

    expect(result).toBeNull();
  });
});
