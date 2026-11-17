// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Badge } from './badge';
import { Button } from './button';
import { Card } from './card';
import { SectionHeader } from './section-header';

afterEach(cleanup);

describe('semantic primitives', () => {
  it('styles the primary button with accent tokens, not raw colors', () => {
    render(<Button>خرید</Button>);
    const button = screen.getByRole('button', { name: 'خرید' });
    expect(button.className).toContain('bg-accent');
    expect(button.className).toContain('text-on-accent');
    expect(button.className).toContain('rounded-control');
    for (const raw of ['bg-white', 'text-white', 'bg-sabz-', 'bg-gray-']) {
      expect(button.className).not.toContain(raw);
    }
  });

  it('styles sale and stock badges with dedicated roles', () => {
    const { rerender } = render(<Badge variant="sale">تخفیف</Badge>);
    expect(screen.getByText('تخفیف').className).toContain('bg-sale');
    expect(screen.getByText('تخفیف').className).toContain('text-on-sale');

    rerender(<Badge variant="outOfStock">ناموجود</Badge>);
    expect(screen.getByText('ناموجود').className).toContain('bg-stage/90');
    expect(screen.getByText('ناموجود').className).toContain('text-on-stage');
  });

  it('keeps card and section materials on semantic surfaces', () => {
    render(
      <Card>
        <SectionHeader id="probe" title="دسته‌بندی‌ها" subtitle="همه کالاها" />
      </Card>,
    );
    const card = screen.getByText('دسته‌بندی‌ها').closest('div.rounded-card');
    expect(card?.className).toContain('bg-surface');
    expect(card?.className).toContain('border-border');
    expect(screen.getByText('دسته‌بندی‌ها').className).toContain('text-h2');
    expect(screen.getByText('همه کالاها').className).toContain('text-body');
  });
});
