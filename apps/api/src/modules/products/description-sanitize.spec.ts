import { isRichTextEmpty, sanitizeRichText } from './description-sanitize';

describe('description sanitization (rich text long description)', () => {
  it('preserves allowed formatting', () => {
    const html =
      '<h2>عنوان</h2><p>متن با <strong>بولد</strong> و <em>ایتالیک</em> و <u>زیرخط</u></p><ul><li>یک</li></ul><ol><li>دو</li></ol><blockquote>نقلقول</blockquote>';
    const result = sanitizeRichText(html);
    expect(result).toContain('<h2>عنوان</h2>');
    expect(result).toContain('<strong>بولد</strong>');
    expect(result).toContain('<em>ایتالیک</em>');
    expect(result).toContain('<ul><li>یک</li></ul>');
    expect(result).toContain('<blockquote>نقلقول</blockquote>');
  });

  it('keeps safe links and normalizes target/rel', () => {
    const html = '<p><a href="https://example.com" rel="x">لینک</a></p>';
    const result = sanitizeRichText(html);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it('strips script, iframe and event-handler attributes', () => {
    const html =
      '<p onclick="alert(1)">سلام</p><script>alert("x")</script><iframe src="https://evil.example"></iframe><img src="x" onerror="alert(1)">';
    const result = sanitizeRichText(html);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('onerror');
    // img is allowed now, but its unsafe relative src is dropped.
    expect(result).toContain('سلام');
    expect(result).not.toContain('src=');
  });

  it('removes javascript: links entirely', () => {
    const html = '<p><a href="javascript:alert(1)">بد</a><a href="data:text/html,x">همچنین</a></p>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('data:text/html');
  });

  it('keeps only the text-align style property on blocks', () => {
    const html =
      '<p style="text-align:center;color:red;font-size:99px">مرکز</p><p style="position:fixed">بد</p>';
    const result = sanitizeRichText(html);
    expect(result).toContain('text-align:center');
    expect(result).not.toContain('color');
    expect(result).not.toContain('font-size');
    expect(result).not.toContain('position');
  });

  it('strips style/class attributes', () => {
    const html = '<p class="x" style="color:red">متن</p>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain('class');
    expect(result).not.toContain('color');
  });

  it('strips unsupported tags but keeps their text', () => {
    const html = '<div>سلام <span>جهان</span></div><h4>عنوان فرعی ناگزاز</h4>';
    const result = sanitizeRichText(html);
    expect(result).toContain('سلام');
    expect(result).toContain('جهان');
    expect(result).not.toContain('<div');
    expect(result).not.toContain('<span');
    expect(result).not.toContain('<h4');
  });

  it('trims the result and reports emptiness', () => {
    expect(sanitizeRichText('  <p>متن</p>  ')).toBe('<p>متن</p>');
    expect(isRichTextEmpty('<script>alert(1)</script>')).toBe(true);
    expect(isRichTextEmpty('<p>متن</p>')).toBe(false);
    expect(isRichTextEmpty('')).toBe(true);
  });

  it('keeps legacy plain text untouched', () => {
    expect(sanitizeRichText('یک توضیح ساده بدون تگ')).toBe('یک توضیح ساده بدون تگ');
    expect(sanitizeRichText('قیمت ۵۰٪ تخفیف & ارسال رایگان')).toBe(
      'قیمت ۵۰٪ تخفیف & ارسال رایگان',
    );
  });

  it('keeps images with same-origin description-image URLs', () => {
    const html =
      '<img src="/api/v1/description-images/abc.jpg" alt="عکس">';
    const result = sanitizeRichText(html);
    expect(result).toContain('src="/api/v1/description-images/abc.jpg"');
    expect(result).toContain('alt="عکس"');
  });

  it('keeps remote https image sources', () => {
    const html = '<img src="https://cdn.example.com/img.png" alt="x">';
    expect(sanitizeRichText(html)).toContain('src="https://cdn.example.com/img.png"');
  });

  it('strips javascript: and data: image sources', () => {
    const html =
      '<img src="javascript:alert(1)"><img src="data:image/svg+xml;base64,PHN2Zz4=">';
    const result = sanitizeRichText(html);
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('data:');
    // img tags remain but carry no src.
    expect(result).not.toContain('src=');
  });

  it('strips image event-handler attributes', () => {
    const html = '<img src="/api/v1/description-images/a.jpg" onerror="alert(1)">';
    const result = sanitizeRichText(html);
    expect(result).not.toContain('onerror');
    expect(result).toContain('src="/api/v1/description-images/a.jpg"');
  });

  it('keeps the full figure/caption image structure', () => {
    const html =
      '<figure data-align="center" data-width="720"><img src="/api/v1/description-images/a.jpg" alt="لپتاپ" width="720" loading="lazy"><figcaption>نمای جلو</figcaption></figure>';
    const result = sanitizeRichText(html);
    expect(result).toContain('<figure data-align="center" data-width="720">');
    expect(result).toContain('src="/api/v1/description-images/a.jpg"');
    expect(result).toContain('alt="لپتاپ"');
    expect(result).toContain('width="720"');
    expect(result).toContain('<figcaption>نمای جلو</figcaption>');
  });

  it('keeps an image link wrapper', () => {
    const html =
      '<figure data-align="right"><a href="https://shop.example/p"><img src="/api/v1/description-images/a.jpg" alt="x"></a></figure>';
    const result = sanitizeRichText(html);
    expect(result).toContain('<a href="https://shop.example/p" target="_blank" rel="noopener noreferrer">');
    expect(result).toContain('<img src="/api/v1/description-images/a.jpg" alt="x">');
  });

  it('validates figure data-align and data-width', () => {
    expect(sanitizeRichText('<figure data-align="left"><img src="/api/v1/description-images/a.jpg"></figure>'))
      .toContain('data-align="left"');
    expect(sanitizeRichText('<figure data-align="full"><img src="/api/v1/description-images/a.jpg"></figure>'))
      .not.toContain('data-align');
    expect(sanitizeRichText('<figure data-width="abc"><img src="/api/v1/description-images/a.jpg"></figure>'))
      .not.toContain('data-width');
    expect(sanitizeRichText('<figure data-width="99"><img src="/api/v1/description-images/a.jpg"></figure>'))
      .toContain('data-width="99"');
  });

  it('keeps basic tables with colspan/rowspan', () => {
    const html =
      '<table><thead><tr><th rowspan="2">مشخصه</th></tr></thead><tbody><tr><td colspan="2">32GB</td></tr></tbody></table>';
    const result = sanitizeRichText(html);
    expect(result).toContain('<table>');
    expect(result).toContain('<thead>');
    expect(result).toContain('<tbody>');
    expect(result).toContain('rowspan="2"');
    expect(result).toContain('colspan="2"');
  });

  it('keeps h1, strikethrough and horizontal rules', () => {
    const html = '<h1>عنوان</h1><p><s>قدیمی</s> جدید</p><hr>';
    const result = sanitizeRichText(html);
    expect(result).toContain('<h1>عنوان</h1>');
    expect(result).toContain('<s>قدیمی</s>');
    expect(result).toContain('<hr>');
  });

  it('strips non-lazy loading values', () => {
    const html = '<img src="/api/v1/description-images/a.jpg" loading="eager">';
    expect(sanitizeRichText(html)).not.toContain('loading=');
  });
});