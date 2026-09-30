import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddTrackingEventDto } from './add-tracking-event.dto';
import { OrderListQueryDto } from './order-list-query.dto';
import { PlaceOrderDto } from './place-order.dto';
import { UpdateShipmentDto } from './update-shipment.dto';
import { ValidateCheckoutDto } from './validate-checkout.dto';

const ADDRESS_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('PlaceOrderDto', () => {
  it('accepts an address id with payment and shipping methods', async () => {
    for (const paymentMethod of ['ONLINE', 'COD']) {
      for (const shippingMethod of [
        'TIPAX',
        'IRAN_POST',
        'LOCAL_DELIVERY',
        'STORE_PICKUP',
      ]) {
        expect(
          await validate(
            plainToInstance(PlaceOrderDto, {
              addressId: ADDRESS_ID,
              paymentMethod,
              shippingMethod,
            }),
          ),
        ).toHaveLength(0);
      }
    }
  });

  it('rejects bad ids and unknown payment/shipping methods', async () => {
    expect(
      await validate(
        plainToInstance(PlaceOrderDto, {
          addressId: 'nope',
          paymentMethod: 'COD',
          shippingMethod: 'STORE_PICKUP',
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(PlaceOrderDto, { addressId: ADDRESS_ID, paymentMethod: 'CARD' }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(PlaceOrderDto, {
          addressId: ADDRESS_ID,
          paymentMethod: 'COD',
          shippingMethod: 'PIGEON',
        }),
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
    expect(
      await validate(
        plainToInstance(ValidateCheckoutDto, {
          addressId: ADDRESS_ID,
          shippingMethod: 'TIPAX',
        }),
      ),
    ).toHaveLength(0);
  });

  it('rejects bad address ids and unknown shipping methods', async () => {
    expect(
      await validate(
        plainToInstance(ValidateCheckoutDto, { addressId: 'nope' }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(ValidateCheckoutDto, { shippingMethod: 'PIGEON' }),
      ),
    ).not.toHaveLength(0);
  });
});

describe('UpdateShipmentDto', () => {
  it('accepts empty, tracking-only and status updates', async () => {
    expect(await validate(plainToInstance(UpdateShipmentDto, {}))).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(UpdateShipmentDto, { trackingNumber: 'TIPAX-1' }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(UpdateShipmentDto, { status: 'IN_TRANSIT' }),
      ),
    ).toHaveLength(0);
  });

  it('rejects unknown statuses and overlong tracking numbers', async () => {
    expect(
      await validate(plainToInstance(UpdateShipmentDto, { status: 'FLYING' })),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(UpdateShipmentDto, { trackingNumber: 'x'.repeat(101) }),
      ),
    ).not.toHaveLength(0);
  });
});

describe('AddTrackingEventDto', () => {
  it('accepts a status with optional location and note', async () => {
    expect(
      await validate(
        plainToInstance(AddTrackingEventDto, {
          status: 'IN_TRANSIT',
          location: 'تهران',
          note: 'در مسیر.',
        }),
      ),
    ).toHaveLength(0);
  });

  it('rejects missing and unknown statuses', async () => {
    expect(await validate(plainToInstance(AddTrackingEventDto, {}))).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(AddTrackingEventDto, { status: 'FLYING' })),
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
