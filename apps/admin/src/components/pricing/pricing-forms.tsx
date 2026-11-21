import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import type {
  BrandSummary,
  CategoryPriceRuleDto,
  CreateCategoryPriceRuleInput,
  CreatePartnerTierInput,
  CreateProductPriceOverrideInput,
  CreatePromotionInput,
  PartnerTierSummary,
  ProductPriceOverrideDto,
  PromotionDto,
  PromotionType,
  UpdateCategoryPriceRuleInput,
  UpdatePartnerTierInput,
  UpdateProductPriceOverrideInput,
  UpdatePromotionInput,
} from '@sabz/types'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Input } from '../catalyst/input'
import { Select } from '../catalyst/select'
import { Text } from '../catalyst/text'
import { JalaliDateTimeInput } from '../ui/jalali-datetime-input'
import { useCategoryOptions } from '../../hooks/use-category-options'
import { translateApiError } from '../../lib/error-messages'
import { formatFaNumber } from '../../lib/format'
import {
  applyMoneyInput,
  groupMoneyDigits,
  restoreMoneyCaret,
} from '../../lib/money-input'
import { PROMOTION_TYPE_LABELS } from '../../lib/pricing-labels'
import { listBrands } from '../../services/brands'
import {
  createCategoryRule,
  createProductOverride,
  previewCategoryRule,
  createPromotion,
  updateCategoryRule,
  updateProductOverride,
  updatePromotion,
} from '../../services/pricing'
import {
  createPartnerTier,
  updatePartnerTier,
} from '../../services/partner-tiers'
import { getProduct, listProducts } from '../../services/products'

