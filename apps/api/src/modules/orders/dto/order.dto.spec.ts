import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrderListQueryDto } from './order-list-query.dto';
import { PlaceOrderDto } from './place-order.dto';
import { ValidateCheckoutDto } from './validate-checkout.dto';

const ADDRESS_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('PlaceOrderDto', () => {
  it('accepts an address id with a payment method', async () => {
    for (const paymentMethod of ['ONLINE', 'COD']) {
      expect(
        await validate(
          plainToInstance(PlaceOrderDto, { addressId: ADDRESS_ID, paymentMethod }),
        ),
      ).toHaveLength(0);
    }
  });

  it('rejects bad ids and unknown payment methods', async () => {
    expect(
      await validate(
        plainToInstance(PlaceOrderDto, { addressId: 'nope', paymentMethod: 'COD' }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(PlaceOrderDto, { addressId: ADDRESS_ID, paymentMethod: 'CARD' }),
      ),
    ).not.toHaveLength(0);
    expect(await validate(plainToInstance(PlaceOrderDto, {}))).not.toHaveLength(0);
  });
});

describe('ValidateCheckoutDto', () => {
  it('accepts empty and addressed previews', async () => {
    expect(await validate(plainToInstance(ValidateCheckoutDto, {}))).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(ValidateCheckoutDto, { addressId: ADDRESS_ID }),
      ),
    ).toHaveLength(0);
  });

  it('rejects bad address ids', async () => {
    expect(
      await validate(
        plainToInstance(ValidateCheckoutDto, { addressId: 'nope' }),
      ),
    ).not.toHaveLength(0);
  });
});

describe('OrderListQueryDto', () => {
  it('accepts empty, status and pagination queries', async () => {
    expect(await validate(plainToInstance(OrderListQueryDto, {}))).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(OrderListQueryDto, { status: 'PENDING', page: 2, limit: 10 }),
      ),
    ).toHaveLength(0);
  });

  it('rejects unknown statuses and out-of-range pagination', async () => {
    for (const query of [
      { status: 'PAID' },
      { page: 0 },
      { limit: 0 },
      { limit: 51 },
    ]) {
      expect(
        await validate(plainToInstance(OrderListQueryDto, query)),
      ).not.toHaveLength(0);
    }
  });
});
