import { useEffect, useState } from 'react'
import type {
  BrandSummary,
  CategoryTreeNode,
  HomepageValidationIssue,
  ProductRailSection,
  ProductRailSort,
} from '@sabz/types'
import { MERCH_PRODUCT_RAIL_MAX_PRODUCTS } from '@sabz/types'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../../catalyst/button'
import { Field, Label } from '../../catalyst/fieldset'
import { Input } from '../../catalyst/input'
import { Select } from '../../catalyst/select'
import { Text } from '../../catalyst/text'
import { InlineError } from '../../ui/inline-error'
import { useMerchCampaignDetails } from '../../../hooks/use-merch-campaign-details'
import {
  firstValidationMessage,
  HOMEPAGE_PRODUCT_RAIL_SORT_LABELS,
  HOMEPAGE_PRODUCT_RAIL_SORTS,
  isSafeHomepageActionHref,
} from '../../../lib/merchandising-homepage'
import { merchandisingErrorMessage } from '../../../lib/merchandising-errors'
import { getBrand } from '../../../services/brands'
import { getCategory } from '../../../services/categories'
import { CampaignBrandPickerDialog } from '../../merchandising/campaigns/campaign-brand-picker-dialog'
import { CampaignCategoryPickerDialog } from '../../merchandising/campaigns/campaign-category-picker-dialog'
import { CampaignDetailHeader } from './campaign-section-common'
import { HomepageCampaignPickerDialog } from './homepage-campaign-picker-dialog'

function FieldError({ message }: { message: string | null }) {
  return message ? <Text className="text-sm text-danger">{message}</Text> : null
}

