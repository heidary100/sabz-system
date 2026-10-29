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
import { useCategoryOptions } from '../../hooks/use-category-options'
import { translateApiError } from '../../lib/error-messages'
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
  createPromotion,
  updateCategoryRule,
  updateProductOverride,
  updatePromotion,
} from '../../services/pricing'
import {
  createPartnerTier,
  updatePartnerTier,
} from '../../services/partner-tiers'
import { getProduct } from '../../services/products'

function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function localInputToIso(local: string): string {
  return new Date(local).toISOString()
}

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
  const [productName, setProductName] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [checking, setChecking] = useState(false)

  const lookup = async (id: string): Promise<void> => {
    const trimmed = id.trim()
    if (!trimmed) {
      setProductName(null)
      setNotFound(false)
      return
    }
    setChecking(true)
    try {
      const product = await getProduct(trimmed)
      setProductName(product.name)
      setNotFound(false)
    } catch {
      setProductName(null)
      setNotFound(true)
    } finally {
      setChecking(false)
    }
  }

  return (
    <Field>
      <Label>شناسه محصول{required ? '' : ' (اختیاری)'}</Label>
      <Input
        name="productId"
        dir="ltr"
        placeholder="UUID محصول"
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setProductName(null)
          setNotFound(false)
        }}
        onBlur={(event) => void lookup(event.target.value)}
        disabled={disabled}
      />
      <Text className="text-xs text-muted">
        {checking
          ? 'در حال بررسی…'
          : productName ?? (notFound ? 'محصولی با این شناسه یافت نشد.' : 'شناسه را وارد کنید تا نام محصول نمایش داده شود.')}
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
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCategoryId(rule?.categoryId ?? '')
      setType(rule?.type ?? 'PERCENT')
      setValue(rule?.value ?? '')
      setPriority(String(rule?.priority ?? 0))
      setStartsAt(isoToLocalInput(rule?.startsAt))
      setEndsAt(isoToLocalInput(rule?.endsAt))
      setIsActive(rule?.isActive ?? true)
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
          startsAt: startsAt ? localInputToIso(startsAt) : null,
          endsAt: endsAt ? localInputToIso(endsAt) : null,
          priority: Number.isFinite(priorityNum) ? Math.trunc(priorityNum) : 0,
        }
        await updateCategoryRule(rule.id, input)
      } else {
        const input: CreateCategoryPriceRuleInput = {
          categoryId,
          type,
          value: value.trim(),
          isActive,
          priority: Number.isFinite(priorityNum) ? Math.trunc(priorityNum) : 0,
          ...(startsAt ? { startsAt: localInputToIso(startsAt) } : {}),
          ...(endsAt ? { endsAt: localInputToIso(endsAt) } : {}),
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
            <Label>شروع بازه (اختیاری)</Label>
            <Input
              name="startsAt"
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field>
            <Label>پایان بازه (اختیاری)</Label>
            <Input
              name="endsAt"
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
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
  const [type, setType] = useState<PromotionType>('FIXED')
  const [value, setValue] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setProductId(override?.productId ?? '')
      setType(override?.type ?? 'FIXED')
      setValue(override?.value ?? '')
      setStartsAt(isoToLocalInput(override?.startsAt))
      setEndsAt(isoToLocalInput(override?.endsAt))
      setIsActive(override?.isActive ?? true)
      setError(null)
    }
  }, [open, override])

  const handleSubmit = async (): Promise<void> => {
    if (!productId.trim()) {
      setError('شناسه محصول الزامی است.')
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
    setSubmitting(true)
    setError(null)
    try {
      if (isEdit) {
        const input: UpdateProductPriceOverrideInput = {
          type,
          value: value.trim(),
          isActive,
          startsAt: startsAt ? localInputToIso(startsAt) : null,
          endsAt: endsAt ? localInputToIso(endsAt) : null,
        }
        await updateProductOverride(override.id, input)
      } else {
        const input: CreateProductPriceOverrideInput = {
          productId: productId.trim(),
          type,
          value: value.trim(),
          isActive,
          ...(startsAt ? { startsAt: localInputToIso(startsAt) } : {}),
          ...(endsAt ? { endsAt: localInputToIso(endsAt) } : {}),
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

          <TypeField value={type} onChange={setType} disabled={submitting} />
          <ValueField type={type} value={value} onChange={setValue} disabled={submitting} />

          <Field>
            <Label>شروع بازه (اختیاری)</Label>
            <Input
              name="startsAt"
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field>
            <Label>پایان بازه (اختیاری)</Label>
            <Input
              name="endsAt"
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
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
      setStartsAt(isoToLocalInput(promotion?.startsAt))
      setEndsAt(isoToLocalInput(promotion?.endsAt))
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
          startsAt: localInputToIso(startsAt),
          endsAt: localInputToIso(endsAt),
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
          startsAt: localInputToIso(startsAt),
          endsAt: localInputToIso(endsAt),
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
            <Input
              name="startsAt"
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field>
            <Label>پایان بازه</Label>
            <Input
              name="endsAt"
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
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
