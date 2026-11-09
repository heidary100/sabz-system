import type {
  CreateMerchCampaignInput,
  MerchCampaignDto,
  MerchCampaignMediaAssignmentInput,
  MerchCampaignType,
  MerchCtaKind,
  MerchCtaTarget,
  MerchMediaSlot,
  UpdateMerchCampaignInput,
} from '@sabz/types'
import {
  MERCH_CAMPAIGN_MAX_BRANDS,
  MERCH_CAMPAIGN_MAX_CATEGORIES,
  MERCH_CAMPAIGN_MAX_MEDIA,
  MERCH_CAMPAIGN_MAX_PRODUCTS,
  MERCH_CAMPAIGN_TYPES,
  MERCH_CTA_KINDS,
  MERCH_MEDIA_SLOTS,
} from '@sabz/types'

import {
  tehranDateTimeInputToUtcIso,
  utcIsoToTehranDateTimeInput,
} from './tehran-time'

export const CAMPAIGN_TEXT_LIMITS = {
  internalName: 255,
  titleFa: 200,
  eyebrowFa: 120,
  subtitleFa: 300,
  descriptionFa: 1000,
  ctaLabelFa: 120,
} as const

export const CAMPAIGN_PRIORITY_MAX = 1_000_000
export const CAMPAIGN_MEDIA_ALT_MAX = 160

export interface CampaignMediaDraft {
  mediaId: string
  originalName: string
  mimeType: string
  publishedAt: string | null
  slot: MerchMediaSlot
  altFa: string
  focalX: string
  focalY: string
}

export interface CampaignFormState {
  internalName: string
  type: MerchCampaignType
  titleFa: string
  eyebrowFa: string
  subtitleFa: string
  descriptionFa: string
  ctaLabelFa: string
  ctaKind: MerchCtaKind
  ctaProductId: string
  ctaCategoryId: string
  ctaBrandId: string
  isEnabled: boolean
  startsAt: string
  endsAt: string
  priority: string
  productIds: string[]
  categoryIds: string[]
  brandIds: string[]
  media: CampaignMediaDraft[]
}

export interface CampaignMediaItemErrors {
  slot?: string
  altFa?: string
  focalX?: string
  focalY?: string
}

export interface CampaignFormErrors {
  internalName?: string
  type?: string
  titleFa?: string
  eyebrowFa?: string
  subtitleFa?: string
  descriptionFa?: string
  ctaLabelFa?: string
  cta?: string
  startsAt?: string
  endsAt?: string
  priority?: string
  products?: string
  categories?: string
  brands?: string
  media?: string
  mediaItems?: Record<string, CampaignMediaItemErrors>
}

export const EMPTY_CAMPAIGN_FORM: CampaignFormState = {
  internalName: '',
  type: 'SEASONAL',
  titleFa: '',
  eyebrowFa: '',
  subtitleFa: '',
  descriptionFa: '',
  ctaLabelFa: '',
  ctaKind: 'NONE',
  ctaProductId: '',
  ctaCategoryId: '',
  ctaBrandId: '',
  isEnabled: true,
  startsAt: '',
  endsAt: '',
  priority: '0',
  productIds: [],
  categoryIds: [],
  brandIds: [],
  media: [],
}

export function toTehranDateTimeInput(iso: string | null): string {
  return utcIsoToTehranDateTimeInput(iso)
}

/** Tehran `datetime-local` value → UTC ISO, or null when empty/invalid. */
export function fromTehranDateTimeInput(value: string): string | null {
  return tehranDateTimeInputToUtcIso(value)
}

function nullableText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function ctaTargetFromForm(form: CampaignFormState): MerchCtaTarget {
  switch (form.ctaKind) {
    case 'PRODUCT':
      return { kind: 'PRODUCT', productId: form.ctaProductId }
    case 'CATEGORY':
      return { kind: 'CATEGORY', categoryId: form.ctaCategoryId }
    case 'BRAND':
      return { kind: 'BRAND', brandId: form.ctaBrandId }
    case 'ALL_PRODUCTS':
      return { kind: 'ALL_PRODUCTS' }
    case 'NEW_ARRIVALS':
      return { kind: 'NEW_ARRIVALS' }
    case 'NONE':
    default:
      return { kind: 'NONE' }
  }
}

