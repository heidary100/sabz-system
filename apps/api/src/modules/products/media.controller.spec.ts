import { Reflector } from '@nestjs/core';
import { StreamableFile } from '@nestjs/common';
import { AppRole } from '../auth/enums/app-role.enum';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import {
  AdminMediaController,
  ProductMediaController,
} from './media.controller';
import { MediaService } from './media.service';

const user = { userId: 'actor-1', sessionId: 's', mobile: '+989120000000' };

describe('ProductMediaController', () => {
  let controller: ProductMediaController;
  let service: {
    upload: jest.Mock;
    list: jest.Mock;
    getBinary: jest.Mock;
    getBinaryStream: jest.Mock;
  };

  beforeEach(() => {
    service = {
      upload: jest.fn(),
      list: jest.fn(),
      getBinary: jest.fn(),
      getBinaryStream: jest.fn(),
    };
    controller = new ProductMediaController(service as unknown as MediaService);
  });

  it('requires OPERATOR or ADMIN on upload, list and download', () => {
    const reflector = new Reflector();
    for (const handler of [
      ProductMediaController.prototype.upload,
      ProductMediaController.prototype.list,
      ProductMediaController.prototype.download,
    ]) {
      const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        handler,
        ProductMediaController,
      ]);
      expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
    }
  });

  it('rejects a missing file with 400', async () => {
    await expect(
      controller.upload('prod-1', {} as never, undefined as never, user as never),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('delegates upload with product id, file, dto, actor and ip', async () => {
    const file = { buffer: Buffer.from('x') } as never;
    const dto = { mediaType: 'IMAGE' } as never;
    await controller.upload('prod-1', dto, file, user as never, '127.0.0.1');
    expect(service.upload).toHaveBeenCalledWith('prod-1', file, dto, 'actor-1', '127.0.0.1');
  });

  it('delegates list with the product id', async () => {
    await controller.list('prod-1');
    expect(service.list).toHaveBeenCalledWith('prod-1');
  });

  it('returns a StreamableFile for download using the stored mime type', async () => {
    service.getBinaryStream.mockResolvedValue({
      stream: { read: jest.fn() },
      summary: {
        id: 'media-1',
        productId: 'prod-1',
        variantId: null,
        mediaType: 'IMAGE',
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 3,
        sortOrder: 0,
        isPrimary: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const result = await controller.download('prod-1', 'media-1');
    expect(result).toBeInstanceOf(StreamableFile);
    expect(service.getBinaryStream).toHaveBeenCalledWith('prod-1', 'media-1');
  });
});

describe('AdminMediaController', () => {
  let controller: AdminMediaController;
  let service: { remove: jest.Mock };

  beforeEach(() => {
    service = { remove: jest.fn() };
    controller = new AdminMediaController(service as unknown as MediaService);
  });

  it('requires OPERATOR or ADMIN on delete', () => {
    const reflector = new Reflector();
    const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      AdminMediaController.prototype.remove,
      AdminMediaController,
    ]);
    expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
  });

  it('delegates remove with media id, actor and ip', async () => {
    await controller.remove('media-1', user as never, '127.0.0.1');
    expect(service.remove).toHaveBeenCalledWith('media-1', 'actor-1', '127.0.0.1');
  });

  it('returns { removed: true }', async () => {
    service.remove.mockResolvedValue(undefined);
    const result = await controller.remove('media-1', user as never);
    expect(result).toEqual({ removed: true });
  });
});