export function ProductRailSectionForm({
  section,
  issues,
  basePath,
  disabled = false,
  onSettingsChange,
}: {
  section: ProductRailSection
  issues: HomepageValidationIssue[]
  basePath: string
  disabled?: boolean
  onSettingsChange: (settings: ProductRailSection['settings']) => void
}) {
  const [campaignPickerOpen, setCampaignPickerOpen] = useState(false)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [brandPickerOpen, setBrandPickerOpen] = useState(false)
  const [categoryName, setCategoryName] = useState<string | null>(null)
  const [brandName, setBrandName] = useState<string | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const settings = section.settings
  const source = settings.source
  const campaignId = source.kind === 'campaign' ? source.campaignId : ''
  const { details, loading, errors } = useMerchCampaignDetails(
    campaignId ? [campaignId] : [],
  )
  const campaignDetail = campaignId ? details[campaignId] : undefined
  const queryCategoryId =
    source.kind === 'query' ? source.categoryId ?? null : null
  const queryBrandId = source.kind === 'query' ? source.brandId ?? null : null

  useEffect(() => {
    if (!queryCategoryId) {
      setCategoryName(null)
      return
    }
    let cancelled = false
    void getCategory(queryCategoryId)
      .then((category) => {
        if (!cancelled) setCategoryName(category.name)
      })
      .catch((error) => {
        if (!cancelled) {
          setLookupError(merchandisingErrorMessage(error))
          setCategoryName(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [queryCategoryId])

  useEffect(() => {
    if (!queryBrandId) {
      setBrandName(null)
      return
    }
    let cancelled = false
    void getBrand(queryBrandId)
      .then((brand) => {
        if (!cancelled) setBrandName(brand.name)
      })
      .catch((error) => {
        if (!cancelled) {
          setLookupError(merchandisingErrorMessage(error))
          setBrandName(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [queryBrandId])

  const hrefError =
    settings.actionHref &&
    !isSafeHomepageActionHref(settings.actionHref)
      ? 'مقصد باید یک مسیر داخلی از /products، /categories یا /blog باشد.'
      : null
  const backendHrefError = firstValidationMessage(
    issues,
    basePath,
    'actionHref',
  )
  const titleError = firstValidationMessage(issues, basePath, 'title')
  const subtitleError = firstValidationMessage(issues, basePath, 'subtitle')
  const limitError =
    source.kind === 'query'
      ? firstValidationMessage(issues, basePath, 'source.limit')
      : null
  const campaignError = firstValidationMessage(
    issues,
    basePath,
    'source.campaignId',
  )
  const categoryError = firstValidationMessage(
    issues,
    basePath,
    'source.categoryId',
  )
  const brandError = firstValidationMessage(
    issues,
    basePath,
    'source.brandId',
  )
  const sortError = firstValidationMessage(issues, basePath, 'source.sort')

  const changeMode = (kind: 'campaign' | 'query'): void => {
    setLookupError(null)
    if (kind === 'campaign') {
      onSettingsChange({
        ...settings,
        source: { kind: 'campaign', campaignId: '' },
      })
    } else {
      onSettingsChange({
        ...settings,
        source: {
          kind: 'query',
          categoryId: null,
          brandId: null,
          sort: 'newest',
          limit: 8,
          inStockOnly: false,
        },
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <Label htmlFor="product-rail-title">عنوان</Label>
          <Input
            id="product-rail-title"
            value={settings.title}
            maxLength={120}
            disabled={disabled}
            onChange={(event) =>
              onSettingsChange({ ...settings, title: event.target.value })
            }
          />
          <FieldError message={titleError} />
        </Field>
        <Field>
          <Label htmlFor="product-rail-subtitle">زیرعنوان (اختیاری)</Label>
          <Input
            id="product-rail-subtitle"
            value={settings.subtitle ?? ''}
            maxLength={240}
            disabled={disabled}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                subtitle:
                  event.target.value === '' ? undefined : event.target.value,
              })
            }
          />
          <FieldError message={subtitleError} />
        </Field>
      </div>

      <Field>
        <Label htmlFor="product-rail-action-href">مقصد دکمه (اختیاری)</Label>
        <Input
          id="product-rail-action-href"
          dir="ltr"
          value={settings.actionHref ?? ''}
          placeholder="/products"
          disabled={disabled}
          onChange={(event) =>
            onSettingsChange({
              ...settings,
              actionHref:
                event.target.value === '' ? undefined : event.target.value,
            })
          }
        />
        <Text className="text-xs text-muted">
          فقط مسیرهای داخلی محصولات، دسته‌بندی‌ها یا وبلاگ مجازند. آدرس خارجی
          یا HTML پذیرفته نمی‌شود.
        </Text>
        {(hrefError || backendHrefError) && (
          <Text className="text-sm text-danger">
            {hrefError ?? backendHrefError}
          </Text>
        )}
      </Field>

      <Field>
        <Label htmlFor="product-rail-mode">منبع محصولات</Label>
        <Select
          id="product-rail-mode"
          value={source.kind}
          disabled={disabled}
          onChange={(event) =>
            changeMode(event.target.value as 'campaign' | 'query')
          }
        >
          <option value="campaign">کمپین</option>
          <option value="query">پرس‌وجوی کاتالوگ</option>
        </Select>
        <Text className="text-xs text-muted">
          حالت کمپین از محصولات همان کمپین استفاده می‌کند؛ حالت پرس‌وجو از
          فیلترهای کاتالوگ (دسته، برند، مرتب‌سازی و موجودی) استفاده می‌کند.
        </Text>
      </Field>

      {source.kind === 'campaign' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text className="text-sm font-medium text-foreground">
              کمپین منبع
            </Text>
            <Button
              outline
              disabled={disabled}
              onClick={() => setCampaignPickerOpen(true)}
            >
              <Plus data-slot="icon" />
              {campaignId ? 'تغییر کمپین' : 'انتخاب کمپین'}
            </Button>
          </div>
          {!campaignId ? (
            <Text className="rounded-xl border border-dashed border-border bg-background/50 px-4 py-6 text-center text-sm text-warning">
              برای حالت کمپین، یک کمپین انتخاب کنید.
            </Text>
          ) : loading[campaignId] ? (
            <Text className="text-xs text-muted" role="status">
              در حال بارگذاری جزئیات کمپین…
            </Text>
          ) : errors[campaignId] ? (
            <InlineError message={errors[campaignId]!} />
          ) : campaignDetail ? (
            <div className="rounded-xl border border-border bg-background/40 p-3">
              <CampaignDetailHeader campaign={campaignDetail} />
            </div>
          ) : null}
          {campaignError && (
            <Text className="text-sm text-danger">{campaignError}</Text>
          )}
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-border bg-background/40 p-3">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field>
              <Label>دسته‌بندی (اختیاری)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  outline
                  disabled={disabled}
                  onClick={() => setCategoryPickerOpen(true)}
                >
                  {queryCategoryId ? 'تغییر دسته‌بندی' : 'انتخاب دسته‌بندی'}
                </Button>
                {queryCategoryId && (
                  <Button
                    plain
                    disabled={disabled}
                    onClick={() => {
                      setLookupError(null)
                      onSettingsChange({
                        ...settings,
                        source: { ...source, categoryId: null },
                      })
                    }}
                  >
                    <Trash2 data-slot="icon" />
                    حذف
                  </Button>
                )}
              </div>
              <Text className="text-xs text-muted">
                {queryCategoryId
                  ? categoryName ?? 'در حال بارگذاری نام دسته‌بندی…'
                  : 'بدون فیلتر دسته‌بندی'}
              </Text>
              {categoryError && (
                <Text className="text-sm text-danger">{categoryError}</Text>
              )}
            </Field>
            <Field>
              <Label>برند (اختیاری)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  outline
                  disabled={disabled}
                  onClick={() => setBrandPickerOpen(true)}
                >
                  {queryBrandId ? 'تغییر برند' : 'انتخاب برند'}
                </Button>
                {queryBrandId && (
                  <Button
                    plain
                    disabled={disabled}
                    onClick={() => {
                      setLookupError(null)
                      onSettingsChange({
                        ...settings,
                        source: { ...source, brandId: null },
                      })
                    }}
                  >
                    <Trash2 data-slot="icon" />
                    حذف
                  </Button>
                )}
              </div>
              <Text className="text-xs text-muted">
                {queryBrandId
                  ? brandName ?? 'در حال بارگذاری نام برند…'
                  : 'بدون فیلتر برند'}
              </Text>
              <Text className="text-xs text-muted">
                فهرست برندها صفحه‌بندی می‌شود؛ جستجوی سروری ندارد.
              </Text>
              {brandError && (
                <Text className="text-sm text-danger">{brandError}</Text>
              )}
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field>
              <Label htmlFor="product-rail-sort">مرتب‌سازی</Label>
              <Select
                id="product-rail-sort"
                value={source.sort ?? 'newest'}
                disabled={disabled}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    source: {
                      ...source,
                      sort: event.target.value as ProductRailSort,
                    },
                  })
                }
              >
                {HOMEPAGE_PRODUCT_RAIL_SORTS.map((sort) => (
                  <option key={sort} value={sort}>
                    {HOMEPAGE_PRODUCT_RAIL_SORT_LABELS[sort]}
                  </option>
                ))}
              </Select>
              {sortError && (
                <Text className="text-sm text-danger">{sortError}</Text>
              )}
            </Field>
            <Field>
              <Label htmlFor="product-rail-limit">تعداد محصولات</Label>
              <Input
                id="product-rail-limit"
                type="number"
                min={1}
                max={MERCH_PRODUCT_RAIL_MAX_PRODUCTS}
                value={source.limit}
                disabled={disabled}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    source: {
                      ...source,
                      limit: Number(event.target.value),
                    },
                  })
                }
              />
              <Text className="text-xs text-muted">
                ۱ تا {MERCH_PRODUCT_RAIL_MAX_PRODUCTS.toLocaleString('fa-IR')}
              </Text>
              <FieldError message={limitError} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={source.inStockOnly ?? false}
              disabled={disabled}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  source: { ...source, inStockOnly: event.target.checked },
                })
              }
              className="size-4 rounded border-border accent-primary"
            />
            فقط محصولات موجود
          </label>
          {lookupError && <InlineError message={lookupError} />}
        </div>
      )}

      <HomepageCampaignPickerDialog
        open={campaignPickerOpen}
        selectedIds={campaignId ? [campaignId] : []}
        maxReached={false}
        pickLabel="انتخاب"
        onPick={(campaign) => {
          onSettingsChange({
            ...settings,
            source: { kind: 'campaign', campaignId: campaign.id },
          })
          setCampaignPickerOpen(false)
        }}
        onClose={() => setCampaignPickerOpen(false)}
      />
      <CampaignCategoryPickerDialog
        open={categoryPickerOpen}
        selectedIds={queryCategoryId ? [queryCategoryId] : []}
        maxReached={false}
        pickLabel="انتخاب"
        onPick={(category: CategoryTreeNode) => {
          if (source.kind === 'query') {
            onSettingsChange({
              ...settings,
              source: { ...source, categoryId: category.id },
            })
            setCategoryName(category.name)
            setLookupError(null)
          }
          setCategoryPickerOpen(false)
        }}
        onClose={() => setCategoryPickerOpen(false)}
      />
      <CampaignBrandPickerDialog
        open={brandPickerOpen}
        selectedIds={queryBrandId ? [queryBrandId] : []}
        maxReached={false}
        pickLabel="انتخاب"
        onPick={(brand: BrandSummary) => {
          if (source.kind === 'query') {
            onSettingsChange({
              ...settings,
              source: { ...source, brandId: brand.id },
            })
            setBrandName(brand.name)
            setLookupError(null)
          }
          setBrandPickerOpen(false)
        }}
        onClose={() => setBrandPickerOpen(false)}
      />
    </div>
  )
}
