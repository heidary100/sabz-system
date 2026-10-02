import { useState } from 'react'
import { Pencil, Percent, Plus, Trash2 } from 'lucide-react'
import { Badge } from '../components/catalyst/badge'
import { Button } from '../components/catalyst/button'
import { Field, Label } from '../components/catalyst/fieldset'
import { Select } from '../components/catalyst/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/catalyst/table'
import { DeleteConfirmDialog } from '../components/ui/delete-confirm-dialog'
import { EmptyState } from '../components/ui/empty-state'
import { Loading } from '../components/ui/loading'
import { PageHeader } from '../components/ui/page-header'
import { TableCard } from '../components/ui/table-card'
import {
  Pagination,
  PaginationGap,
  PaginationList,
  PaginationNext,
  PaginationPage,
  PaginationPrevious,
} from '../components/ui/pagination'
import {
  useCategoryRuleList,
  useProductOverrideList,
  usePromotionList,
} from '../hooks/use-pricing-list'
import { usePartnerTierList } from '../hooks/use-partner-tier-list'
import { translateApiError } from '../lib/error-messages'
import { formatDateTime, formatRial } from '../lib/format'
import { pageNumbers } from '../lib/pagination'
import {
  ACTIVE_LABELS,
  PRICING_ACTIVE_FILTER_LABELS,
  PRICING_TAB_LABELS,
  PRICING_TABS,
  PROMOTION_TYPE_LABELS,
  formatPercentValue,
  promotionScopeLabel,
  type PricingActiveFilter,
  type PricingTab,
} from '../lib/pricing-labels'
import {
  deleteCategoryRule,
  deleteProductOverride,
  deletePromotion,
} from '../services/pricing'
import { deletePartnerTier } from '../services/partner-tiers'
import {
  CategoryRuleForm,
  PartnerTierForm,
  ProductOverrideForm,
  PromotionForm,
} from '../components/pricing/pricing-forms'

const CREATE_LABELS: Record<PricingTab, string> = {
  rules: 'افزودن قانون',
  overrides: 'افزودن اورراید',
  promotions: 'افزودن پروموشن',
  tiers: 'افزودن پله',
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return active ? (
    <Button color="primary" onClick={onClick}>
      {children}
    </Button>
  ) : (
    <Button outline onClick={onClick}>
      {children}
    </Button>
  )
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge color={isActive ? 'green' : 'zinc'}>
      {isActive ? ACTIVE_LABELS.active : ACTIVE_LABELS.inactive}
    </Badge>
  )
}

function WindowCell({ startsAt, endsAt }: { startsAt: string | null; endsAt: string | null }) {
  if (!startsAt && !endsAt) {
    return <span>—</span>
  }
  return (
    <span>
      {formatDateTime(startsAt)} تا {formatDateTime(endsAt)}
    </span>
  )
}