export function campaignFormFromDetail(dto: MerchCampaignDto): CampaignFormState {
  const cta = dto.cta
  return {
    internalName: dto.internalName,
    type: dto.type,
    titleFa: dto.titleFa,
    eyebrowFa: dto.eyebrowFa ?? '',
    subtitleFa: dto.subtitleFa ?? '',
    descriptionFa: dto.descriptionFa ?? '',
    ctaLabelFa: dto.ctaLabelFa ?? '',
    ctaKind: cta.kind,
    ctaProductId: cta.kind === 'PRODUCT' ? cta.productId : '',
    ctaCategoryId: cta.kind === 'CATEGORY' ? cta.categoryId : '',
    ctaBrandId: cta.kind === 'BRAND' ? cta.brandId : '',
    isEnabled: dto.isEnabled,
    startsAt: toTehranDateTimeInput(dto.startsAt),
    endsAt: toTehranDateTimeInput(dto.endsAt),
    priority: String(dto.priority),
    productIds: dto.products.map((item) => item.id),
    categoryIds: dto.categories.map((item) => item.id),
    brandIds: dto.brands.map((item) => item.id),
    media: dto.media.map((item) => ({
      mediaId: item.mediaId,
      originalName: item.originalName,
      mimeType: item.mimeType,
      publishedAt: item.publishedAt,
      slot: item.slot,
      altFa: item.altFa ?? '',
      focalX: String(item.focalX),
      focalY: String(item.focalY),
    })),
  }
}

export function buildMediaAssignments(
  media: CampaignMediaDraft[],
): MerchCampaignMediaAssignmentInput[] {
  return media.map((item) => ({
    mediaId: item.mediaId,
    slot: item.slot,
    focalX: Number(item.focalX),
    focalY: Number(item.focalY),
    altFa: nullableText(item.altFa),
  }))
}

export function mediaAssignmentKey(
  mediaId: string,
  slot: MerchMediaSlot,
): string {
  return `${mediaId}:${slot}`
}

function validateString(
  value: string,
  max: number,
  required: boolean,
  label: string,
): string | undefined {
  const trimmed = value.trim()
  if (required && trimmed === '') {
    return `${label} الزامی است.`
  }
  if (value.length > max) {
    return `${label} باید حداکثر ${max.toLocaleString('fa-IR')} کاراکتر باشد.`
  }
  return undefined
}

function validateIdCollection(
  values: string[],
  max: number,
  label: string,
): string | undefined {
  if (values.length > max) {
    return `${label} حداکثر ${max.toLocaleString('fa-IR')} مورد است.`
  }
  if (new Set(values).size !== values.length) {
    return `${label} تکراری مجاز نیست.`
  }
  return undefined
}

