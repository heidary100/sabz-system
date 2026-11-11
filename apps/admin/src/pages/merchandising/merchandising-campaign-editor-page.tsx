import { useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type {
  BrandSummary,
  CategoryTreeNode,
  MerchCampaignDto,
  ProductSummary,
} from '@sabz/types'
import { Button } from '../../components/catalyst/button'
import { EmptyState } from '../../components/ui/empty-state'
import { ErrorState } from '../../components/ui/error-state'
import { InlineError } from '../../components/ui/inline-error'
import { LinkButton } from '../../components/ui/link-button'
import { Loading } from '../../components/ui/loading'
import { PageHeader } from '../../components/ui/page-header'
import { CampaignArchiveDialog } from '../../components/merchandising/campaigns/campaign-archive-dialog'
import { CampaignAuditPanel } from '../../components/merchandising/campaigns/campaign-audit-panel'
import { CampaignMediaAssignments } from '../../components/merchandising/campaigns/campaign-media-assignments'
import { CampaignSelectionsPanel } from '../../components/merchandising/campaigns/campaign-selections-panel'
import type { CampaignSelectionMeta } from '../../components/merchandising/campaigns/campaign-selections-panel'
import { CampaignSettingsPanel } from '../../components/merchandising/campaigns/campaign-settings-panel'
import { CampaignUsagePanel } from '../../components/merchandising/campaigns/campaign-usage-panel'
import type { OrderedEntityItem } from '../../components/merchandising/campaigns/campaign-ordered-entity-list'
import { useMerchCampaignDetail } from '../../hooks/use-merch-campaign-detail'
import {
  EMPTY_CAMPAIGN_FORM,
  buildCampaignCreateInput,
  buildCampaignUpdate,
  campaignFormFromDetail,
  campaignFormHasErrors,
  hasCampaignUpdates,
  type CampaignFormErrors,
  type CampaignFormState,
  validateCampaignForm,
} from '../../lib/merchandising-campaign'
import {
  merchandisingErrorMessage,
  parseMerchandisingError,
} from '../../lib/merchandising-errors'
import { translateApiError } from '../../lib/error-messages'
import {
  createMerchCampaign,
  disableMerchCampaign,
  enableMerchCampaign,
  updateMerchCampaign,
} from '../../services/merchandising'

type EditorTab = 'settings' | 'selections' | 'media' | 'usage' | 'audit'

const EDITOR_TABS: Array<{ key: EditorTab; label: string }> = [
  { key: 'settings', label: 'تنظیمات' },
  { key: 'selections', label: 'انتخاب‌ها' },
  { key: 'media', label: 'رسانه' },
  { key: 'usage', label: 'وضعیت و استفاده' },
  { key: 'audit', label: 'گردش فعالیت' },
]

function emptyMeta(): CampaignSelectionMeta {
  return { products: {}, categories: {}, brands: {} }
}

function metaFromCampaign(campaign: MerchCampaignDto): CampaignSelectionMeta {
  return {
    products: Object.fromEntries(
      campaign.products.map((product) => [
        product.id,
        { name: product.name, slug: product.slug },
      ]),
    ),
    categories: Object.fromEntries(
      campaign.categories.map((category) => [
        category.id,
        { name: category.name, slug: category.slug },
      ]),
    ),
    brands: Object.fromEntries(
      campaign.brands.map((brand) => [
        brand.id,
        { name: brand.name, slug: brand.slug },
      ]),
    ),
  }
}

function TabButton({
  active,
  id,
  controls,
  onClick,
  onKeyDown,
  children,
}: {
  active: boolean
  id: string
  controls: string
  onClick: () => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
  children: ReactNode
}) {
  const shared = {
    role: 'tab' as const,
    id,
    'aria-selected': active,
    'aria-controls': controls,
    tabIndex: active ? 0 : -1,
    onClick,
    onKeyDown,
  }

  return active ? (
    <Button color="primary" {...shared}>
      {children}
    </Button>
  ) : (
    <Button outline {...shared}>
      {children}
    </Button>
  )
}

export function MerchandisingCampaignEditorPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const { campaign, loading, error, refetch, replaceCampaign } =
    useMerchCampaignDetail(id)

  const [form, setForm] = useState<CampaignFormState>(() => ({
    ...EMPTY_CAMPAIGN_FORM,
  }))
  const [initial, setInitial] = useState<CampaignFormState>(() => ({
    ...EMPTY_CAMPAIGN_FORM,
  }))
  const [meta, setMeta] = useState<CampaignSelectionMeta>(emptyMeta)
  const [tab, setTab] = useState<EditorTab>('settings')
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)

  useEffect(() => {
    if (!campaign) {
      return
    }
    const next = campaignFormFromDetail(campaign)
    setForm(next)
    setInitial(next)
    setMeta(metaFromCampaign(campaign))
  }, [campaign])

  const validationErrors = useMemo(() => validateCampaignForm(form), [form])
  const errors: CampaignFormErrors = showErrors ? validationErrors : {}
  const dirty = !isNew && hasCampaignUpdates(initial, form)
  const archived = campaign?.isArchived ?? false
  const disabled = saving || actionPending || archived

  const currentUsage = campaign?.usage
  const inUse =
    (currentUsage?.currentPublications.length ?? 0) > 0 ||
    (currentUsage?.scheduledPublications.length ?? 0) > 0

  useEffect(() => {
    if (!dirty) {
      return
    }
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const knownProducts: OrderedEntityItem[] = form.productIds.map((productId) => ({
    id: productId,
    label: meta.products[productId]?.name ?? productId,
  }))
  const knownCategories: OrderedEntityItem[] = form.categoryIds.map(
    (categoryId) => ({
      id: categoryId,
      label: meta.categories[categoryId]?.name ?? categoryId,
    }),
  )
  const knownBrands: OrderedEntityItem[] = form.brandIds.map((brandId) => ({
    id: brandId,
    label: meta.brands[brandId]?.name ?? brandId,
  }))

  const mediaErrors = (() => {
    if (!errors.mediaItems) {
      return undefined
    }
    return Array.from(
      { length: form.media.length },
      (_, index) => errors.mediaItems?.[String(index)],
    )
  })()

  const handleAddProduct = (product: ProductSummary): void => {
    setForm((prev) => ({
      ...prev,
      productIds: [...prev.productIds, product.id],
    }))
    setMeta((prev) => ({
      ...prev,
      products: {
        ...prev.products,
        [product.id]: {
          name: product.name,
          slug: product.slug,
          brandName: product.brand?.name ?? null,
        },
      },
    }))
  }

  const handleAddCategory = (category: CategoryTreeNode): void => {
    setForm((prev) => ({
      ...prev,
      categoryIds: [...prev.categoryIds, category.id],
    }))
    setMeta((prev) => ({
      ...prev,
      categories: {
        ...prev.categories,
        [category.id]: { name: category.name, slug: category.slug },
      },
    }))
  }

  const handleAddBrand = (brand: BrandSummary): void => {
    setForm((prev) => ({
      ...prev,
      brandIds: [...prev.brandIds, brand.id],
    }))
    setMeta((prev) => ({
      ...prev,
      brands: {
        ...prev.brands,
        [brand.id]: { name: brand.name, slug: brand.slug },
      },
    }))
  }

  const validate = (): boolean => {
    setShowErrors(true)
    if (campaignFormHasErrors(validationErrors)) {
      setActionError('فرم معتبر نیست؛ خطاهای مشخص‌شده را بررسی کنید.')
      return false
    }
    return true
  }

  const handleCreate = async (): Promise<void> => {
    if (saving || !validate()) {
      return
    }
    setSaving(true)
    setActionError(null)
    setActionMessage(null)
    try {
      const created = await createMerchCampaign(buildCampaignCreateInput(form))
      navigate(`/merchandising/campaigns/${created.id}`, { replace: true })
    } catch (error) {
      setActionError(merchandisingErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!campaign || saving || !validate()) {
      return
    }
    const body = buildCampaignUpdate(initial, form)
    if (Object.keys(body).length === 0) {
      setActionMessage('تغییری برای ذخیره وجود ندارد.')
      return
    }
    setSaving(true)
    setActionError(null)
    setActionMessage(null)
    try {
      const updated = await updateMerchCampaign(campaign.id, body)
      replaceCampaign(updated)
      setShowErrors(false)
      setActionMessage('تغییرات کمپین ذخیره شد.')
    } catch (error) {
      const parsed = parseMerchandisingError(error)
      setActionError(merchandisingErrorMessage(error))
      if (parsed?.status === 409) {
        await refetch()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleToggleEnabled = async (): Promise<void> => {
    if (!campaign || actionPending) {
      return
    }
    setActionPending(true)
    setActionError(null)
    setActionMessage(null)
    try {
      const updated = campaign.isEnabled
        ? await disableMerchCampaign(campaign.id)
        : await enableMerchCampaign(campaign.id)
      replaceCampaign(updated)
      setActionMessage(
        updated.isEnabled
          ? 'کمپین فعال شد؛ این تغییر آن را منتشر نمی‌کند.'
          : 'کمپین غیرفعال شد؛ محتوای منتشرشده تغییر نکرد.',
      )
    } catch (error) {
      const parsed = parseMerchandisingError(error)
      setActionError(merchandisingErrorMessage(error))
      if (parsed?.status === 409) {
        await refetch()
      }
    } finally {
      setActionPending(false)
    }
  }

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
  ): void => {
    const currentIndex = EDITOR_TABS.findIndex((item) => item.key === tab)
    if (currentIndex < 0) {
      return
    }
    const rtl = document.documentElement.dir === 'rtl'
    let nextIndex: number
    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = rtl
          ? (currentIndex + 1) % EDITOR_TABS.length
          : (currentIndex - 1 + EDITOR_TABS.length) % EDITOR_TABS.length
        break
      case 'ArrowRight':
        nextIndex = rtl
          ? (currentIndex - 1 + EDITOR_TABS.length) % EDITOR_TABS.length
          : (currentIndex + 1) % EDITOR_TABS.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = EDITOR_TABS.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    const nextKey = EDITOR_TABS[nextIndex]!.key
    setTab(nextKey)
    document.getElementById(`campaign-tab-${nextKey}`)?.focus()
  }

  const title = isNew
    ? 'کمپین جدید'
    : campaign?.internalName ?? 'ویرایش کمپین'
  const subtitle = isNew
    ? 'تنظیمات پایه کمپین را بسازید؛ پس از ایجاد، انتخاب‌ها، رسانه و وضعیت را کامل کنید.'
    : 'ویرایش محتوای منبع کمپین؛ انتشار عمومی فقط از طریق صفحه اصلی انجام می‌شود.'

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton to="/merchandising/campaigns" plain>
              بازگشت به فهرست
            </LinkButton>
            {!isNew && campaign && !archived && (
              <>
                <Button
                  outline
                  disabled={disabled || dirty}
                  title={
                    dirty
                      ? 'ابتدا تغییرات را ذخیره یا لغو کنید.'
                      : undefined
                  }
                  onClick={() => void handleToggleEnabled()}
                >
                  {actionPending
                    ? 'در حال ذخیره…'
                    : campaign.isEnabled
                      ? 'غیرفعال‌سازی'
                      : 'فعال‌سازی'}
                </Button>
                <Button
                  outline
                  disabled={disabled || dirty || inUse}
                  title={
                    inUse
                      ? 'کمپین در صفحه اصلی استفاده می‌شود.'
                      : dirty
                        ? 'ابتدا تغییرات را ذخیره کنید.'
                        : undefined
                  }
                  onClick={() => setArchiveOpen(true)}
                >
                  بایگانی
                </Button>
              </>
            )}
            <Button
              color="primary"
              disabled={
                saving ||
                actionPending ||
                archived ||
                (!isNew && !dirty)
              }
              onClick={() => void (isNew ? handleCreate() : handleSave())}
            >
              {saving
                ? isNew
                  ? 'در حال ایجاد…'
                  : 'در حال ذخیره…'
                : isNew
                  ? 'ایجاد و ادامه'
                  : 'ذخیره تغییرات'}
            </Button>
          </div>
        }
      />

      {isNew ? (
        <div className="space-y-4">
          {actionError && <InlineError message={actionError} />}
          {actionMessage && (
            <p
              role="status"
              className="rounded-lg bg-success-subtle px-3 py-2 text-sm text-success"
            >
              {actionMessage}
            </p>
          )}
          <CampaignSettingsPanel
            form={form}
            errors={errors}
            disabled={saving}
            knownProducts={knownProducts}
            knownCategories={knownCategories}
            knownBrands={knownBrands}
            onChange={setForm}
          />
        </div>
      ) : loading && !campaign ? (
        <Loading compact label="در حال بارگذاری کمپین…" />
      ) : error && !campaign ? (
        <ErrorState
          message={translateApiError(error)}
          onRetry={() => void refetch()}
        />
      ) : !campaign ? (
        <EmptyState
          title="کمپین پیدا نشد"
          description="ممکن است کمپین حذف شده باشد."
          actions={
            <LinkButton to="/merchandising/campaigns" outline>
              بازگشت به فهرست
            </LinkButton>
          }
        />
      ) : (
        <div className="space-y-4">
          {archived && (
            <p
              role="status"
              className="rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning"
            >
              این کمپین بایگانی شده و قابل ویرایش یا فعال‌سازی نیست. اطلاعات
              استفاده و گردش فعالیت همچنان قابل مشاهده است.
            </p>
          )}
          {inUse && !archived && (
            <p
              role="status"
              className="rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning"
            >
              این کمپین در نسخه منتشرشده یا زمان‌بندی‌شده صفحه اصلی استفاده
              می‌شود؛ بایگانی آن مسدود است.
            </p>
          )}
          {dirty && (
            <p
              role="status"
              className="rounded-lg bg-primary-subtle px-3 py-2 text-sm text-primary"
            >
              تغییرات ذخیره‌نشده‌ای وجود دارد.
            </p>
          )}
          {actionError && <InlineError message={actionError} />}
          {actionMessage && (
            <p
              role="status"
              className="rounded-lg bg-success-subtle px-3 py-2 text-sm text-success"
            >
              {actionMessage}
            </p>
          )}

          <div
            className="flex flex-wrap items-center gap-2"
            role="tablist"
            aria-label="بخش‌های ویرایش کمپین"
          >
            {EDITOR_TABS.map((item) => (
              <TabButton
                key={item.key}
                active={tab === item.key}
                id={`campaign-tab-${item.key}`}
                controls={`campaign-panel-${item.key}`}
                onClick={() => setTab(item.key)}
                onKeyDown={handleTabKeyDown}
              >
                {item.label}
              </TabButton>
            ))}
          </div>

          {EDITOR_TABS.map((item) => (
            <div
              key={item.key}
              role="tabpanel"
              id={`campaign-panel-${item.key}`}
              aria-labelledby={`campaign-tab-${item.key}`}
              tabIndex={
                tab === item.key && item.key === 'usage' ? 0 : undefined
              }
              hidden={tab !== item.key}
              className="space-y-4"
            >
              {tab === item.key && item.key === 'settings' && (
                <CampaignSettingsPanel
                  form={form}
                  errors={errors}
                  disabled={disabled}
                  knownProducts={knownProducts}
                  knownCategories={knownCategories}
                  knownBrands={knownBrands}
                  onChange={setForm}
                />
              )}

              {tab === item.key && item.key === 'selections' && (
                <CampaignSelectionsPanel
                  form={form}
                  meta={meta}
                  errors={errors}
                  disabled={disabled}
                  onChange={setForm}
                  onAddProduct={handleAddProduct}
                  onAddCategory={handleAddCategory}
                  onAddBrand={handleAddBrand}
                />
              )}

              {tab === item.key && item.key === 'media' && (
                <div className="space-y-3">
                  {errors.media && (
                    <p className="text-sm text-danger">{errors.media}</p>
                  )}
                  <CampaignMediaAssignments
                    value={form.media}
                    errors={mediaErrors}
                    disabled={disabled}
                    maxMedia={4}
                    onChange={(media) => setForm((prev) => ({ ...prev, media }))}
                  />
                </div>
              )}

              {tab === item.key && item.key === 'usage' && (
                <CampaignUsagePanel campaign={campaign} />
              )}

              {tab === item.key && item.key === 'audit' && (
                <CampaignAuditPanel campaignId={campaign.id} enabled />
              )}
            </div>
          ))}
        </div>
      )}

      <CampaignArchiveDialog
        open={archiveOpen}
        campaign={campaign}
        onClose={() => setArchiveOpen(false)}
        onArchived={(updated) => {
          replaceCampaign(updated)
          setActionMessage('کمپین بایگانی شد.')
        }}
        onConflict={() => {
          void refetch()
          setActionError('وضعیت استفاده تغییر کرده بود؛ اطلاعات تازه‌تر بارگذاری شد.')
        }}
      />
    </div>
  )
}