function SectionShell({
  loading,
  error,
  hasResult,
  isEmpty,
  totalLine,
  page,
  totalPages,
  onPage,
  paginationLabel,
  emptyTitle,
  emptyDescription,
  emptyAction,
  refetch,
  children,
}: {
  loading: boolean
  error: unknown
  hasResult: boolean
  isEmpty: boolean
  totalLine: string
  page: number
  totalPages: number
  onPage: (next: number) => void
  paginationLabel: string
  emptyTitle: string
  emptyDescription: string
  emptyAction?: React.ReactNode
  refetch: () => void
  children: React.ReactNode
}) {
  return (
    <>
      {loading && !hasResult ? (
        <Loading compact label="در حال بارگذاری…" />
      ) : error ? (
        <div className="glass flex flex-col items-center gap-4 rounded-xl px-6 py-16 text-center">
          <p className="text-sm/6 text-muted">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={<Percent className="size-6" aria-hidden="true" />}
          title={emptyTitle}
          description={emptyDescription}
          actions={emptyAction}
        />
      ) : (
        <TableCard>
          <Table striped>{children}</Table>

          <div className="mt-4 border-t border-border pt-4">
            <Pagination aria-label={paginationLabel}>
              <PaginationPrevious
                disabled={page <= 1 || loading}
                onClick={() => onPage(page - 1)}
              />
              <PaginationList>
                {pageNumbers(page, totalPages).map((item, index) =>
                  item === 'gap' ? (
                    <PaginationGap key={`gap-${index}`} />
                  ) : (
                    <PaginationPage
                      key={item}
                      current={item === page}
                      disabled={loading}
                      onClick={() => onPage(item)}
                    >
                      {item}
                    </PaginationPage>
                  ),
                )}
              </PaginationList>
              <PaginationNext
                disabled={page >= totalPages || loading}
                onClick={() => onPage(page + 1)}
              />
            </Pagination>
          </div>
        </TableCard>
      )}

      {loading && hasResult && (
        <div className="flex items-center justify-center gap-3 py-4" role="status">
          <span
            aria-hidden="true"
            className="size-5 animate-spin rounded-full border-2 border-hunter-800 border-t-primary"
          />
          <span className="text-sm font-medium text-muted">در حال بارگذاری…</span>
        </div>
      )}

      <p className="text-xs text-muted">{totalLine}</p>
    </>
  )
}

