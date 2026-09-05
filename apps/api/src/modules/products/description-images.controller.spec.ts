import { Reflector } from '@nestjs/core';
import { AppRole } from '../auth/enums/app-role.enum';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import {
  AdminDescriptionImagesController,
  PublicDescriptionImagesController,
} from './description-images.controller';
import { DescriptionImageService } from './description-image.service';

const user = { userId: 'actor-1', sessionId: 's', mobile: '+989120000000' };

describe('AdminDescriptionImagesController', () => {
  let controller: AdminDescriptionImagesController;
  let service: { upload: jest.Mock; getPublic: jest.Mock };

  beforeEach(() => {
    service = { upload: jest.fn(), getPublic: jest.fn() };
    controller = new AdminDescriptionImagesController(
      service as unknown as DescriptionImageService,
    );
  });

  it('requires OPERATOR or ADMIN on upload', () => {
    const reflector = new Reflector();
    const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      AdminDescriptionImagesController.prototype.upload,
      AdminDescriptionImagesController,
    ]);
    expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
  });

  it('rejects a missing file with 400', async () => {
    await expect(
      controller.upload('prod-1', undefined as never, user as never),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('delegates upload with product id, file, actor and ip', async () => {
    const file = { path: '/tmp/x' } as never;
    await controller.upload('prod-1', file, user as never, '127.0.0.1');
    expect(service.upload).toHaveBeenCalledWith('prod-1', file, 'actor-1', '127.0.0.1');
  });
});

describe('PublicDescriptionImagesController', () => {
  let controller: PublicDescriptionImagesController;
  let service: { getPublic: jest.Mock };

  beforeEach(() => {
    service = { getPublic: jest.fn() };
    controller = new PublicDescriptionImagesController(
      service as unknown as DescriptionImageService,
    );
  });

  it('is not role-gated (no ROLES_KEY metadata)', () => {
    const reflector = new Reflector();
    const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      PublicDescriptionImagesController.prototype.get,
      PublicDescriptionImagesController,
    ]);
    expect(roles).toBeUndefined();
  });

  it('delegates to the service and returns a StreamableFile', async () => {
    const { StreamableFile } = await import('@nestjs/common');
    service.getPublic.mockResolvedValue({
      stream: { read: jest.fn() },
      mimeType: 'image/jpeg',
    });
    const response = { setHeader: jest.fn() } as unknown as Parameters<
      PublicDescriptionImagesController['get']
    >[1];
    const result = await controller.get('abc.jpg', response);
    expect(service.getPublic).toHaveBeenCalledWith('abc.jpg');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=31536000, immutable',
    );
    expect(result).toBeInstanceOf(StreamableFile);
  });
});