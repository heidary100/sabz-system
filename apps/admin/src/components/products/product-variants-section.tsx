import { Link } from 'react-router-dom'
import type { VariantSummary } from '@sabz/types'
import { Subheading } from '../catalyst/heading'
import { Text } from '../catalyst/text'
import { Button } from '../catalyst/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../catalyst/table'
import { VariantAvailabilityBadge } from '../variants/variant-availability-badge'

export function ProductVariantsSection({
  variants,
  manageable,
  onCreate,
  onEdit,
  onDelete,
}: {
  variants: VariantSummary[]
  manageable: boolean
  onCreate: () => void
  onEdit: (variant: VariantSummary) => void
  onDelete: (variant: VariantSummary) => void
}) {
  return (
    <section className="rounded-lg border border-border bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Subheading>واریانت‌ها</Subheading>
          <Text className="mt-1 text-xs text-zinc-500">
            SKU و قیمت به واریانت تعلق دارد. موجودیِ نمایش‌داده‌شده، نمای تجمیعی قدیمی (M1) است؛
            موجودی معتبر و انبارمحور از مسیر «موجودی انبارها» قابل مشاهده است.
          </Text>
        </div>
        {manageable && (
          <Button color="primary" onClick={onCreate}>
            افزودن واریانت
          </Button>
        )}
      </div>

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
                <TableHeader>موجودی (نمای قدیمی M1)</TableHeader>
                {manageable && <TableHeader>عملیات</TableHeader>}
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
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span dir="ltr" className="text-zinc-500">
                        {variant.stockQuantity}
                      </span>
                      <VariantAvailabilityBadge stockQuantity={variant.stockQuantity} />
                    </div>
                  </TableCell>
                  {manageable && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button outline onClick={() => onEdit(variant)}>
                          ویرایش
                        </Button>
                        <Link
                          to={`/inventory/variants/${variant.id}`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          موجودی انبارها
                        </Link>
                        <Button outline onClick={() => onDelete(variant)}>
                          حذف
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}