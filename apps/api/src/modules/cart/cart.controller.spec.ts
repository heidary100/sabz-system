import { CartController } from './cart.controller';
import { CartService } from './cart.service';

describe('CartController', () => {
  let controller: CartController;
  let cartService: {
    list: jest.Mock;
    add: jest.Mock;
    setQuantity: jest.Mock;
    remove: jest.Mock;
    clear: jest.Mock;
  };

  const user = {
    userId: 'user-1',
    sessionId: 'session-1',
    mobile: '+989123456789',
  };
  const variantId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

  beforeEach(() => {
    cartService = {
      list: jest.fn(),
      add: jest.fn(),
      setQuantity: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn(),
    };
    controller = new CartController(cartService as unknown as CartService);
  });

  it('lists with the authenticated user id', async () => {
    cartService.list.mockResolvedValue({ items: [], totalQuantity: 0, subtotal: '0' });

    const result = await controller.get(user);

    expect(cartService.list).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ items: [], totalQuantity: 0, subtotal: '0' });
  });

  it('maps a fresh add to 201', async () => {
    const item = { variantId };
    cartService.add.mockResolvedValue({ item, created: true });
    const res = { status: jest.fn() };

    const result = await controller.add(
      user,
      { variantId, quantity: 2 },
      res as unknown as import('express').Response,
    );

    expect(cartService.add).toHaveBeenCalledWith(
      'user-1',
      { variantId, productId: undefined },
      2,
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(result).toEqual(item);
  });

  it('maps a productId quick-add through', async () => {
    const productId = '22222222-2222-4222-8222-222222222222';
    const item = { variantId };
    cartService.add.mockResolvedValue({ item, created: true });
    const res = { status: jest.fn() };

    const result = await controller.add(
      user,
      { productId, quantity: 1 },
      res as unknown as import('express').Response,
    );

    expect(cartService.add).toHaveBeenCalledWith(
      'user-1',
      { variantId: undefined, productId },
      1,
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(result).toEqual(item);
  });

  it('maps a repeat add to 200', async () => {
    cartService.add.mockResolvedValue({ item: { variantId }, created: false });
    const res = { status: jest.fn() };

    await controller.add(
      user,
      { variantId, quantity: 1 },
      res as unknown as import('express').Response,
    );

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('sets quantity with the authenticated user id', async () => {
    const item = { variantId, quantity: 4 };
    cartService.setQuantity.mockResolvedValue(item);

    const result = await controller.update(user, variantId, { quantity: 4 });

    expect(cartService.setQuantity).toHaveBeenCalledWith('user-1', variantId, 4);
    expect(result).toEqual(item);
  });

  it('removes with the authenticated user id', async () => {
    cartService.remove.mockResolvedValue({ removed: true });

    const result = await controller.remove(user, variantId);

    expect(cartService.remove).toHaveBeenCalledWith('user-1', variantId);
    expect(result).toEqual({ removed: true });
  });

  it('clears with the authenticated user id', async () => {
    cartService.clear.mockResolvedValue({ cleared: true });

    const result = await controller.clear(user);

    expect(cartService.clear).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ cleared: true });
  });
});
