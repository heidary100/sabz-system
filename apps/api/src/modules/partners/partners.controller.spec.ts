import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { PartnersController } from './partners.controller';
import { DocumentsService } from './documents.service';
import { OversizedUploadFilter } from './oversized-upload.filter';
import { PartnersService } from './partners.service';

describe('PartnersController', () => {
  let controller: PartnersController;
  let partnersService: {
    createApplication: jest.Mock;
    getApplication: jest.Mock;
    updateApplication: jest.Mock;
  };
  let documentsService: {
    upload: jest.Mock;
    list: jest.Mock;
    getBinary: jest.Mock;
    remove: jest.Mock;
  };

  const user = { userId: 'user-1', sessionId: 'session-1', mobile: '+989123456789' };

  beforeEach(() => {
    partnersService = {
      createApplication: jest.fn(),
      getApplication: jest.fn(),
      updateApplication: jest.fn(),
    };
    documentsService = {
      upload: jest.fn(),
      list: jest.fn(),
      getBinary: jest.fn(),
      remove: jest.fn(),
    };
    controller = new PartnersController(
      partnersService as unknown as PartnersService,
      documentsService as unknown as DocumentsService,
    );
  });

  it('delegates application creation with the authenticated user id', async () => {
    partnersService.createApplication.mockResolvedValue({ id: 'partner-1' });

    const result = await controller.createApplication(user, { businessName: 'اکسیر' }, '1.2.3.4');

    expect(partnersService.createApplication).toHaveBeenCalledWith(
      'user-1',
      { businessName: 'اکسیر' },
      '1.2.3.4',
    );
    expect(result).toEqual({ id: 'partner-1' });
  });

  it('delegates application read with the authenticated user id', async () => {
    partnersService.getApplication.mockResolvedValue({ id: 'partner-1' });

    const result = await controller.getApplication(user);

    expect(partnersService.getApplication).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ id: 'partner-1' });
  });

  it('delegates application update with the authenticated user id', async () => {
    partnersService.updateApplication.mockResolvedValue({ id: 'partner-1' });

    const result = await controller.updateApplication(user, { submit: true }, '1.2.3.4');

    expect(partnersService.updateApplication).toHaveBeenCalledWith(
      'user-1',
      { submit: true },
      '1.2.3.4',
    );
    expect(result).toEqual({ id: 'partner-1' });
  });

  it('rejects a multipart upload with no file', async () => {
    await expect(controller.uploadDocument(user, { type: 'SUPPORTING' as never }, undefined as never)).rejects.toThrow(
      BadRequestException,
    );
    expect(documentsService.upload).not.toHaveBeenCalled();
  });

  it('propagates service errors unchanged', async () => {
    const serviceError = new BadRequestException('حجم فایل باید حداکثر ۱۰ مگابایت باشد.');
    documentsService.upload.mockRejectedValue(serviceError);

    await expect(
      controller.uploadDocument(
        user,
        { type: 'SUPPORTING' as never },
        { mimetype: 'application/pdf' } as never,
      ),
    ).rejects.toThrow(serviceError);
  });

  it('delegates document upload with the authenticated user id', async () => {
    documentsService.upload.mockResolvedValue({ id: 'doc-1' });
    const file = { mimetype: 'application/pdf' } as Express.Multer.File;

    const result = await controller.uploadDocument(
      user,
      { type: 'BUSINESS_LICENSE' as never },
      file,
      '1.2.3.4',
    );

    expect(documentsService.upload).toHaveBeenCalledWith(
      'user-1',
      'BUSINESS_LICENSE',
      file,
      '1.2.3.4',
    );
    expect(result).toEqual({ id: 'doc-1' });
  });

  it('delegates document listing with the authenticated user id', async () => {
    documentsService.list.mockResolvedValue([]);

    const result = await controller.listDocuments(user);

    expect(documentsService.list).toHaveBeenCalledWith('user-1');
    expect(result).toEqual([]);
  });

  it('streams the downloaded document with attachment headers', async () => {
    documentsService.getBinary.mockResolvedValue({
      buffer: Buffer.from('%PDF'),
      summary: {
        id: 'doc-1',
        originalName: 'license.pdf',
        mimeType: 'application/pdf',
      },
    });

    const result = await controller.downloadDocument(user, 'doc-1');

    expect(documentsService.getBinary).toHaveBeenCalledWith('user-1', 'doc-1');
    expect(result).toBeDefined();
  });

  it('delegates document removal with the authenticated user id', async () => {
    documentsService.remove.mockResolvedValue(undefined);

    const result = await controller.removeDocument(user, 'doc-1', '1.2.3.4');

    expect(documentsService.remove).toHaveBeenCalledWith('user-1', 'doc-1', '1.2.3.4');
    expect(result).toEqual({ removed: true });
  });
});

describe('OversizedUploadFilter', () => {
  it('maps a PayloadTooLargeException to a 400 with a Persian message', () => {
    const filter = new OversizedUploadFilter();
    const json = jest.fn();
    const response = {
      status: jest.fn().mockReturnValue({ json }),
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    };

    filter.catch(new PayloadTooLargeException(), host as never);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'حجم فایل باید حداکثر ۱۰ مگابایت باشد.',
      }),
    );
  });
});
