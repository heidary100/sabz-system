import type { HomepageDraftSection, HomepageValidationIssue } from '@sabz/types'
import { Text } from '../../catalyst/text'
import { EmptyState } from '../../ui/empty-state'
import { StatusBadge } from '../../ui/status-badge'
import {
  HOMEPAGE_SECTION_REGISTRY,
  sectionTypeLabel,
} from '../../../lib/merchandising-homepage'
import { HeroCarouselSectionForm } from './hero-carousel-section-form'
import { TrustStripSectionForm } from './trust-strip-section-form'
import { CategoryDiscoverySectionForm } from './category-discovery-section-form'
import { OfferStripSectionForm } from './offer-strip-section-form'
import { CategorySpotlightSectionForm } from './category-spotlight-section-form'
import { ReadyToShipSectionForm } from './ready-to-ship-section-form'
import { ProductRailSectionForm } from './product-rail-section-form'
import { BrandShowcaseSectionForm } from './brand-showcase-section-form'
import { BlogFeatureSectionForm } from './blog-feature-section-form'

export function HomepageSectionConfigPanel({
  section,
  index,
  issues,
  disabled = false,
  onToggleVisibility,
  onChange,
}: {
  section: HomepageDraftSection | null
  index: number
  issues: HomepageValidationIssue[]
  disabled?: boolean
  onToggleVisibility: () => void
  onChange: (next: HomepageDraftSection) => void
}) {
  if (!section) {
    return (
      <EmptyState
        size="compact"
        title="بخشی را برای بررسی انتخاب کنید"
        description="از فهرست ساختار، یک بخش را انتخاب کنید تا اطلاعات ساختاری و تنظیمات آن را ببینید."
      />
    )
  }

  const definition = HOMEPAGE_SECTION_REGISTRY[section.type]
  const basePath = `sections[${index}].settings`

  if (!definition) {
    return (
      <section
        aria-labelledby="homepage-section-config-heading"
        className="space-y-4 rounded-xl border border-warning-border bg-warning-subtle p-4"
      >
        <div>
          <h2
            id="homepage-section-config-heading"
            className="text-sm font-semibold text-foreground"
          >
            بخش پشتیبانی‌نشده
          </h2>
          <Text className="text-sm text-warning">
            این نوع بخش در نسخه فعلی ویرایشگر شناخته نمی‌شود. داده آن حذف یا
            بازنویسی نمی‌شود؛ برای ویرایش آن به نسخه سازگار پنل مدیریت نیاز است.
          </Text>
        </div>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">کلید</dt>
            <dd dir="ltr" className="break-all text-foreground">
              {section.key}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">نوع ناشناخته</dt>
            <dd dir="ltr" className="break-all text-foreground">
              {String(section.type)}
            </dd>
          </div>
        </dl>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="homepage-section-config-heading"
      className="space-y-4 rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2
            id="homepage-section-config-heading"
            className="text-sm font-semibold text-foreground"
          >
            {sectionTypeLabel(section.type)}
          </h2>
          <Text className="text-xs text-muted">{definition.description}</Text>
        </div>
        <StatusBadge tone={section.isVisible ? 'success' : 'neutral'}>
          {section.isVisible ? 'قابل نمایش' : 'پنهان'}
        </StatusBadge>
      </div>

      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">ترتیب</dt>
          <dd className="text-foreground">
            {(index + 1).toLocaleString('fa-IR')}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">کلید</dt>
          <dd dir="ltr" className="break-all text-foreground">
            {section.key}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">نوع</dt>
          <dd dir="ltr" className="break-all text-foreground">
            {section.type}
          </dd>
        </div>
      </dl>

      <label className="flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={section.isVisible}
          disabled={disabled}
          onChange={onToggleVisibility}
          className="size-4 rounded border-border accent-primary"
        />
        این بخش در صفحه اصلی قابل نمایش باشد
      </label>

      {section.type === 'HERO_CAROUSEL' && (
        <HeroCarouselSectionForm
          section={section}
          issues={issues}
          basePath={basePath}
          disabled={disabled}
          onSettingsChange={(settings) => onChange({ ...section, settings })}
        />
      )}
      {section.type === 'TRUST_STRIP' && (
        <TrustStripSectionForm
          section={section}
          issues={issues}
          basePath={basePath}
          disabled={disabled}
          onSettingsChange={(settings) => onChange({ ...section, settings })}
        />
      )}
      {section.type === 'CATEGORY_DISCOVERY' && (
        <CategoryDiscoverySectionForm
          section={section}
          issues={issues}
          basePath={basePath}
          disabled={disabled}
          onSettingsChange={(settings) => onChange({ ...section, settings })}
        />
      )}
      {section.type === 'OFFER_STRIP' && (
        <OfferStripSectionForm
          section={section}
          issues={issues}
          basePath={basePath}
          disabled={disabled}
          onSettingsChange={(settings) => onChange({ ...section, settings })}
        />
      )}
      {section.type === 'CATEGORY_SPOTLIGHT' && (
        <CategorySpotlightSectionForm
          section={section}
          issues={issues}
          basePath={basePath}
          disabled={disabled}
          onSettingsChange={(settings) => onChange({ ...section, settings })}
        />
      )}
      {section.type === 'READY_TO_SHIP' && (
        <ReadyToShipSectionForm
          section={section}
          issues={issues}
          basePath={basePath}
          disabled={disabled}
          onSettingsChange={(settings) => onChange({ ...section, settings })}
        />
      )}
      {section.type === 'PRODUCT_RAIL' && (
        <ProductRailSectionForm
          section={section}
          issues={issues}
          basePath={basePath}
          disabled={disabled}
          onSettingsChange={(settings) => onChange({ ...section, settings })}
        />
      )}
      {section.type === 'BRAND_SHOWCASE' && (
        <BrandShowcaseSectionForm
          section={section}
          issues={issues}
          basePath={basePath}
          disabled={disabled}
          onSettingsChange={(settings) => onChange({ ...section, settings })}
        />
      )}
      {section.type === 'BLOG_FEATURE' && (
        <BlogFeatureSectionForm
          section={section}
          issues={issues}
          basePath={basePath}
          disabled={disabled}
          onSettingsChange={(settings) => onChange({ ...section, settings })}
        />
      )}
    </section>
  )
}
