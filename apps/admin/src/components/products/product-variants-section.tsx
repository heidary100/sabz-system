import type { VariantSummary } from '@sabz/types'
import { Subheading } from '../catalyst/heading'
import { Text } from '../catalyst/text'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../catalyst/table'

export function ProductVariantsSection({ variants }: { variants: VariantSummary[] }) {
  return (
    <section className="rounded-lg border border-border bg-white p-6">
      <Subheading>واریانت‌ها</Subheading>
      <Text className="mt-1 text-xs text-zinc-500">
        SKU، قیمت و موجودی به واریانت تعلق دارد و در این بخش فقط به‌صورت نمایشی ارائه می‌شود.
      </Text>
      {variants.length === 0 ? (
        <Text className="mt-4">هنوز واریانتی برای این محصول ثبت نشده است.</Text>
      ) : (
        <div className="mt-4">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>SKU</TableHeader>
                <TableHeader>نام واریانت</TableHeader>
                <TableHeader>بارکد</TableHeader>
                <TableHeader>قیمت</TableHeader>
                <TableHeader>موجودی</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {variants.map((variant) => (
                <TableRow key={variant.id}>
                  <TableCell dir="ltr" className="font-medium text-zinc-950">
                    {variant.sku}
                  </TableCell>
                  <TableCell className="text-zinc-500">{variant.name ?? '—'}</TableCell>
                  <TableCell dir="ltr" className="text-zinc-500">
                    {variant.barcode ?? '—'}
                  </TableCell>
                  <TableCell dir="ltr" className="text-zinc-500">
                    {variant.price}
                  </TableCell>
                  <TableCell className="text-zinc-500">{variant.stockQuantity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
