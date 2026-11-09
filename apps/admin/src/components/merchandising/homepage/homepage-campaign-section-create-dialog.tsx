import { useEffect, useState } from 'react'
import {
  MERCH_BRAND_SHOWCASE_MAX_BRANDS,
  MERCH_CATEGORY_DISCOVERY_MAX_CATEGORIES,
  MERCH_HERO_MAX_SLIDES,
  type HomepageDraftSection,
  type HomepageSectionType,
} from '@sabz/types'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../../catalyst/alert'
import { Button } from '../../catalyst/button'
import { Field, Label } from '../../catalyst/fieldset'
import { Select } from '../../catalyst/select'
import { Text } from '../../catalyst/text'
import { InlineError } from '../../ui/inline-error'
import { StatusBadge } from '../../ui/status-badge'
import { useMerchCampaignDetails } from '../../../hooks/use-merch-campaign-details'
import {
  HOMEPAGE_SECTION_REGISTRY,
  sectionTypeLabel,
} from '../../../lib/merchandising-homepage'
import {
  CampaignCategorySummary,
  CampaignDetailHeader,
} from './campaign-section-common'

const CAMPAIGN_BACKED = new Set<HomepageSectionType>([
  'HERO_CAROUSEL',
  'CATEGORY_DISCOVERY',
  'OFFER_STRIP',
  'CATEGORY_SPOTLIGHT',
  'BRAND_SHOWCASE',
])