function useBrandOptions() {
  const [brands, setBrands] = useState<BrandSummary[]>([])
  useEffect(() => {
    let cancelled = false
    void listBrands({ page: 1, limit: 100 })
      .then((data) => {
        if (!cancelled) {
          setBrands(data.items)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBrands([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])
  return brands
}

function validateValue(type: PromotionType, raw: string): string | null {
  if (!raw.trim()) {
    return 'مبلغ تخفیف الزامی است.'
  }
  const num = Number(raw)
  if (!Number.isFinite(num) || num <= 0) {
    return 'مبلغ تخفیف باید عددی بزرگ‌تر از صفر باشد.'
  }
  if (type === 'PERCENT' && num > 100) {
    return 'درصد تخفیف نمی‌تواند بیشتر از ۱۰۰ باشد.'
  }
  return null
}

function validateWindow(startsAt: string, endsAt: string, required: boolean): string | null {
  if (!startsAt || !endsAt) {
    return required ? 'تاریخ شروع و پایان الزامی است.' : null
  }
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    return 'تاریخ پایان باید بعد از تاریخ شروع باشد.'
  }
  return null
}

function TypeField({
  value,
  onChange,
  disabled,
}: {
  value: PromotionType
  onChange: (next: PromotionType) => void
  disabled: boolean
}) {
  return (
    <Field>
      <Label>نوع تخفیف</Label>
      <Select
        name="type"
        value={value}
        onChange={(event) => onChange(event.target.value as PromotionType)}
        disabled={disabled}
      >
        {(Object.keys(PROMOTION_TYPE_LABELS) as PromotionType[]).map((type) => (
          <option key={type} value={type}>
            {PROMOTION_TYPE_LABELS[type]}
          </option>
        ))}
      </Select>
    </Field>
  )
}

function ValueField({
  type,
  value,
  onChange,
  disabled,
}: {
  type: PromotionType
  value: string
  onChange: (next: string) => void
  disabled: boolean
}) {
  const isPercent = type === 'PERCENT'
  // SS-265: only the money branch groups thousands; the parent state (and
  // validateValue/submit) keeps the canonical raw value.
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    if (isPercent) {
      onChange(event.target.value)
      return
    }
    const next = applyMoneyInput(event.target.value, event.target.selectionStart ?? 0)
    restoreMoneyCaret(event.target, next.caret)
    onChange(next.state)
  }
  return (
    <Field>
      <Label>{isPercent ? 'درصد تخفیف' : 'مبلغ تخفیف (ریال)'}</Label>
      <Input
        name="value"
        dir="ltr"
        inputMode="decimal"
        placeholder={isPercent ? '۱۰' : '۵۰۰۰۰'}
        value={isPercent ? value : groupMoneyDigits(value)}
        onChange={handleChange}
        disabled={disabled}
      />
      <Text className="text-xs text-muted">
        {isPercent ? 'عدد بین ۱ تا ۱۰۰.' : 'مبلغ به ریال؛ جداکننده هزارگان خودکار اعمال میشود.'}
      </Text>
    </Field>
  )
}

function ActiveField({
  value,
  onChange,
  disabled,
}: {
  value: boolean
  onChange: (next: boolean) => void
  disabled: boolean
}) {
  return (
    <Field>
      <div className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          name="isActive"
          checked={value}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
        />
        <Label>فعال</Label>
      </div>
    </Field>
  )
}

function ProductIdField({
  value,
  onChange,
  disabled,
  required,
}: {
  value: string
  onChange: (next: string) => void
  disabled: boolean
  required: boolean
}) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<Array<{ id: string; name: string }>>([])
  const [chosenName, setChosenName] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!query.trim()) {
      setOptions([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      setSearching(true)
      void listProducts({ search: query.trim(), page: 1, limit: 20 })
        .then((result) => {
          if (!cancelled) {
            setOptions(result.items.map((item) => ({ id: item.id, name: item.name })))
          }
        })
        .catch(() => {
          if (!cancelled) setOptions([])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  useEffect(() => {
    if (!value) {
      setChosenName(null)
      return
    }
    let cancelled = false
    void getProduct(value)
      .then((product) => {
        if (!cancelled) setChosenName(product.name)
      })
      .catch(() => {
        if (!cancelled) setChosenName(null)
      })
    return () => {
      cancelled = true
    }
  }, [value])

  return (
    <Field>
      <Label>محصول{required ? '' : ' (اختیاری)'}</Label>
      <Input
        name="productSearch"
        placeholder="جستجوی نام محصول…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        disabled={disabled}
        autoComplete="off"
      />
      <div className="mt-2 max-h-40 overflow-auto rounded-control border border-border">
        {searching ? (
          <p className="px-3 py-2 text-xs text-muted">در حال جستجو…</p>
        ) : options.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted">
            {query.trim() ? 'محصولی یافت نشد.' : 'نام محصول را جستجو کنید؛ نیازی به UUID نیست.'}
          </p>
        ) : (
          <ul role="list">
            {options.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  className={
                    option.id === value
                      ? 'block w-full bg-primary-subtle px-3 py-2 text-start text-sm text-primary'
                      : 'block w-full px-3 py-2 text-start text-sm hover:bg-surface-strong'
                  }
                  onClick={() => {
                    onChange(option.id)
                    setChosenName(option.name)
                    setQuery(option.name)
                    setOptions([])
                  }}
                  disabled={disabled}
                >
                  {option.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Text className="mt-1 text-xs text-muted">
        {chosenName ? `انتخاب‌شده: ${chosenName}` : 'محصول را از نتایج جستجو انتخاب کنید.'}
      </Text>
    </Field>
  )
}

export function CategoryRuleForm({
  open,
  rule,
  onClose,
  onSuccess,
}: {
  open: boolean
  rule: CategoryPriceRuleDto | null
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = rule !== null
  const { categories } = useCategoryOptions()

  const [categoryId, setCategoryId] = useState('')
  const [type, setType] = useState<PromotionType>('PERCENT')
  const [value, setValue] = useState('')
  const [priority, setPriority] = useState('0')
  const [includeDescendants, setIncludeDescendants] = useState(false)
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [preview, setPreview] = useState<
    import('@sabz/types').CategoryRulePreviewResponse | null
  >(null)
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCategoryId(rule?.categoryId ?? '')
      setType(rule?.type ?? 'PERCENT')
      setValue(rule?.value ?? '')
      setPriority(String(rule?.priority ?? 0))
      setIncludeDescendants(rule?.includeDescendants ?? false)
      setStartsAt(rule?.startsAt ?? '')
      setEndsAt(rule?.endsAt ?? '')
      setIsActive(rule?.isActive ?? true)
      setPreview(null)
      setError(null)
    }
  }, [open, rule])

  const handleSubmit = async (): Promise<void> => {
    if (!categoryId) {
      setError('انتخاب دسته‌بندی الزامی است.')
      return
    }
    const valueError = validateValue(type, value)
    if (valueError) {
      setError(valueError)
      return
    }
    const windowError = validateWindow(startsAt, endsAt, false)
    if (windowError) {
      setError(windowError)
      return
    }
    if (preview === null) {
      setError('ابتدا پیش‌نمایش تأثیر قانون را بگیرید.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const priorityNum = Number(priority)
      if (isEdit) {
        const input: UpdateCategoryPriceRuleInput = {
          categoryId,
          type,
          value: value.trim(),
          isActive,
          startsAt: startsAt || null,
          endsAt: endsAt || null,
          includeDescendants,
          priority: Number.isFinite(priorityNum) ? Math.trunc(priorityNum) : 0,
        }
        await updateCategoryRule(rule.id, input)
      } else {
        const input: CreateCategoryPriceRuleInput = {
          categoryId,
          type,
          value: value.trim(),
          isActive,
          includeDescendants,
          priority: Number.isFinite(priorityNum) ? Math.trunc(priorityNum) : 0,
          ...(startsAt ? { startsAt } : {}),
          ...(endsAt ? { endsAt } : {}),
        }
        await createCategoryRule(input)
      }
      onSuccess()
    } catch (error) {
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="md">
      <AlertTitle>{isEdit ? 'ویرایش قانون دسته‌بندی' : 'افزودن قانون دسته‌بندی'}</AlertTitle>
      <AlertDescription>
        {isEdit ? 'قانون قیمت دسته‌بندی را ویرایش کنید.' : 'قانون جدید برای یک دسته‌بندی ثبت کنید.'}
      </AlertDescription>
      <AlertBody>
        <div className="space-y-5">
          <Field>
            <Label>دسته‌بندی</Label>
            <Select
              name="categoryId"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={submitting}
            >
              <option value="">انتخاب کنید…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <TypeField value={type} onChange={setType} disabled={submitting} />
          <ValueField type={type} value={value} onChange={setValue} disabled={submitting} />

          <Field>
            <Label>اولویت (عدد کمتر، اولویت بیشتر)</Label>
            <Input
              name="priority"
              type="number"
              dir="ltr"
              step={1}
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field>
            <Label>دامنه اعمال</Label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeDescendants}
                onChange={(event) => setIncludeDescendants(event.target.checked)}
                disabled={submitting}
              />
              این دسته‌بندی و همه زیردسته‌ها
            </label>
            <Text className="text-xs text-muted">
              بدون انتخاب، فقط محصولات مستقیم همین دسته‌بندی مشمول می‌شوند.
            </Text>
          </Field>

          <Field>
            <Label>شروع بازه (اختیاری)</Label>
            <JalaliDateTimeInput
              businessTimeZone
              id="rule-starts-at"
              value={startsAt || null}
              onChange={(value) => setStartsAt(value ?? '')}
              withTime
              ariaLabel="شروع بازه قانون"
              disabled={submitting}
            />
          </Field>

          <Field>
            <Label>پایان بازه (اختیاری)</Label>
            <JalaliDateTimeInput
              businessTimeZone
              id="rule-ends-at"
              value={endsAt || null}
              onChange={(value) => setEndsAt(value ?? '')}
              withTime
              ariaLabel="پایان بازه اورراید"
              disabled={submitting}
            />
          </Field>

          <ActiveField value={isActive} onChange={setIsActive} disabled={submitting} />

          {preview && (
            <div className="rounded-control border border-border p-3 text-sm" role="status">
              <p>
                {formatFaNumber(preview.productCount)} محصول، {formatFaNumber(preview.affected)} ردیف
                قابل اعمال، {formatFaNumber(preview.skipped)} ردیف ردشده، {formatFaNumber(preview.failed)} خطا.
              </p>
              {preview.warnings.map((warning) => (
                <p key={warning} className="mt-1 text-xs text-amber-700">{warning}</p>
              ))}
              {preview.conflicts.length > 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  {formatFaNumber(preview.conflicts.length)} قانون فعال/زمان‌بندی‌شده دیگر روی این دامنه وجود دارد؛
                  قانون با اولویت کمتر برنده می‌شود.
                </p>
              )}
            </div>
          )}
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button
          outline
          disabled={submitting || previewing}
          onClick={() => {
            if (!categoryId) {
              setError('انتخاب دسته‌بندی الزامی است.')
              return
            }
            const valueError = validateValue(type, value)
            if (valueError) {
              setError(valueError)
              return
            }
            setPreviewing(true)
            setError(null)
            void previewCategoryRule({
              categoryId,
              includeDescendants,
              type,
              value: value.trim(),
              startsAt: startsAt || null,
              endsAt: endsAt || null,
            })
              .then(setPreview)
              .catch((caught) => setError(translateApiError(caught)))
              .finally(() => setPreviewing(false))
          }}
        >
          {previewing ? 'در حال پیش‌نمایش…' : 'پیش‌نمایش تأثیر'}
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? 'در حال ذخیره…' : isEdit ? 'ذخیره تغییرات' : 'افزودن'}
        </Button>
      </AlertActions>
    </Alert>
  )
}

export function ProductOverrideForm({
  open,
  override,
  onClose,
  onSuccess,
}: {
  open: boolean
  override: ProductPriceOverrideDto | null
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = override !== null

  const [productId, setProductId] = useState('')
  const [kind, setKind] = useState<'ABSOLUTE' | 'ADJUSTMENT'>('ABSOLUTE')
  const [type, setType] = useState<PromotionType>('FIXED')
  const [value, setValue] = useState('')
  const [overridePrice, setOverridePrice] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setProductId(override?.productId ?? '')
      setKind(override?.overridePrice !== null && override?.overridePrice !== undefined ? 'ABSOLUTE' : 'ADJUSTMENT')
      setType(override?.type ?? 'FIXED')
      setValue(override?.value ?? '')
      setOverridePrice(override?.overridePrice ?? '')
      setStartsAt(override?.startsAt ?? '')
      setEndsAt(override?.endsAt ?? '')
      setIsActive(override?.isActive ?? true)
      setError(null)
    }
  }, [open, override])

  const handleSubmit = async (): Promise<void> => {
    if (!productId.trim()) {
      setError('شناسه محصول الزامی است.')
      return
    }
    if (kind === 'ABSOLUTE' && (!overridePrice.trim() || Number(overridePrice) <= 0)) {
      setError('قیمت نهایی اورراید باید بزرگ‌تر از صفر باشد.')
      return
    }
    if (kind === 'ADJUSTMENT') {
      const valueError = validateValue(type, value)
      if (valueError) {
        setError(valueError)
        return
      }
    }
    const windowError = validateWindow(startsAt, endsAt, false)
    if (windowError) {
      setError(windowError)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (isEdit) {
        const input: UpdateProductPriceOverrideInput =
          kind === 'ABSOLUTE'
            ? {
                type: null,
                value: null,
                overridePrice: overridePrice.trim(),
                isActive,
                startsAt: startsAt || null,
                endsAt: endsAt || null,
              }
            : {
                type,
                value: value.trim(),
                overridePrice: null,
                isActive,
                startsAt: startsAt || null,
                endsAt: endsAt || null,
              }
        await updateProductOverride(override.id, input)
      } else {
        const input: CreateProductPriceOverrideInput = {
          productId: productId.trim(),
          ...(kind === 'ABSOLUTE'
            ? { overridePrice: overridePrice.trim() }
            : { type, value: value.trim() }),
          isActive,
          ...(startsAt ? { startsAt } : {}),
          ...(endsAt ? { endsAt } : {}),
        }
        await createProductOverride(input)
      }
      onSuccess()
    } catch (error) {
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="md">
      <AlertTitle>{isEdit ? 'ویرایش اورراید محصول' : 'افزودن اورراید محصول'}</AlertTitle>
      <AlertDescription>
        {isEdit ? 'اورراید قیمت محصول را ویرایش کنید.' : 'برای یک محصول اورراید قیمت ثبت کنید (هر محصول فقط یک اورراید).'}
      </AlertDescription>
      <AlertBody>
        <div className="space-y-5">
          {isEdit ? (
            <Field>
              <Label>محصول</Label>
              <Text className="text-sm text-muted">{override.productName}</Text>
            </Field>
          ) : (
            <ProductIdField value={productId} onChange={setProductId} disabled={submitting} required />
          )}

          <Field>
            <Label>شکل اورراید</Label>
            <Select
              value={kind}
              onChange={(event) => setKind(event.target.value as 'ABSOLUTE' | 'ADJUSTMENT')}
              disabled={submitting}
            >
              <option value="ABSOLUTE">قیمت نهایی مطلق (ریال)</option>
              <option value="ADJUSTMENT">تخفیف درصدی/مبلغی از قیمت جاری</option>
            </Select>
          </Field>
          {kind === 'ABSOLUTE' ? (
            <Field>
              <Label>قیمت نهایی (ریال)</Label>
              <Input
                dir="ltr"
                inputMode="decimal"
                value={groupMoneyDigits(overridePrice)}
                onChange={(event) =>
                  setOverridePrice(event.target.value.replace(/[^\d.]/g, ''))
                }
                disabled={submitting}
              />
            </Field>
          ) : (
            <>
              <TypeField value={type} onChange={setType} disabled={submitting} />
              <ValueField type={type} value={value} onChange={setValue} disabled={submitting} />
            </>
          )}

          <Field>
            <Label>شروع بازه (اختیاری)</Label>
            <JalaliDateTimeInput
              businessTimeZone
              id="override-starts-at"
              value={startsAt || null}
              onChange={(value) => setStartsAt(value ?? '')}
              withTime
              ariaLabel="شروع بازه اورراید"
              disabled={submitting}
            />
          </Field>

          <Field>
            <Label>پایان بازه (اختیاری)</Label>
            <JalaliDateTimeInput
              businessTimeZone
              id="override-ends-at"
              value={endsAt || null}
              onChange={(value) => setEndsAt(value ?? '')}
              withTime
              ariaLabel="پایان بازه قانون"
              disabled={submitting}
            />
          </Field>

          <ActiveField value={isActive} onChange={setIsActive} disabled={submitting} />

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? 'در حال ذخیره…' : isEdit ? 'ذخیره تغییرات' : 'افزودن'}
        </Button>
      </AlertActions>
    </Alert>
  )
}

export function PromotionForm({
  open,
  promotion,
  onClose,
  onSuccess,
}: {
  open: boolean
  promotion: PromotionDto | null
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = promotion !== null
  const { categories } = useCategoryOptions()
  const brands = useBrandOptions()

  const [code, setCode] = useState('')
  const [titleFa, setTitleFa] = useState('')
  const [type, setType] = useState<PromotionType>('PERCENT')
  const [value, setValue] = useState('')
  const [minQuantity, setMinQuantity] = useState('1')
  const [scopeProductId, setScopeProductId] = useState('')
  const [scopeCategoryId, setScopeCategoryId] = useState('')
  const [scopeBrandId, setScopeBrandId] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCode(promotion?.code ?? '')
      setTitleFa(promotion?.titleFa ?? '')
      setType(promotion?.type ?? 'PERCENT')
      setValue(promotion?.value ?? '')
      setMinQuantity(String(promotion?.minQuantity ?? 1))
      setScopeProductId(promotion?.productId ?? '')
      setScopeCategoryId(promotion?.categoryId ?? '')
      setScopeBrandId(promotion?.brandId ?? '')
      setStartsAt(promotion?.startsAt ?? '')
      setEndsAt(promotion?.endsAt ?? '')
      setIsActive(promotion?.isActive ?? true)
      setError(null)
    }
  }, [open, promotion])

  const handleSubmit = async (): Promise<void> => {
    if (!code.trim()) {
      setError('کد پروموشن الزامی است.')
      return
    }
    if (!titleFa.trim()) {
      setError('عنوان پروموشن الزامی است.')
      return
    }
    const valueError = validateValue(type, value)
    if (valueError) {
      setError(valueError)
      return
    }
    const minQty = Number(minQuantity)
    if (!Number.isInteger(minQty) || minQty < 1) {
      setError('حداقل تعداد باید عدد صحیح بزرگ‌تر از صفر باشد.')
      return
    }
    const windowError = validateWindow(startsAt, endsAt, true)
    if (windowError) {
      setError(windowError)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (isEdit) {
        const input: UpdatePromotionInput = {
          code: code.trim(),
          titleFa: titleFa.trim(),
          type,
          value: value.trim(),
          startsAt,
          endsAt,
          isActive,
          productId: scopeProductId.trim() || null,
          categoryId: scopeCategoryId || null,
          brandId: scopeBrandId || null,
          minQuantity: minQty,
        }
        await updatePromotion(promotion.id, input)
      } else {
        const input: CreatePromotionInput = {
          code: code.trim(),
          titleFa: titleFa.trim(),
          type,
          value: value.trim(),
          startsAt,
          endsAt,
          isActive,
          minQuantity: minQty,
          ...(scopeProductId.trim() ? { productId: scopeProductId.trim() } : {}),
          ...(scopeCategoryId ? { categoryId: scopeCategoryId } : {}),
          ...(scopeBrandId ? { brandId: scopeBrandId } : {}),
        }
        await createPromotion(input)
      }
      onSuccess()
    } catch (error) {
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="md">
      <AlertTitle>{isEdit ? 'ویرایش پروموشن' : 'افزودن پروموشن'}</AlertTitle>
      <AlertDescription>
        {isEdit ? 'پروموشن را ویرایش کنید.' : 'پروموشن زمان‌بندی‌شده جدید ثبت کنید.'}
      </AlertDescription>
      <AlertBody>
        <div className="space-y-5">
          <Field>
            <Label>کد</Label>
            <Input
              name="code"
              dir="ltr"
              value={code}
              maxLength={64}
              onChange={(event) => setCode(event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field>
            <Label>عنوان</Label>
            <Input
              name="titleFa"
              value={titleFa}
              maxLength={255}
              onChange={(event) => setTitleFa(event.target.value)}
              disabled={submitting}
            />
          </Field>

          <TypeField value={type} onChange={setType} disabled={submitting} />
          <ValueField type={type} value={value} onChange={setValue} disabled={submitting} />

          <Field>
            <Label>حداقل تعداد</Label>
            <Input
              name="minQuantity"
              type="number"
              dir="ltr"
              min={1}
              step={1}
              value={minQuantity}
              onChange={(event) => setMinQuantity(event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field>
            <Label>محدوده (خالی = سراسری)</Label>
            <Text className="text-xs text-muted">
              هر سه خالی بماند یعنی پروموشن سراسری. محصول بر دسته‌بندی و برند اولویت دارد.
            </Text>
          </Field>

          <ProductIdField value={scopeProductId} onChange={setScopeProductId} disabled={submitting} required={false} />

          <Field>
            <Label>دسته‌بندی (اختیاری)</Label>
            <Select
              name="scopeCategoryId"
              value={scopeCategoryId}
              onChange={(event) => setScopeCategoryId(event.target.value)}
              disabled={submitting}
            >
              <option value="">بدون محدودیت دسته‌بندی</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field>
            <Label>برند (اختیاری)</Label>
            <Select
              name="scopeBrandId"
              value={scopeBrandId}
              onChange={(event) => setScopeBrandId(event.target.value)}
              disabled={submitting}
            >
              <option value="">بدون محدودیت برند</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field>
            <Label>شروع بازه</Label>
            <JalaliDateTimeInput
              businessTimeZone
              id="promotion-starts-at"
              value={startsAt || null}
              onChange={(value) => setStartsAt(value ?? '')}
              withTime
              ariaLabel="شروع بازه پروموشن"
              disabled={submitting}
            />
          </Field>

          <Field>
            <Label>پایان بازه</Label>
            <JalaliDateTimeInput
              businessTimeZone
              id="promotion-ends-at"
              value={endsAt || null}
              onChange={(value) => setEndsAt(value ?? '')}
              withTime
              ariaLabel="پایان بازه پروموشن"
              disabled={submitting}
            />
          </Field>

          <ActiveField value={isActive} onChange={setIsActive} disabled={submitting} />

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? 'در حال ذخیره…' : isEdit ? 'ذخیره تغییرات' : 'افزودن'}
        </Button>
      </AlertActions>
    </Alert>
  )
}

export function PartnerTierForm({
  open,
  tier,
  onClose,
  onSuccess,
}: {
  open: boolean
  tier: PartnerTierSummary | null
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = tier !== null

  const [name, setName] = useState('')
  const [discountPercent, setDiscountPercent] = useState('0')
  const [minOrderQuantity, setMinOrderQuantity] = useState('1')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(tier?.name ?? '')
      setDiscountPercent(tier?.discountPercent ?? '0')
      setMinOrderQuantity(String(tier?.minOrderQuantity ?? 1))
      setError(null)
    }
  }, [open, tier])

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('نام پله همکاری الزامی است.')
      return
    }
    const discount = Number(discountPercent)
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      setError('درصد تخفیف باید عددی بین ۰ تا ۱۰۰ باشد.')
      return
    }
    const minQty = Number(minOrderQuantity)
    if (!Number.isInteger(minQty) || minQty < 1) {
      setError('حداقل تعداد باید عدد صحیح بزرگ‌تر از صفر باشد.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (isEdit) {
        const input: UpdatePartnerTierInput = {
          name: name.trim(),
          discountPercent: discountPercent.trim(),
          minOrderQuantity: minQty,
        }
        await updatePartnerTier(tier.id, input)
      } else {
        const input: CreatePartnerTierInput = {
          name: name.trim(),
          discountPercent: discountPercent.trim(),
          minOrderQuantity: minQty,
        }
        await createPartnerTier(input)
      }
      onSuccess()
    } catch (formError) {
      setError(translateApiError(formError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="md">
      <AlertTitle>{isEdit ? 'ویرایش پله همکاری' : 'افزودن پله همکاری'}</AlertTitle>
      <AlertDescription>
        {isEdit
          ? 'پله همکاری را ویرایش کنید؛ همکاران تخصیص‌یافته بلافاصله قیمت جدید را می‌گیرند.'
          : 'پله همکاری جدید برای قیمت‌گذاری همکاران ثبت کنید.'}
      </AlertDescription>
      <AlertBody>
        <div className="space-y-5">
          <Field>
            <Label>نام پله</Label>
            <Input
              name="name"
              value={name}
              maxLength={80}
              placeholder="Tier 1 – Distributor"
              onChange={(event) => setName(event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field>
            <Label>درصد تخفیف</Label>
            <Input
              name="discountPercent"
              dir="ltr"
              inputMode="decimal"
              placeholder="10"
              value={discountPercent}
              onChange={(event) => setDiscountPercent(event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-muted">عدد بین ۰ تا ۱۰۰.</Text>
          </Field>

          <Field>
            <Label>حداقل تعداد</Label>
            <Input
              name="minOrderQuantity"
              type="number"
              dir="ltr"
              min={1}
              step={1}
              value={minOrderQuantity}
              onChange={(event) => setMinOrderQuantity(event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-muted">
              حداقل تعداد اقلام سبد برای فعال‌شدن قیمت این پله.
            </Text>
          </Field>

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? 'در حال ذخیره…' : isEdit ? 'ذخیره تغییرات' : 'افزودن'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
