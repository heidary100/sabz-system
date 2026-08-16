import { Reflector } from '@nestjs/core';
import { AppRole } from '../auth/enums/app-role.enum';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { AdminPartnersController } from './admin-partners.controller';
import { AdminPartnersService } from './admin-partners.service';
import { DocumentsService } from './documents.service';
import { PartnerDocumentType } from '@prisma/client';
import { buildAttachmentDisposition } from './download-disposition';

jest.mock('./download-disposition', () => ({
  buildAttachmentDisposition: jest.fn(() => 'attachment; filename="license.pdf"'),
}));

describe('AdminPartnersController', () => {
  let controller: AdminPartnersController;
  let adminService: {
    list: jest.Mock;
    listTiers: jest.Mock;
    getDetail: jest.Mock;
    approve: jest.Mock;
    reject: jest.Mock;
    changeTier: jest.Mock;
  };
  let documentsService: { getBinaryByPartner: jest.Mock };

  const user: AuthUser = {
    userId: 'reviewer-1',
    sessionId: 'session-1',
    mobile: '+989123456789',
  };

  beforeEach(() => {
    adminService = {
      list: jest.fn(),
      listTiers: jest.fn(),
      getDetail: jest.fn(),
      approve: jest.fn(),
      reject: jest.fn(),
      changeTier: jest.fn(),
    };
    documentsService = { getBinaryByPartner: jest.fn() };
    controller = new AdminPartnersController(
      adminService as unknown as AdminPartnersService,
      documentsService as unknown as DocumentsService,
    );
  });

  it('requires OPERATOR or ADMIN on every route', () => {
    const reflector = new Reflector();
    const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      AdminPartnersController.prototype.list,
      AdminPartnersController,
    ]);
    expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
  });

  it('delegates list with the query', async () => {
    const query = { status: 'PENDING' as const, page: 2, limit: 10 };
    adminService.list.mockResolvedValue({ items: [], total: 0, page: 2, limit: 10 });

    const result = await controller.list(query);

    expect(adminService.list).toHaveBeenCalledWith(query);
    expect(result).toEqual({ items: [], total: 0, page: 2, limit: 10 });
  });

  it('delegates listTiers', async () => {
    adminService.listTiers.mockResolvedValue([
      { id: 'tier-1', name: 'Tier 1', discountPercent: '5', minOrderQuantity: 1 },
    ]);

    const result = await controller.listTiers();

    expect(adminService.listTiers).toHaveBeenCalled();
    expect(result).toEqual([
      { id: 'tier-1', name: 'Tier 1', discountPercent: '5', minOrderQuantity: 1 },
    ]);
  });

  it('delegates getDetail with the partner id', async () => {
    adminService.getDetail.mockResolvedValue({ id: 'partner-1' });

    const result = await controller.getDetail('partner-1');

    expect(adminService.getDetail).toHaveBeenCalledWith('partner-1');
    expect(result).toEqual({ id: 'partner-1' });
  });

  it('delegates approve with partner id, dto, reviewer id and ip', async () => {
    const dto = { tierId: 'tier-1' };
    adminService.approve.mockResolvedValue({ id: 'partner-1' });

    const result = await controller.approve('partner-1', dto, user, '1.2.3.4');

    expect(adminService.approve).toHaveBeenCalledWith(
      'partner-1',
      dto,
      'reviewer-1',
      '1.2.3.4',
    );
    expect(result).toEqual({ id: 'partner-1' });
  });

  it('delegates reject with partner id, dto, reviewer id and ip', async () => {
    const dto = { reason: 'مدارک ناقص' };
    adminService.reject.mockResolvedValue({ id: 'partner-1' });

    const result = await controller.reject('partner-1', dto, user, '1.2.3.4');

    expect(adminService.reject).toHaveBeenCalledWith(
      'partner-1',
      dto,
      'reviewer-1',
      '1.2.3.4',
    );
    expect(result).toEqual({ id: 'partner-1' });
  });

  it('delegates changeTier with partner id, dto, reviewer id and ip', async () => {
    const dto = { tierId: 'tier-2' };
    adminService.changeTier.mockResolvedValue({ id: 'partner-1' });

    const result = await controller.changeTier('partner-1', dto, user, '1.2.3.4');

    expect(adminService.changeTier).toHaveBeenCalledWith(
      'partner-1',
      dto,
      'reviewer-1',
      '1.2.3.4',
    );
    expect(result).toEqual({ id: 'partner-1' });
  });

  it('streams a partner document with a safe disposition', async () => {
    documentsService.getBinaryByPartner.mockResolvedValue({
      buffer: Buffer.from('%PDF-1.7'),
      summary: {
        id: 'doc-1',
        type: PartnerDocumentType.BUSINESS_LICENSE,
        originalName: 'license.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        createdAt: '2026-08-16T00:00:00.000Z',
      },
    });

    const result = await controller.previewDocument('partner-1', 'doc-1');

    expect(documentsService.getBinaryByPartner).toHaveBeenCalledWith(
      'partner-1',
      'doc-1',
    );
    expect(buildAttachmentDisposition).toHaveBeenCalled();
    const stream = result as unknown as { getHeaders(): Record<string, string> };
    expect(stream.getHeaders()['type']).toBe('application/pdf');
    expect(stream.getHeaders()['disposition']).toContain('attachment');
  });
});