export function HomepageCampaignSectionCreateDialog({
  open,
  type,
  campaignId,
  onClose,
  onCreate,
}: {
  open: boolean
  type: HomepageSectionType | null
  campaignId: string | null
  onClose: () => void
  onCreate: (settings: HomepageDraftSection['settings']) => string | null
}) {
  const [primaryCategoryId, setPrimaryCategoryId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { details, loading, errors } = useMerchCampaignDetails(
    campaignId ? [campaignId] : [],
  )
  const detail = campaignId ? details[campaignId] : undefined
  const supported = type !== null && CAMPAIGN_BACKED.has(type)

  useEffect(() => {
    setPrimaryCategoryId('')
    setError(null)
  }, [campaignId, type, open])

  if (!open || !type || !campaignId || !supported) {
    return null
  }

  const categoryCount = detail?.categories.length ?? 0
  const categoryCountValid =
    categoryCount >= 1 &&
    categoryCount <= MERCH_CATEGORY_DISCOVERY_MAX_CATEGORIES
  const brandCount = detail?.brands.length ?? 0
  const brandCountValid =
    brandCount >= 1 && brandCount <= MERCH_BRAND_SHOWCASE_MAX_BRANDS
  const primaryValid =
    primaryCategoryId !== '' &&
    (detail?.categories.some((category) => category.id === primaryCategoryId) ??
      false)

  const canCreate =
    !loading[campaignId] &&
    !errors[campaignId] &&
    (type === 'HERO_CAROUSEL' ||
      type === 'OFFER_STRIP' ||
      (type === 'CATEGORY_DISCOVERY' && categoryCountValid) ||
      (type === 'CATEGORY_SPOTLIGHT' && primaryValid) ||
      (type === 'BRAND_SHOWCASE' && brandCountValid))

  const handleCreate = (): void => {
    setError(null)
    let settings: HomepageDraftSection['settings']
    switch (type) {
      case 'HERO_CAROUSEL':
        settings = { campaignIds: [campaignId] }
        break
      case 'CATEGORY_DISCOVERY':
        settings = { campaignId }
        break
      case 'OFFER_STRIP':
        settings = { campaignId, fallback: 'featured' }
        break
      case 'CATEGORY_SPOTLIGHT':
        settings = {
          campaignId,
          categoryId: primaryCategoryId,
          secondaryCategoryId: null,
        }
        break
      case 'BRAND_SHOWCASE':
        settings = { campaignId, productsPerBrand: 3 }
        break
      default:
        return
    }
    const result = onCreate(settings)
    if (result) {
      setError(result)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="lg">
      <AlertTitle>ایجاد بخش {sectionTypeLabel(type)}</AlertTitle>
      <AlertDescription>
        {HOMEPAGE_SECTION_REGISTRY[type].description} این بخش فقط پس از معتبر
        بودن ارتباط‌های اولیه ایجاد می‌شود و ارتباط‌های کمپین را تغییر نمی‌دهد.
      </AlertDescription>
      <AlertBody>
        <div className="space-y-3">
          {loading[campaignId] ? (
            <Text className="text-xs text-muted" role="status">
              در حال بررسی کمپین…
            </Text>
          ) : errors[campaignId] ? (
            <InlineError message={errors[campaignId]!} />
          ) : detail ? (
            <div className="space-y-3 rounded-xl border border-border bg-background/40 p-3">
              <CampaignDetailHeader campaign={detail} />

              {(type === 'CATEGORY_DISCOVERY' ||
                type === 'CATEGORY_SPOTLIGHT') && (
                <CampaignCategorySummary
                  campaign={detail}
                  emptyMessage="این کمپین دسته‌بندی ندارد و نمی‌تواند بخش انتخاب‌شده را ایجاد کند."
                />
              )}

              {type === 'CATEGORY_DISCOVERY' && !categoryCountValid && (
                <Text className="text-sm text-danger">
                  کمپین کشف دسته‌بندی باید بین ۱ تا{' '}
                  {MERCH_CATEGORY_DISCOVERY_MAX_CATEGORIES.toLocaleString(
                    'fa-IR',
                  )}{' '}
                  دسته‌بندی داشته باشد؛ این کمپین{' '}
                  {categoryCount.toLocaleString('fa-IR')} دسته‌بندی دارد.
                </Text>
              )}

              {type === 'CATEGORY_SPOTLIGHT' && (
                <Field>
                  <Label htmlFor="homepage-create-primary-category">
                    دسته‌بندی اصلی
                  </Label>
                  <Select
                    id="homepage-create-primary-category"
                    value={primaryCategoryId}
                    disabled={categoryCount === 0}
                    onChange={(event) =>
                      setPrimaryCategoryId(event.target.value)
                    }
                  >
                    <option value="">انتخاب دسته‌بندی اصلی</option>
                    {detail.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                  {categoryCount === 0 && (
                    <Text className="text-sm text-danger">
                      برای ایجاد این بخش، کمپین باید حداقل یک دسته‌بندی داشته
                      باشد.
                    </Text>
                  )}
                </Field>
              )}

              {type === 'BRAND_SHOWCASE' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={brandCountValid ? 'success' : 'danger'}>
                      {brandCount.toLocaleString('fa-IR')} برند
                    </StatusBadge>
                    <Text className="text-xs text-muted">
                      محدوده مجاز: ۱ تا{' '}
                      {MERCH_BRAND_SHOWCASE_MAX_BRANDS.toLocaleString('fa-IR')}{' '}
                      برند
                    </Text>
                  </div>
                  {detail.brands.length === 0 ? (
                    <Text className="text-sm text-danger">
                      کمپین برندی ندارد و ویترین برند با ارتباط‌های نامعتبر
                      ایجاد نمی‌شود.
                    </Text>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {detail.brands.map((brand) => (
                        <li key={brand.id}>
                          <StatusBadge tone="neutral">
                            {brand.name}
                          </StatusBadge>
                        </li>
                      ))}
                    </ul>
                  )}
                  {brandCount > MERCH_BRAND_SHOWCASE_MAX_BRANDS && (
                    <Text className="text-sm text-danger">
                      این کمپین بیش از{' '}
                      {MERCH_BRAND_SHOWCASE_MAX_BRANDS.toLocaleString('fa-IR')}{' '}
                      برند دارد؛ ویترین برند حداکثر{' '}
                      {MERCH_BRAND_SHOWCASE_MAX_BRANDS.toLocaleString('fa-IR')}{' '}
                      برند را پشتیبانی می‌کند.
                    </Text>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {type === 'HERO_CAROUSEL' && (
            <Text className="text-xs text-muted">
              این کاروسل تا{' '}
              {MERCH_HERO_MAX_SLIDES.toLocaleString('fa-IR')} کمپین پشتیبانی
              می‌کند؛ بقیه را پس از ایجاد اضافه کنید.
            </Text>
          )}
          {type === 'OFFER_STRIP' && (
            <Text className="text-xs text-muted">
              حالت جایگزین اولیه «نمایش محصولات منتخب» است و پس از ایجاد قابل
              تغییر است.
            </Text>
          )}
          {error && <InlineError message={error} />}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose}>
          انصراف
        </Button>
        <Button color="primary" disabled={!canCreate} onClick={handleCreate}>
          ایجاد بخش
        </Button>
      </AlertActions>
    </Alert>
  )
}
