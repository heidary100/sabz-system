import type { ProductMediaSummary } from '@sabz/types'
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
import { PRODUCT_MEDIA_TYPE_LABELS } from '../../lib/product-labels'
import { formatDateTime, formatFileSize } from '../../lib/format'

export function ProductMediaSection({ media }: { media: ProductMediaSummary[] }) {
  return (
    <section className="rounded-lg border border-border bg-white p-6">
      <Subheading>رسانه‌ها</Subheading>
      <Text className="mt-1 text-xs text-zinc-500">
        اطلاعات رسانه‌های محصول به‌صورت نمایشی ارائه می‌شود.
      </Text>
      {media.length === 0 ? (
        <Text className="mt-4">رسانه‌ای برای این محصول ثبت نشده است.</Text>
      ) : (
        <div className="mt-4">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>نام فایل</TableHeader>
                <TableHeader>نوع</TableHeader>
                <TableHeader>MIME</TableHeader>
                <TableHeader>حجم</TableHeader>
                <TableHeader>ترتیب</TableHeader>
                <TableHeader>اصلی</TableHeader>
                <TableHeader>تاریخ ایجاد</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {media.map((item) => (
                <TableRow key={item.id}>
                  <TableCell dir="ltr" className="font-medium text-zinc-950">
                    {item.originalName}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {PRODUCT_MEDIA_TYPE_LABELS[item.mediaType]}
                  </TableCell>
                  <TableCell dir="ltr" className="text-zinc-500">
                    {item.mimeType}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {formatFileSize(item.sizeBytes)}
                  </TableCell>
                  <TableCell className="text-zinc-500">{item.sortOrder}</TableCell>
                  <TableCell className="text-zinc-500">
                    {item.isPrimary ? 'بله' : 'خیر'}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {formatDateTime(item.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