function ActiveFilterField({
  value,
  onChange,
}: {
  value: PricingActiveFilter
  onChange: (next: PricingActiveFilter) => void
}) {
  return (
    <div className="flex w-full max-w-xs items-end gap-4">
      <Field className="w-full">
        <Label>وضعیت</Label>
        <Select
          name="active"
          value={value}
          onChange={(event) => onChange(event.target.value as PricingActiveFilter)}
        >
          {(Object.keys(PRICING_ACTIVE_FILTER_LABELS) as PricingActiveFilter[]).map((key) => (
            <option key={key} value={key}>
              {PRICING_ACTIVE_FILTER_LABELS[key]}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  )
}

export function PricingPage() {
  const [tab, setTab] = useState<PricingTab>('rules')
  const rules = useCategoryRuleList()
  const overrides = useProductOverrideList()
  const promotions = usePromotionList()
  const tiers = usePartnerTierList()

  const [ruleFormOpen, setRuleFormOpen] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)

  const [overrideFormOpen, setOverrideFormOpen] = useState(false)
  const [editingOverrideId, setEditingOverrideId] = useState<string | null>(null)
  const [deletingOverrideId, setDeletingOverrideId] = useState<string | null>(null)

  const [promotionFormOpen, setPromotionFormOpen] = useState(false)
  const [editingPromotionId, setEditingPromotionId] = useState<string | null>(null)
  const [deletingPromotionId, setDeletingPromotionId] = useState<string | null>(null)

  const [tierFormOpen, setTierFormOpen] = useState(false)
  const [editingTierId, setEditingTierId] = useState<string | null>(null)
  const [deletingTierId, setDeletingTierId] = useState<string | null>(null)

  const editingRule = rules.result?.items.find((item) => item.id === editingRuleId) ?? null
  const deletingRule = rules.result?.items.find((item) => item.id === deletingRuleId) ?? null
  const editingOverride =
    overrides.result?.items.find((item) => item.id === editingOverrideId) ?? null
  const deletingOverride =
    overrides.result?.items.find((item) => item.id === deletingOverrideId) ?? null
  const editingPromotion =
    promotions.result?.items.find((item) => item.id === editingPromotionId) ?? null
  const deletingPromotion =
    promotions.result?.items.find((item) => item.id === deletingPromotionId) ?? null
  const editingTier = tiers.tiers?.find((item) => item.id === editingTierId) ?? null
  const deletingTier = tiers.tiers?.find((item) => item.id === deletingTierId) ?? null

  const openCreate = (): void => {
    if (tab === 'rules') {
      setEditingRuleId(null)
      setRuleFormOpen(true)
    } else if (tab === 'overrides') {
      setEditingOverrideId(null)
      setOverrideFormOpen(true)
    } else if (tab === 'tiers') {
      setEditingTierId(null)
      setTierFormOpen(true)
    } else {
      setEditingPromotionId(null)
      setPromotionFormOpen(true)
    }
  }

  const handleDeleteRule = async (): Promise<void> => {
    if (deletingRuleId) {
      await deleteCategoryRule(deletingRuleId)
      setDeletingRuleId(null)
      void rules.refetch()
    }
  }

  const handleDeleteOverride = async (): Promise<void> => {
    if (deletingOverrideId) {
      await deleteProductOverride(deletingOverrideId)
      setDeletingOverrideId(null)
      void overrides.refetch()
    }
  }

  const handleDeletePromotion = async (): Promise<void> => {
    if (deletingPromotionId) {
      await deletePromotion(deletingPromotionId)
      setDeletingPromotionId(null)
      void promotions.refetch()
    }
  }

  const handleDeleteTier = async (): Promise<void> => {
    if (deletingTierId) {
      await deletePartnerTier(deletingTierId)
      setDeletingTierId(null)
      void tiers.refetch()
    }
  }

  const rulesTotalPages = rules.result
    ? Math.max(1, Math.ceil(rules.result.total / rules.limit))
    : 1
  const overridesTotalPages = overrides.result
    ? Math.max(1, Math.ceil(overrides.result.total / overrides.limit))
    : 1
  const promotionsTotalPages = promotions.result
    ? Math.max(1, Math.ceil(promotions.result.total / promotions.limit))
    : 1

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="قیمت‌گذاری"
        actions={
          <Button color="primary" onClick={openCreate}>
            <Plus data-slot="icon" />
            {CREATE_LABELS[tab]}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="بخش‌های قیمت‌گذاری">
        {PRICING_TABS.map((key) => (
          <TabButton key={key} active={tab === key} onClick={() => setTab(key)}>
            {PRICING_TAB_LABELS[key]}
          </TabButton>
        ))}
      </div>

      {tab === 'rules' && (
        <div className="space-y-6" role="tabpanel" aria-label={PRICING_TAB_LABELS.rules}>
          <ActiveFilterField value={rules.active} onChange={rules.setActive} />
          <SectionShell
            loading={rules.loading}
            error={rules.error}
            hasResult={rules.result !== null}
            isEmpty={!rules.result || rules.result.items.length === 0}
            totalLine={
              rules.result ? `مجموع: ${rules.result.total} قانون · ${rules.limit} مورد در هر صفحه` : ''
            }
            page={rules.page}
            totalPages={rulesTotalPages}
            onPage={rules.setPage}
            paginationLabel="صفحه‌بندی قوانین دسته‌بندی"
            emptyTitle="قانونی یافت نشد"
            emptyDescription="هنوز قانون قیمت‌گذاری برای دسته‌بندی‌ها ثبت نشده است."
            emptyAction={
              <Button outline onClick={openCreate}>
                افزودن قانون
              </Button>
            }
            refetch={() => void rules.refetch()}
          >
            <TableHead>
              <TableRow>
                <TableHeader>دسته‌بندی</TableHeader>
                <TableHeader>نوع</TableHeader>
                <TableHeader>مقدار</TableHeader>
                <TableHeader>بازه</TableHeader>
                <TableHeader>اولویت</TableHeader>
                <TableHeader>وضعیت</TableHeader>
                <TableHeader>عملیات</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {(rules.result?.items ?? []).map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium text-foreground">
                    {rule.categoryName}
                  </TableCell>
                  <TableCell>
                    <Badge color="zinc">{PROMOTION_TYPE_LABELS[rule.type]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted" dir="ltr">
                    {rule.type === 'PERCENT' ? formatPercentValue(rule.value) : formatRial(rule.value)}
                  </TableCell>
                  <TableCell className="text-muted">
                    <WindowCell startsAt={rule.startsAt} endsAt={rule.endsAt} />
                  </TableCell>
                  <TableCell className="text-muted" dir="ltr">
                    {rule.priority}
                  </TableCell>
                  <TableCell>
                    <StatusBadge isActive={rule.isActive} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        plain
                        onClick={() => {
                          setEditingRuleId(rule.id)
                          setRuleFormOpen(true)
                        }}
                      >
                        <Pencil data-slot="icon" />
                        ویرایش
                      </Button>
                      <Button outline onClick={() => setDeletingRuleId(rule.id)}>
                        <Trash2 data-slot="icon" />
                        حذف
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </SectionShell>
        </div>
      )}

      {tab === 'overrides' && (
        <div className="space-y-6" role="tabpanel" aria-label={PRICING_TAB_LABELS.overrides}>
          <ActiveFilterField value={overrides.active} onChange={overrides.setActive} />
          <SectionShell
            loading={overrides.loading}
            error={overrides.error}
            hasResult={overrides.result !== null}
            isEmpty={!overrides.result || overrides.result.items.length === 0}
            totalLine={
              overrides.result
                ? `مجموع: ${overrides.result.total} اورراید · ${overrides.limit} مورد در هر صفحه`
                : ''
            }
            page={overrides.page}
            totalPages={overridesTotalPages}
            onPage={overrides.setPage}
            paginationLabel="صفحه‌بندی اوررایدها"
            emptyTitle="اوررایدی یافت نشد"
            emptyDescription="هنوز اورراید قیمت برای محصولی ثبت نشده است."
            emptyAction={
              <Button outline onClick={openCreate}>
                افزودن اورراید
              </Button>
            }
            refetch={() => void overrides.refetch()}
          >
            <TableHead>
              <TableRow>
                <TableHeader>محصول</TableHeader>
                <TableHeader>نوع</TableHeader>
                <TableHeader>مقدار</TableHeader>
                <TableHeader>بازه</TableHeader>
                <TableHeader>وضعیت</TableHeader>
                <TableHeader>عملیات</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {(overrides.result?.items ?? []).map((override) => (
                <TableRow key={override.id}>
                  <TableCell className="font-medium text-foreground">
                    {override.productName}
                  </TableCell>
                  <TableCell>
                    <Badge color="zinc">{PROMOTION_TYPE_LABELS[override.type]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted" dir="ltr">
                    {override.type === 'PERCENT'
                      ? formatPercentValue(override.value)
                      : formatRial(override.value)}
                  </TableCell>
                  <TableCell className="text-muted">
                    <WindowCell startsAt={override.startsAt} endsAt={override.endsAt} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge isActive={override.isActive} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        plain
                        onClick={() => {
                          setEditingOverrideId(override.id)
                          setOverrideFormOpen(true)
                        }}
                      >
                        <Pencil data-slot="icon" />
                        ویرایش
                      </Button>
                      <Button outline onClick={() => setDeletingOverrideId(override.id)}>
                        <Trash2 data-slot="icon" />
                        حذف
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </SectionShell>
        </div>
      )}

      {tab === 'promotions' && (
        <div className="space-y-6" role="tabpanel" aria-label={PRICING_TAB_LABELS.promotions}>
          <ActiveFilterField value={promotions.active} onChange={promotions.setActive} />
          <SectionShell
            loading={promotions.loading}
            error={promotions.error}
            hasResult={promotions.result !== null}
            isEmpty={!promotions.result || promotions.result.items.length === 0}
            totalLine={
              promotions.result
                ? `مجموع: ${promotions.result.total} پروموشن · ${promotions.limit} مورد در هر صفحه`
                : ''
            }
            page={promotions.page}
            totalPages={promotionsTotalPages}
            onPage={promotions.setPage}
            paginationLabel="صفحه‌بندی پروموشن‌ها"
            emptyTitle="پروموشنی یافت نشد"
            emptyDescription="هنوز پروموشنی ثبت نشده است."
            emptyAction={
              <Button outline onClick={openCreate}>
                افزودن پروموشن
              </Button>
            }
            refetch={() => void promotions.refetch()}
          >
            <TableHead>
              <TableRow>
                <TableHeader>کد / عنوان</TableHeader>
                <TableHeader>محدوده</TableHeader>
                <TableHeader>نوع</TableHeader>
                <TableHeader>مقدار</TableHeader>
                <TableHeader>حداقل تعداد</TableHeader>
                <TableHeader>بازه</TableHeader>
                <TableHeader>وضعیت</TableHeader>
                <TableHeader>عملیات</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {(promotions.result?.items ?? []).map((promotion) => (
                <TableRow key={promotion.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-foreground" dir="ltr">
                        {promotion.code}
                      </span>
                      <span className="text-xs text-muted">{promotion.titleFa}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge color="zinc">{promotionScopeLabel(promotion)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge color="zinc">{PROMOTION_TYPE_LABELS[promotion.type]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted" dir="ltr">
                    {promotion.type === 'PERCENT'
                      ? formatPercentValue(promotion.value)
                      : formatRial(promotion.value)}
                  </TableCell>
                  <TableCell className="text-muted" dir="ltr">
                    {promotion.minQuantity}
                  </TableCell>
                  <TableCell className="text-muted">
                    <WindowCell startsAt={promotion.startsAt} endsAt={promotion.endsAt} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge isActive={promotion.isActive} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        plain
                        onClick={() => {
                          setEditingPromotionId(promotion.id)
                          setPromotionFormOpen(true)
                        }}
                      >
                        <Pencil data-slot="icon" />
                        ویرایش
                      </Button>
                      <Button outline onClick={() => setDeletingPromotionId(promotion.id)}>
                        <Trash2 data-slot="icon" />
                        حذف
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </SectionShell>
        </div>
      )}

      {tab === 'tiers' && (
        <div className="space-y-6" role="tabpanel" aria-label={PRICING_TAB_LABELS.tiers}>
          {tiers.loading && tiers.tiers === null ? (
            <Loading compact label="در حال بارگذاری…" />
          ) : tiers.error ? (
            <div className="glass flex flex-col items-center gap-4 rounded-xl px-6 py-16 text-center">
              <p className="text-sm/6 text-muted">{translateApiError(tiers.error)}</p>
              <Button color="primary" onClick={() => void tiers.refetch()}>
                تلاش مجدد
              </Button>
            </div>
          ) : !tiers.tiers || tiers.tiers.length === 0 ? (
            <EmptyState
              icon={<Percent className="size-6" aria-hidden="true" />}
              title="پله همکاری یافت نشد"
              description="هنوز پله همکاری ثبت نشده است؛ همکاران تازه‌تأیید بدون پله قابل تأیید نیستند."
              actions={
                <Button outline onClick={openCreate}>
                  افزودن پله
                </Button>
              }
            />
          ) : (
            <TableCard>
              <Table striped>
                <TableHead>
                  <TableRow>
                    <TableHeader>نام پله</TableHeader>
                    <TableHeader>درصد تخفیف</TableHeader>
                    <TableHeader>حداقل تعداد</TableHeader>
                    <TableHeader>همکاران</TableHeader>
                    <TableHeader>عملیات</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tiers.tiers.map((tier) => (
                    <TableRow key={tier.id}>
                      <TableCell className="font-medium text-foreground">{tier.name}</TableCell>
                      <TableCell className="text-muted" dir="ltr">
                        {formatPercentValue(tier.discountPercent)}
                      </TableCell>
                      <TableCell className="text-muted" dir="ltr">
                        {tier.minOrderQuantity}
                      </TableCell>
                      <TableCell className="text-muted" dir="ltr">
                        {tier.partnerCount ?? 0}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            plain
                            onClick={() => {
                              setEditingTierId(tier.id)
                              setTierFormOpen(true)
                            }}
                          >
                            <Pencil data-slot="icon" />
                            ویرایش
                          </Button>
                          <Button outline onClick={() => setDeletingTierId(tier.id)}>
                            <Trash2 data-slot="icon" />
                            حذف
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-4 text-xs text-muted">
                پله‌ای که همکارانی روی آن تخصیص یافته قابل حذف نیست؛ ابتدا همکاران را به پله
                دیگری منتقل کنید.
              </p>
            </TableCard>
          )}
        </div>
      )}

      <CategoryRuleForm
        open={ruleFormOpen}
        rule={editingRule}
        onClose={() => {
          setRuleFormOpen(false)
          setEditingRuleId(null)
        }}
        onSuccess={() => {
          setRuleFormOpen(false)
          setEditingRuleId(null)
          void rules.refetch()
        }}
      />

      <ProductOverrideForm
        open={overrideFormOpen}
        override={editingOverride}
        onClose={() => {
          setOverrideFormOpen(false)
          setEditingOverrideId(null)
        }}
        onSuccess={() => {
          setOverrideFormOpen(false)
          setEditingOverrideId(null)
          void overrides.refetch()
        }}
      />

      <PromotionForm
        open={promotionFormOpen}
        promotion={editingPromotion}
        onClose={() => {
          setPromotionFormOpen(false)
          setEditingPromotionId(null)
        }}
        onSuccess={() => {
          setPromotionFormOpen(false)
          setEditingPromotionId(null)
          void promotions.refetch()
        }}
      />

      <DeleteConfirmDialog
        open={deletingRuleId !== null}
        title="حذف قانون دسته‌بندی"
        description={
          deletingRule
            ? `آیا از حذف قانون قیمت «${deletingRule.categoryName}» مطمئن هستید؟ این عمل قابل بازگشت نیست.`
            : ''
        }
        confirmLabel="حذف"
        onClose={() => setDeletingRuleId(null)}
        onConfirm={handleDeleteRule}
      />

      <DeleteConfirmDialog
        open={deletingOverrideId !== null}
        title="حذف اورراید محصول"
        description={
          deletingOverride
            ? `آیا از حذف اورراید قیمت «${deletingOverride.productName}» مطمئن هستید؟ این عمل قابل بازگشت نیست.`
            : ''
        }
        confirmLabel="حذف"
        onClose={() => setDeletingOverrideId(null)}
        onConfirm={handleDeleteOverride}
      />

      <DeleteConfirmDialog
        open={deletingPromotionId !== null}
        title="حذف پروموشن"
        description={
          deletingPromotion
            ? `آیا از حذف پروموشن «${deletingPromotion.titleFa}» مطمئن هستید؟ این عمل قابل بازگشت نیست.`
            : ''
        }
        confirmLabel="حذف"
        onClose={() => setDeletingPromotionId(null)}
        onConfirm={handleDeletePromotion}
      />

      <PartnerTierForm
        open={tierFormOpen}
        tier={editingTier}
        onClose={() => {
          setTierFormOpen(false)
          setEditingTierId(null)
        }}
        onSuccess={() => {
          setTierFormOpen(false)
          setEditingTierId(null)
          void tiers.refetch()
        }}
      />

      <DeleteConfirmDialog
        open={deletingTierId !== null}
        title="حذف پله همکاری"
        description={
          deletingTier
            ? `آیا از حذف پله همکاری «${deletingTier.name}» مطمئن هستید؟ این عمل قابل بازگشت نیست.`
            : ''
        }
        confirmLabel="حذف"
        onClose={() => setDeletingTierId(null)}
        onConfirm={handleDeleteTier}
      />
    </div>
  )
}
