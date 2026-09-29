import { TorobBadRequestException } from './torob-error';
import { parseTorobProductsRequest } from './torob-request';

function expectBadRequest(body: unknown, message: string): void {
  try {
    parseTorobProductsRequest(body);
    fail(`expected ${JSON.stringify(body)} to be rejected`);
  } catch (error) {
    expect(error).toBeInstanceOf(TorobBadRequestException);
    expect((error as TorobBadRequestException).getResponse()).toEqual({
      error: message,
    });
  }
}

describe('parseTorobProductsRequest (SS-239)', () => {
  it('passes through the page shape with a valid sort', () => {
    expect(parseTorobProductsRequest({ page: 2, sort: 'date_added_desc' })).toEqual({
      page: 2,
      sort: 'date_added_desc',
    });
    expect(
      parseTorobProductsRequest({ page: 1, sort: 'product_id_desc' }),
    ).toEqual({ page: 1, sort: 'product_id_desc' });
  });

  it('passes through the cursor shape with a valid sort', () => {
    expect(
      parseTorobProductsRequest({ cursor: 'abc=', sort: 'date_updated_desc' }),
    ).toEqual({ cursor: 'abc=', sort: 'date_updated_desc' });
  });

  it('passes through the page_urls and page_uniques shapes', () => {
    expect(
      parseTorobProductsRequest({ page_urls: ['https://x.example/products/a'] }),
    ).toEqual({ page_urls: ['https://x.example/products/a'] });
    expect(parseTorobProductsRequest({ page_uniques: ['a', 'b'] })).toEqual({
      page_uniques: ['a', 'b'],
    });
  });

  it('rejects a non-object, null, or array body', () => {
    expectBadRequest(null, 'درخواست نامعتبر است: بدنه باید یک شیء JSON باشد.');
    expectBadRequest([1, 2], 'درخواست نامعتبر است: بدنه باید یک شیء JSON باشد.');
    expectBadRequest('x', 'درخواست نامعتبر است: بدنه باید یک شیء JSON باشد.');
  });

  it('rejects requests mixing two shapes', () => {
    expectBadRequest(
      { page: 1, cursor: 'abc', sort: 'date_added_desc' },
      'درخواست نامعتبر است: فقط یکی از page، cursor، page_urls یا page_uniques مجاز است.',
    );
    expectBadRequest(
      { page_urls: ['https://x.example/products/a'], page_uniques: ['a'] },
      'درخواست نامعتبر است: فقط یکی از page، cursor، page_urls یا page_uniques مجاز است.',
    );
  });

  it('rejects a body with none of the four shapes', () => {
    expectBadRequest(
      {},
      'درخواست نامعتبر است: یکی از page، cursor، page_urls یا page_uniques الزامی است.',
    );
    expectBadRequest(
      { sort: 'date_added_desc' },
      'درخواست نامعتبر است: یکی از page، cursor، page_urls یا page_uniques الزامی است.',
    );
  });

  it('rejects an invalid page (non-integer, zero, negative, string)', () => {
    const message = 'page باید یک عدد صحیح بزرگ‌تر از صفر باشد.';
    expectBadRequest({ page: 0, sort: 'date_added_desc' }, message);
    expectBadRequest({ page: 1.5, sort: 'date_added_desc' }, message);
    expectBadRequest({ page: '2', sort: 'date_added_desc' }, message);
  });

  it('rejects a missing or invalid sort on page/cursor modes (no default sort)', () => {
    const message =
      'sort الزامی است و باید یکی از مقادیر مجاز باشد.';
    expectBadRequest({ page: 1 }, message);
    expectBadRequest({ page: 1, sort: 'price_asc' }, message);
    expectBadRequest({ cursor: 'abc' }, message);
    expectBadRequest({ cursor: 'abc', sort: null }, message);
  });

  it('rejects an empty cursor', () => {
    expectBadRequest(
      { cursor: '   ', sort: 'date_added_desc' },
      'cursor باید یک رشته غیرخالی باشد.',
    );
  });

  it('rejects invalid page_urls / page_uniques lists', () => {
    const urlsMessage =
      'page_urls باید آرایه‌ای غیرخالی از آدرس‌ها (حداکثر ۱۰۰ مورد) باشد.';
    expectBadRequest({ page_urls: [] }, urlsMessage);
    expectBadRequest({ page_urls: 'https://x.example/products/a' }, urlsMessage);
    expectBadRequest({ page_urls: ['  '] }, urlsMessage);
    const uniquesMessage =
      'page_uniques باید آرایه‌ای غیرخالی از شناسه‌ها (حداکثر ۱۰۰ مورد) باشد.';
    expectBadRequest({ page_uniques: [] }, uniquesMessage);
    expectBadRequest({ page_uniques: [42] }, uniquesMessage);
  });

  it('trims string values', () => {
    expect(
      parseTorobProductsRequest({ cursor: '  abc  ', sort: 'date_added_desc' }),
    ).toEqual({ cursor: 'abc', sort: 'date_added_desc' });
    expect(parseTorobProductsRequest({ page_uniques: ['  a  '] })).toEqual({
      page_uniques: ['a'],
    });
  });
});