export function validateCampaignForm(
  form: CampaignFormState,
): CampaignFormErrors {
  const errors: CampaignFormErrors = {}

  const internalName = validateString(
    form.internalName,
    CAMPAIGN_TEXT_LIMITS.internalName,
    true,
    'نام داخلی',
  )
  if (internalName) errors.internalName = internalName

  if (!(MERCH_CAMPAIGN_TYPES as readonly string[]).includes(form.type)) {
    errors.type = 'نوع کمپین معتبر نیست.'
  }

  const titleFa = validateString(
    form.titleFa,
    CAMPAIGN_TEXT_LIMITS.titleFa,
    true,
    'عنوان فارسی',
  )
  if (titleFa) errors.titleFa = titleFa

  const eyebrowFa = validateString(
    form.eyebrowFa,
    CAMPAIGN_TEXT_LIMITS.eyebrowFa,
    false,
    'متن بالای عنوان',
  )
  if (eyebrowFa) errors.eyebrowFa = eyebrowFa

  const subtitleFa = validateString(
    form.subtitleFa,
    CAMPAIGN_TEXT_LIMITS.subtitleFa,
    false,
    'زیرعنوان',
  )
  if (subtitleFa) errors.subtitleFa = subtitleFa

  const descriptionFa = validateString(
    form.descriptionFa,
    CAMPAIGN_TEXT_LIMITS.descriptionFa,
    false,
    'توضیحات',
  )
  if (descriptionFa) errors.descriptionFa = descriptionFa

  if (!(MERCH_CTA_KINDS as readonly string[]).includes(form.ctaKind)) {
    errors.cta = 'نوع فراخوان معتبر نیست.'
  } else if (
    (form.ctaKind === 'PRODUCT' && !form.ctaProductId) ||
    (form.ctaKind === 'CATEGORY' && !form.ctaCategoryId) ||
    (form.ctaKind === 'BRAND' && !form.ctaBrandId)
  ) {
    errors.cta = 'مقصد فراخوان را انتخاب کنید.'
  }

  const ctaLabelFa = validateString(
    form.ctaLabelFa,
    CAMPAIGN_TEXT_LIMITS.ctaLabelFa,
    form.ctaKind !== 'NONE',
    'متن دکمه فراخوان',
  )
  if (ctaLabelFa) errors.ctaLabelFa = ctaLabelFa

  const startsAtIso = form.startsAt
    ? fromTehranDateTimeInput(form.startsAt)
    : null
  const endsAtIso = form.endsAt ? fromTehranDateTimeInput(form.endsAt) : null
  const startsAt = startsAtIso ? Date.parse(startsAtIso) : null
  const endsAt = endsAtIso ? Date.parse(endsAtIso) : null
  if (form.startsAt && startsAtIso === null) {
    errors.startsAt = 'زمان شروع معتبر نیست.'
  }
  if (form.endsAt && endsAtIso === null) {
    errors.endsAt = 'زمان پایان معتبر نیست.'
  }
  if (
    startsAt !== null &&
    endsAt !== null &&
    !Number.isNaN(startsAt) &&
    !Number.isNaN(endsAt) &&
    endsAt <= startsAt
  ) {
    errors.endsAt = 'زمان پایان باید بعد از زمان شروع باشد.'
  }

  if (!/^\d+$/.test(form.priority.trim())) {
    errors.priority = 'اولویت باید عدد صحیح نامنفی باشد.'
  } else if (Number(form.priority) > CAMPAIGN_PRIORITY_MAX) {
    errors.priority = `اولویت باید حداکثر ${CAMPAIGN_PRIORITY_MAX.toLocaleString('fa-IR')} باشد.`
  }

  const products = validateIdCollection(
    form.productIds,
    MERCH_CAMPAIGN_MAX_PRODUCTS,
    'محصولات',
  )
  if (products) errors.products = products
  const categories = validateIdCollection(
    form.categoryIds,
    MERCH_CAMPAIGN_MAX_CATEGORIES,
    'دسته‌بندی‌ها',
  )
  if (categories) errors.categories = categories
  const brands = validateIdCollection(
    form.brandIds,
    MERCH_CAMPAIGN_MAX_BRANDS,
    'برندها',
  )
  if (brands) errors.brands = brands

  if (form.media.length > MERCH_CAMPAIGN_MAX_MEDIA) {
    errors.media = `حداکثر ${MERCH_CAMPAIGN_MAX_MEDIA.toLocaleString('fa-IR')} رسانه مجاز است.`
  }
  const mediaItems: Record<string, CampaignMediaItemErrors> = {}
  const seen = new Set<string>()
  form.media.forEach((item, index) => {
    const itemErrors: CampaignMediaItemErrors = {}
    if (!(MERCH_MEDIA_SLOTS as readonly string[]).includes(item.slot)) {
      itemErrors.slot = 'جایگاه رسانه معتبر نیست.'
    } else {
      const key = mediaAssignmentKey(item.mediaId, item.slot)
      if (seen.has(key)) {
        itemErrors.slot = 'این رسانه در این جایگاه قبلاً انتخاب شده است.'
      }
      seen.add(key)
    }
    for (const [field, value] of [
      ['focalX', item.focalX],
      ['focalY', item.focalY],
    ] as const) {
      if (!/^\d+$/.test(value.trim())) {
        itemErrors[field] = 'مقدار باید عدد صحیح باشد.'
      } else if (Number(value) < 0 || Number(value) > 100) {
        itemErrors[field] = 'مقدار باید بین ۰ تا ۱۰۰ باشد.'
      }
    }
    if (item.altFa.length > CAMPAIGN_MEDIA_ALT_MAX) {
      itemErrors.altFa = `متن جایگزین باید حداکثر ${CAMPAIGN_MEDIA_ALT_MAX.toLocaleString('fa-IR')} کاراکتر باشد.`
    }
    if (Object.keys(itemErrors).length > 0) {
      mediaItems[String(index)] = itemErrors
    }
  })
  if (Object.keys(mediaItems).length > 0) {
    errors.mediaItems = mediaItems
  }

  return errors
}

