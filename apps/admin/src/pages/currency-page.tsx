import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftRight, Banknote, Clock3, Info } from 'lucide-react'
import type {
  CurrencyCode,
  CurrencyConversionResponse,
  CurrencyRateDto,
  CurrencyRateListResponse,
} from '@sabz/types'
import {
  applyCurrencyRecalculation,
  convertCurrency,
  createCurrencyRate,
  listCurrencyRates,
  previewCurrencyRecalculation,
} from '../services/currency'
import { translateApiError } from '../lib/error-messages'
import { formatFaNumber, formatRial } from '../lib/format'
import { JalaliDateTimeInput } from '../components/ui/jalali-datetime-input'
import { Button } from '../components/catalyst/button'
import { Input } from '../components/catalyst/input'
import { Select } from '../components/catalyst/select'
import { Field, Label } from '../components/catalyst/fieldset'
import { EmptyState } from '../components/ui/empty-state'
import { ErrorState } from '../components/ui/error-state'
import { InlineError } from '../components/ui/inline-error'
import { Loading } from '../components/ui/loading'
import { PageHeader } from '../components/ui/page-header'
import { TablePagination } from '../components/ui/table-pagination'
import { TableCard } from '../components/ui/table-card'
import { HorizontalScroll } from '../components/ui/horizontal-scroll'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/catalyst/table'

const CURRENCIES: CurrencyCode[] = ['USD', 'AED']
const CURRENCY_FA: Record<CurrencyCode, string> = {
  USD: 'دلار آمریکا',
  AED: 'درهم امارات',
}

/**
 * Manual FX administration (SS-900). Admin-only; customers never see these
 * rates or any currency switch. Every row is an audited, operator-entered
 * value — explicitly not live market data.
 */
