import { parseWooCsv } from './woo-parse';

describe('parseWooCsv (SS-206)', () => {
  it('strips the BOM and keeps exact header text', () => {
    const parsed = parseWooCsv('\uFEFFشناسه,نام\n1,تست');
    expect(parsed.header).toEqual(['شناسه', 'نام']);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ line: 2 });
  });

  it('preserves multiline quoted cells and inner commas/quotes', () => {
    const parsed = parseWooCsv(
      'شناسه,توضیحات\n1,"<p>خط اول، با ویرگول</p>\n<p>خط دوم ""نقل‌قول""دار</p>"',
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.cells['توضیحات']).toBe(
      '<p>خط اول، با ویرگول</p>\n<p>خط دوم "نقل‌قول"دار</p>',
    );
  });

  it('tolerates ragged rows and skips blank lines', () => {
    const parsed = parseWooCsv('a,b,c\n1,2\n\n3,4,5,6\n');
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]!.cells).toMatchObject({ a: '1', b: '2' });
  });

  it('caps records with limit (header-aware)', () => {
    const parsed = parseWooCsv('a,b\n1,2\n3,4\n5,6', 2);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[1]!.cells).toMatchObject({ a: '3' });
  });
});
