import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: {
    auditLog: {
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      auditLog: {
        create: jest.fn(),
      },
    };
    service = new AuditService(prisma as unknown as PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('persists an audit log entry', async () => {
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

    await service.log({
      userId: 'user-1',
      action: 'PROFILE_UPDATE',
      entity: 'UserProfile',
      entityId: 'profile-1',
      before: { firstName: 'Ali' },
      after: { firstName: 'Reza' },
      ipAddress: '1.2.3.4',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        action: 'PROFILE_UPDATE',
        entity: 'UserProfile',
        entityId: 'profile-1',
        before: { firstName: 'Ali' },
        after: { firstName: 'Reza' },
        ipAddress: '1.2.3.4',
      },
    });
  });
});