export function campaignFormHasErrors(errors: CampaignFormErrors): boolean {
  return Object.keys(errors).length > 0
}

function arraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function ctaKey(cta: MerchCtaTarget): string {
  return JSON.stringify(cta)
}

export function buildCampaignCreateInput(
  form: CampaignFormState,
): CreateMerchCampaignInput {
  const input: CreateMerchCampaignInput = {
    internalName: form.internalName.trim(),
    type: form.type,
    titleFa: form.titleFa.trim(),
    eyebrowFa: nullableText(form.eyebrowFa),
    subtitleFa: nullableText(form.subtitleFa),
    descriptionFa: nullableText(form.descriptionFa),
    ctaLabelFa: nullableText(form.ctaLabelFa),
    cta: ctaTargetFromForm(form),
    isEnabled: form.isEnabled,
    startsAt: fromTehranDateTimeInput(form.startsAt),
    endsAt: fromTehranDateTimeInput(form.endsAt),
    priority: Number(form.priority),
  }
  if (form.productIds.length > 0) input.productIds = [...form.productIds]
  if (form.categoryIds.length > 0) input.categoryIds = [...form.categoryIds]
  if (form.brandIds.length > 0) input.brandIds = [...form.brandIds]
  if (form.media.length > 0) input.media = buildMediaAssignments(form.media)
  return input
}

/**
 * Builds a partial PATCH body containing only fields whose normalized value
 * changed. This preserves the backend's "validate only changed selections"
 * behavior and avoids failing an unrelated edit because an old product is no
 * longer PUBLISHED.
 */
export function buildCampaignUpdate(
  initial: CampaignFormState,
  current: CampaignFormState,
): UpdateMerchCampaignInput {
  const input: UpdateMerchCampaignInput = {}

  if (current.internalName.trim() !== initial.internalName.trim()) {
    input.internalName = current.internalName.trim()
  }
  if (current.type !== initial.type) {
    input.type = current.type
  }
  if (current.titleFa.trim() !== initial.titleFa.trim()) {
    input.titleFa = current.titleFa.trim()
  }
  if (nullableText(current.eyebrowFa) !== nullableText(initial.eyebrowFa)) {
    input.eyebrowFa = nullableText(current.eyebrowFa)
  }
  if (nullableText(current.subtitleFa) !== nullableText(initial.subtitleFa)) {
    input.subtitleFa = nullableText(current.subtitleFa)
  }
  if (nullableText(current.descriptionFa) !== nullableText(initial.descriptionFa)) {
    input.descriptionFa = nullableText(current.descriptionFa)
  }
  if (nullableText(current.ctaLabelFa) !== nullableText(initial.ctaLabelFa)) {
    input.ctaLabelFa = nullableText(current.ctaLabelFa)
  }
  if (ctaKey(ctaTargetFromForm(current)) !== ctaKey(ctaTargetFromForm(initial))) {
    input.cta = ctaTargetFromForm(current)
  }
  if (current.isEnabled !== initial.isEnabled) {
    input.isEnabled = current.isEnabled
  }
  if (current.startsAt !== initial.startsAt) {
    input.startsAt = fromTehranDateTimeInput(current.startsAt)
  }
  if (current.endsAt !== initial.endsAt) {
    input.endsAt = fromTehranDateTimeInput(current.endsAt)
  }
  if (current.priority.trim() !== initial.priority.trim()) {
    input.priority = Number(current.priority)
  }
  if (!arraysEqual(current.productIds, initial.productIds)) {
    input.productIds = [...current.productIds]
  }
  if (!arraysEqual(current.categoryIds, initial.categoryIds)) {
    input.categoryIds = [...current.categoryIds]
  }
  if (!arraysEqual(current.brandIds, initial.brandIds)) {
    input.brandIds = [...current.brandIds]
  }
  if (
    JSON.stringify(buildMediaAssignments(current.media)) !==
    JSON.stringify(buildMediaAssignments(initial.media))
  ) {
    input.media = buildMediaAssignments(current.media)
  }

  return input
}

export function hasCampaignUpdates(
  initial: CampaignFormState,
  current: CampaignFormState,
): boolean {
  return Object.keys(buildCampaignUpdate(initial, current)).length > 0
}
