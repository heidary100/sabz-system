import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

describe('WishlistController', () => {
  let controller: WishlistController;
  let wishlistService: {
    list: jest.Mock;
    add: jest.Mock;
    remove: jest.Mock;
  };

  const user = {
    userId: 'user-1',
    sessionId: 'session-1',
    mobile: '+989123456789',
  };
  const productId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

  beforeEach(() => {
    wishlistService = {
      list: jest.fn(),
      add: jest.fn(),
      remove: jest.fn(),
    };
    controller = new WishlistController(
      wishlistService as unknown as WishlistService,
    );
  });

  it('lists with the authenticated user id', async () => {
    wishlistService.list.mockResolvedValue({ items: [], total: 0 });

    const result = await controller.list(user);

    expect(wishlistService.list).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ items: [], total: 0 });
  });

  it('maps a fresh save to 201', async () => {
    const item = { id: productId };
    wishlistService.add.mockResolvedValue({ item, created: true });
    const res = { status: jest.fn() };

    const result = await controller.add(
      user,
      { productId },
      res as unknown as import('express').Response,
    );

    expect(wishlistService.add).toHaveBeenCalledWith('user-1', productId);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(result).toEqual(item);
  });

  it('maps a repeat save to 200', async () => {
    const item = { id: productId };
    wishlistService.add.mockResolvedValue({ item, created: false });
    const res = { status: jest.fn() };

    await controller.add(
      user,
      { productId },
      res as unknown as import('express').Response,
    );

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('removes with the authenticated user id', async () => {
    wishlistService.remove.mockResolvedValue({ removed: true });

    const result = await controller.remove(user, productId);

    expect(wishlistService.remove).toHaveBeenCalledWith('user-1', productId);
    expect(result).toEqual({ removed: true });
  });
});