export function CurrencyPage() {
  const [data, setData] = useState<CurrencyRateListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [currency, setCurrency] = useState<CurrencyCode>('USD')
  const [rate, setRate] = useState('')
  const [effectiveAt, setEffectiveAt] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formMessage, setFormMessage] = useState<string | null>(null)
  const [convertCurrencyCode, setConvertCurrencyCode] = useState<CurrencyCode>('USD')
  const [convertAmount, setConvertAmount] = useState('100')
  const [conversion, setConversion] = useState<CurrencyConversionResponse | null>(null)
  const [conversionError, setConversionError] = useState<string | null>(null)
  const [recalcCurrency, setRecalcCurrency] = useState<CurrencyCode>('USD')
  const [recalcRate, setRecalcRate] = useState('')
  const [recalcPreview, setRecalcPreview] = useState<
    import('@sabz/types').CurrencyRecalculationPreviewResponse | null
  >(null)
  const [recalcError, setRecalcError] = useState<string | null>(null)
  const [recalcMessage, setRecalcMessage] = useState<string | null>(null)
  const [recalcBusy, setRecalcBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await listCurrencyRates({ page, limit }))
    } catch (loadError) {
      setError(loadError)
    } finally {
      setLoading(false)
    }
  }, [page, limit])

  useEffect(() => {
    void load()
  }, [load])

  const currentByCode = (code: CurrencyCode): CurrencyRateDto | undefined =>
    data?.current.find((row) => row.currency === code)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    setFormMessage(null)
    const normalized = rate.replace(/[,\s]/g, '')
    if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) {
      setFormError('نرخ باید عددی مثبت با حداکثر دو رقم اعشار باشد.')
      return
    }
    setSaving(true)
    try {
      await createCurrencyRate({
        currency,
        rialPerUnit: normalized,
        ...(effectiveAt ? { effectiveAt } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      })
      setRate('')
      setNote('')
      setEffectiveAt(null)
      setFormMessage('نرخ جدید ثبت و در تاریخچه افزوده شد.')
      await load()
    } catch (saveError) {
      setFormError(translateApiError(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function runConversion(event: React.FormEvent) {
    event.preventDefault()
    setConversionError(null)
    try {
      const amount = convertAmount.replace(/[,\s]/g, '')
      if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(amount)) {
        setConversionError('مبلغ معتبر نیست.')
        return
      }
      setConversion(await convertCurrency(convertCurrencyCode, amount))
    } catch (conversionFailure) {
      setConversion(null)
      setConversionError(translateApiError(conversionFailure))
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="نرخ ارز دستی"
        subtitle="نرخ دلار و درهم به ریال را دستی ثبت کنید. این نرخ‌ها داده زنده بازار نیستند و فقط در پنل مدیریت استفاده می‌شوند."
      />

      {loading && !data ? (
        <Loading label="در حال بارگذاری نرخ‌ها…" />
      ) : error ? (
        <ErrorState message={translateApiError(error)} onRetry={() => void load()} />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2" aria-label="نرخ‌های جاری">
            {CURRENCIES.map((code) => {
              const current = currentByCode(code)
              return (
                <article
                  key={code}
                  className="rounded-card border border-border bg-surface p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {CURRENCY_FA[code]}
                      </p>
                      <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                        {current ? formatRial(current.rialPerUnit) : 'ثبت نشده'}
                      </p>
                      <p className="mt-1 text-[11px] text-muted">به ازای یک {CURRENCY_FA[code]}</p>
                    </div>
                    <span className="flex size-10 items-center justify-center rounded-pill bg-primary-subtle text-primary">
                      <Banknote className="size-5" aria-hidden="true" />
                    </span>
                  </div>
                  <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted">
                    <Clock3 className="size-3.5" aria-hidden="true" />
                    {current
                      ? `آخرین اعتبار: ${new Intl.DateTimeFormat('fa-IR', {
                          calendar: 'persian',
                          timeZone: 'Asia/Tehran',
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(current.effectiveAt))}`
                      : 'برای شروع یک نرخ ثبت کنید.'}
                  </p>
                </article>
              )
            })}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-card border border-border bg-surface p-5">
              <h2 className="text-sm font-bold text-foreground">ثبت نرخ جدید</h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                هر ثبت یک ردیف جدید در تاریخچه می‌سازد و نرخ قبلی را بازنویسی نمی‌کند.
              </p>
              {formError && <div className="mt-3"><InlineError message={formError} /></div>}
              {formMessage && (
                <p className="mt-3 rounded-control bg-success/10 px-3 py-2 text-sm text-success" role="status">
                  {formMessage}
                </p>
              )}
              <form onSubmit={submit} className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <Label htmlFor="rate-currency">واحد پول</Label>
                    <Select
                      id="rate-currency"
                      value={currency}
                      onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
                    >
                      {CURRENCIES.map((code) => (
                        <option key={code} value={code}>
                          {CURRENCY_FA[code]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field>
                    <Label htmlFor="rate-value">نرخ (ریال)</Label>
                    <Input
                      id="rate-value"
                      inputMode="decimal"
                      dir="ltr"
                      value={rate}
                      onChange={(event) => setRate(event.target.value)}
                      placeholder="925000"
                      required
                    />
                  </Field>
                </div>
                <Field>
                  <Label htmlFor="rate-effective">زمان اعتبار (اختیاری)</Label>
                  <JalaliDateTimeInput
            businessTimeZone
                    id="rate-effective"
                    value={effectiveAt}
                    onChange={setEffectiveAt}
                    withTime
                    ariaLabel="زمان اعتبار نرخ"
                  />
                  <p className="mt-1 text-[11px] text-muted">
                    خالی بگذارید تا از لحظه ثبت معتبر باشد.
                  </p>
                </Field>
                <Field>
                  <Label htmlFor="rate-note">یادداشت (اختیاری)</Label>
                  <Input
                    id="rate-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={500}
                  />
                </Field>
                <Button type="submit" color="primary" disabled={saving}>
                  {saving ? 'در حال ثبت…' : 'ثبت نرخ'}
                </Button>
              </form>
            </section>

            <section className="rounded-card border border-border bg-surface p-5 lg:col-span-2">
              <h2 className="text-sm font-bold text-foreground">بازمحاسبه قیمت‌های ارزی</h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                قبل از ثبت نرخ جدید، محصولات دارای منبع دلاری/درهمی و قیمت ریالی حاصل
                را ببینید. بازمحاسبه اتمیک است و فقط ردیف‌هایی با منبع ارزی مشخص
                تغییر می‌کنند؛ ردیف‌های مبهم رد می‌شوند.
              </p>
              {recalcError && <div className="mt-3"><InlineError message={recalcError} /></div>}
              {recalcMessage && (
                <p className="mt-3 rounded-control bg-success/10 px-3 py-2 text-sm text-success" role="status">
                  {recalcMessage}
                </p>
              )}
              <form
                className="mt-4 grid gap-4 sm:grid-cols-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  setRecalcError(null)
                  setRecalcMessage(null)
                  setRecalcBusy(true)
                  const normalized = recalcRate.replace(/[,\s]/g, '')
                  void previewCurrencyRecalculation({
                    currency: recalcCurrency,
                    rialPerUnit: normalized,
                  })
                    .then(setRecalcPreview)
                    .catch((caught) => {
                      setRecalcPreview(null)
                      setRecalcError(translateApiError(caught))
                    })
                    .finally(() => setRecalcBusy(false))
                }}
              >
                <Field>
                  <Label htmlFor="recalc-currency">واحد پول</Label>
                  <Select
                    id="recalc-currency"
                    value={recalcCurrency}
                    onChange={(event) => {
                      setRecalcCurrency(event.target.value as CurrencyCode)
                      setRecalcPreview(null)
                    }}
                  >
                    {CURRENCIES.map((code) => (
                      <option key={code} value={code}>{CURRENCY_FA[code]}</option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label htmlFor="recalc-rate">نرخ جدید (ریال)</Label>
                  <Input
                    id="recalc-rate"
                    dir="ltr"
                    inputMode="decimal"
                    value={recalcRate}
                    onChange={(event) => {
                      setRecalcRate(event.target.value)
                      setRecalcPreview(null)
                    }}
                    placeholder="925000"
                    required
                  />
                </Field>
                <div className="flex items-end">
                  <Button type="submit" outline disabled={recalcBusy}>
                    {recalcBusy ? 'در حال محاسبه…' : 'پیش‌نمایش تأثیر'}
                  </Button>
                </div>
              </form>
              {recalcPreview && (
                <div className="mt-4 space-y-3" role="status">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span>کل: {formatFaNumber(recalcPreview.total)}</span>
                    <span className="text-primary">
                      قابل اعمال: {formatFaNumber(recalcPreview.affected)}
                    </span>
                    <span className="text-muted">
                      ردشده: {formatFaNumber(recalcPreview.skipped)}
                    </span>
                  </div>
                  {recalcPreview.warnings.map((warning) => (
                    <p key={warning} className="text-xs text-amber-700">{warning}</p>
                  ))}
                  <div className="max-h-64 overflow-auto rounded border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-strong">
                        <tr>
                          <th className="p-1.5 text-start">SKU</th>
                          <th className="p-1.5 text-start">مبلغ منبع</th>
                          <th className="p-1.5 text-start">قیمت فعلی</th>
                          <th className="p-1.5 text-start">قیمت پیشنهادی</th>
                          <th className="p-1.5 text-start">نتیجه</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recalcPreview.rows.slice(0, 50).map((row) => (
                          <tr key={row.variantId} className="border-t border-border">
                            <td className="p-1.5 font-mono" dir="ltr">{row.sku}</td>
                            <td className="p-1.5" dir="ltr">{row.sourceAmount}</td>
                            <td className="p-1.5" dir="ltr">{formatRial(row.currentRegularPrice)}</td>
                            <td className="p-1.5" dir="ltr">{formatRial(row.proposedRegularPrice)}</td>
                            <td className="p-1.5">{row.outcome === 'AFFECTED' ? 'اعمال می‌شود' : row.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button
                    color="primary"
                    disabled={recalcBusy || recalcPreview.affected === 0}
                    onClick={() => {
                      setRecalcBusy(true)
                      setRecalcError(null)
                      void applyCurrencyRecalculation({
                        currency: recalcCurrency,
                        rialPerUnit: recalcPreview.rialPerUnit,
                        effectiveAt: recalcPreview.effectiveAt,
                        previewToken: recalcPreview.previewToken,
                      })
                        .then((result) => {
                          setRecalcPreview(result)
                          setRecalcMessage(
                            `${formatFaNumber(result.affected)} محصول بازمحاسبه و نرخ جدید ثبت شد.`,
                          )
                          setRecalcRate('')
                          return load()
                        })
                        .catch((caught) => setRecalcError(translateApiError(caught)))
                        .finally(() => setRecalcBusy(false))
                    }}
                  >
                    ثبت نرخ و بازمحاسبه
                  </Button>
                </div>
              )}
            </section>

            <section className="rounded-card border border-border bg-surface p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <ArrowLeftRight className="size-4 text-primary" aria-hidden="true" />
                تبدیل مدیریتی
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                فقط برای کارهای داخلی؛ فروشگاه تنها تومان نمایش می‌دهد.
              </p>
              {conversionError && <div className="mt-3"><InlineError message={conversionError} /></div>}
              <form onSubmit={runConversion} className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <Label htmlFor="convert-currency">واحد</Label>
                    <Select
                      id="convert-currency"
                      value={convertCurrencyCode}
                      onChange={(event) =>
                        setConvertCurrencyCode(event.target.value as CurrencyCode)
                      }
                    >
                      {CURRENCIES.map((code) => (
                        <option key={code} value={code}>
                          {CURRENCY_FA[code]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field>
                    <Label htmlFor="convert-amount">مبلغ</Label>
                    <Input
                      id="convert-amount"
                      inputMode="decimal"
                      dir="ltr"
                      value={convertAmount}
                      onChange={(event) => setConvertAmount(event.target.value)}
                    />
                  </Field>
                </div>
                <Button type="submit" outline>
                  محاسبه ریال
                </Button>
              </form>
              {conversion && (
                <div className="mt-4 rounded-control bg-primary-subtle px-4 py-3" role="status">
                  <p className="text-xs text-muted">
                    {formatFaNumber(Number(conversion.amount))} {CURRENCY_FA[conversion.currency]}
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-primary">
                    {formatRial(conversion.rial)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    با نرخ {formatRial(conversion.rialPerUnit)}
                  </p>
                </div>
              )}
            </section>
          </div>

          <section className="space-y-3" aria-label="تاریخچه نرخ‌ها">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Info className="size-4" aria-hidden="true" />
              تاریخچه فقط افزودنی است؛ اصلاح نرخ با ثبت ردیف جدید انجام می‌شود.
            </div>
            <TableCard>
              <TablePagination
                position="top"
                page={page}
                totalPages={totalPages}
                total={data?.total ?? 0}
                onPageChange={setPage}
                limit={limit}
                limitOptions={[20, 50, 100]}
                onLimitChange={(next) => {
                  setLimit(next)
                  setPage(1)
                }}
                disabled={loading}
                totalLabel="نرخ"
              />
              <HorizontalScroll>
                <Table dense scrollContainer={false}>
                  <TableHead>
                    <TableRow>
                      <TableHeader>واحد پول</TableHeader>
                      <TableHeader>نرخ (ریال)</TableHeader>
                      <TableHeader>زمان اعتبار</TableHeader>
                      <TableHeader>ثبت‌کننده</TableHeader>
                      <TableHeader>یادداشت</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data?.items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{CURRENCY_FA[row.currency]}</TableCell>
                        <TableCell className="tabular-nums" dir="ltr">
                          {formatRial(row.rialPerUnit)}
                        </TableCell>
                        <TableCell>
                          {new Intl.DateTimeFormat('fa-IR', {
                            calendar: 'persian',
                            timeZone: 'Asia/Tehran',
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(row.effectiveAt))}
                        </TableCell>
                        <TableCell>
                          {row.createdBy ? (
                            <span className="font-mono text-[11px] text-muted" dir="ltr">
                              {row.createdBy}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs whitespace-normal">
                          {row.note ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </HorizontalScroll>
              {(!data || data.items.length === 0) && (
                <div className="p-6">
                  <EmptyState title="نرخی ثبت نشده است" description="اولین نرخ دلار یا درهم را ثبت کنید." />
                </div>
              )}
            </TableCard>
          </section>
        </>
      )}
    </div>
  )
}
