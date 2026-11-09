const AUDIT_ACTION_LABELS: Record<string, string> = {
  // Authentication & users
  ACCOUNT_ACTIVATED: 'فعال‌سازی حساب',
  OTP_REQUESTED: 'درخواست کد تأیید',
  OTP_VERIFIED: 'تأیید کد',
  OTP_FAILED: 'خطا در تأیید کد',
  PROFILE_UPDATE: 'به‌روزرسانی پروفایل',
  USER_NATIONAL_ID_UPDATED: 'به‌روزرسانی کد ملی',
  SESSION_CREATED: 'ایجاد نشست',
  SESSION_REFRESHED: 'تمدید نشست',
  SESSION_REVOKED: 'لغو نشست',
  AUTHENTICATION_FAILED: 'خطای احراز هویت',
  USER_SUSPENDED: 'تعلیق کاربر',
  USER_UNSUSPENDED: 'رفع تعلیق کاربر',
  USER_UNLOCKED: 'بازکردن قفل کاربر',
  ROLE_ASSIGNED: 'اختصاص نقش',
  ROLE_REMOVED: 'حذف نقش',
  ADDRESS_CREATED: 'ایجاد آدرس',
  ADDRESS_UPDATED: 'به‌روزرسانی آدرس',
  ADDRESS_DELETED: 'حذف آدرس',

  // Partners
  PARTNER_APPLICATION_CREATED: 'ایجاد درخواست همکاری',
  PARTNER_APPLICATION_UPDATED: 'به‌روزرسانی درخواست همکاری',
  PARTNER_APPLICATION_SUBMITTED: 'ارسال درخواست همکاری',
  PARTNER_DOCUMENT_UPLOADED: 'بارگذاری سند',
  PARTNER_DOCUMENT_REMOVED: 'حذف سند',
  PARTNER_APPROVED: 'تأیید همکار',
  PARTNER_REJECTED: 'رد همکار',
  PARTNER_TIER_CHANGED: 'تغییر سطح همکار',
  PARTNER_TIER_CREATED: 'ایجاد سطح همکاری',
  PARTNER_TIER_UPDATED: 'به‌روزرسانی سطح همکاری',
  PARTNER_TIER_DELETED: 'حذف سطح همکاری',

  // Catalog
  PRODUCT_CREATED: 'ایجاد محصول',
  PRODUCT_UPDATED: 'به‌روزرسانی محصول',
  PRODUCT_DELETED: 'حذف محصول',
  PRODUCT_PUBLISHED: 'انتشار محصول',
  PRODUCT_ARCHIVED: 'بایگانی محصول',
  PRODUCT_VARIANT_CREATED: 'ایجاد نوع محصول',
  PRODUCT_VARIANT_UPDATED: 'به‌روزرسانی نوع محصول',
  PRODUCT_VARIANT_DELETED: 'حذف نوع محصول',
  PRODUCT_MEDIA_UPLOADED: 'بارگذاری رسانه محصول',
  PRODUCT_MEDIA_REMOVED: 'حذف رسانه محصول',
  PRODUCT_DESCRIPTION_IMAGE_UPLOADED: 'بارگذاری تصویر توضیحات محصول',
  PRODUCT_DESCRIPTION_IMAGE_IMPORTED: 'درون‌ریزی تصویر توضیحات محصول',
  PRODUCT_PRICE_OVERRIDE_CREATED: 'ایجاد بازنویسی قیمت محصول',
  PRODUCT_PRICE_OVERRIDE_UPDATED: 'به‌روزرسانی بازنویسی قیمت محصول',
  PRODUCT_PRICE_OVERRIDE_DELETED: 'حذف بازنویسی قیمت محصول',
  CATEGORY_CREATED: 'ایجاد دسته‌بندی',
  CATEGORY_UPDATED: 'به‌روزرسانی دسته‌بندی',
  CATEGORY_DELETED: 'حذف دسته‌بندی',
  CATEGORY_PRICE_RULE_CREATED: 'ایجاد قانون قیمت دسته‌بندی',
  CATEGORY_PRICE_RULE_UPDATED: 'به‌روزرسانی قانون قیمت دسته‌بندی',
  CATEGORY_PRICE_RULE_DELETED: 'حذف قانون قیمت دسته‌بندی',
  BRAND_CREATED: 'ایجاد برند',
  BRAND_UPDATED: 'به‌روزرسانی برند',
  BRAND_DELETED: 'حذف برند',
  PROMOTION_CREATED: 'ایجاد تخفیف',
  PROMOTION_UPDATED: 'به‌روزرسانی تخفیف',
  PROMOTION_DELETED: 'حذف تخفیف',

  // Inventory & warehouses
  INVENTORY_ADJUSTED: 'اصلاح موجودی',
  INVENTORY_RECEIVED: 'ورود موجودی',
  INVENTORY_RESERVED: 'رزرو موجودی',
  INVENTORY_RELEASED: 'آزادسازی رزرو موجودی',
  INVENTORY_CONSUMED: 'مصرف رزرو موجودی',
  WAREHOUSE_CREATED: 'ایجاد انبار',
  WAREHOUSE_UPDATED: 'به‌روزرسانی انبار',
  WAREHOUSE_ACTIVATED: 'فعال‌سازی انبار',
  WAREHOUSE_DEACTIVATED: 'غیرفعال‌سازی انبار',

  // Orders, returns, reviews, RFQs
  ORDER_PLACED: 'ثبت سفارش',
  ORDER_STATUS_CHANGED: 'تغییر وضعیت سفارش',
  ORDER_CANCELLED: 'لغو سفارش',
  SHIPMENT_UPDATED: 'به‌روزرسانی مرسوله',
  SHIPMENT_TRACKING_ADDED: 'افزودن ردیابی مرسوله',
  RETURN_REQUESTED: 'ثبت درخواست مرجوعی',
  RETURN_APPROVED: 'تأیید مرجوعی',
  RETURN_RECEIVED: 'دریافت مرجوعی',
  RETURN_COMPLETED: 'تکمیل مرجوعی',
  RETURN_REJECTED: 'رد مرجوعی',
  RETURN_CANCELLED: 'لغو مرجوعی',
  REVIEW_CREATED: 'ثبت نقد',
  REVIEW_APPROVED: 'تأیید نقد',
  REVIEW_REJECTED: 'رد نقد',
  RFQ_CREATED: 'ثبت استعلام',
  RFQ_QUOTED: 'اعلام قیمت استعلام',
  RFQ_ACCEPTED: 'پذیرش استعلام',
  RFQ_REJECTED: 'رد استعلام',
  RFQ_EXPIRED: 'انقضای استعلام',

  // Content
  BLOG_POST_CREATED: 'ایجاد مطلب وبلاگ',
  BLOG_POST_UPDATED: 'به‌روزرسانی مطلب وبلاگ',
  BLOG_POST_ARCHIVED: 'بایگانی مطلب وبلاگ',
  BLOG_CATEGORY_CREATED: 'ایجاد دسته وبلاگ',
  BLOG_CATEGORY_UPDATED: 'به‌روزرسانی دسته وبلاگ',
  BLOG_CATEGORY_DELETED: 'حذف دسته وبلاگ',

  // Merchandising campaigns
  MERCH_CAMPAIGN_CREATED: 'ایجاد کمپین',
  MERCH_CAMPAIGN_UPDATED: 'به‌روزرسانی کمپین',
  MERCH_CAMPAIGN_SELECTIONS_UPDATED: 'به‌روزرسانی انتخاب‌های کمپین',
  MERCH_CAMPAIGN_MEDIA_UPDATED: 'به‌روزرسانی رسانه کمپین',
  MERCH_CAMPAIGN_ENABLED: 'فعال‌سازی کمپین',
  MERCH_CAMPAIGN_DISABLED: 'غیرفعال‌سازی کمپین',
  MERCH_CAMPAIGN_ARCHIVED: 'بایگانی کمپین',

  // Merchandising media
  MERCH_MEDIA_UPLOADED: 'بارگذاری رسانه بازاریابی',
  MERCH_MEDIA_UPDATED: 'به‌روزرسانی رسانه بازاریابی',
  MERCH_MEDIA_DELETED: 'حذف رسانه بازاریابی',

  // Homepage draft
  HOMEPAGE_DRAFT_CREATED: 'ایجاد پیش‌نویس صفحه اصلی',
  HOMEPAGE_DRAFT_UPDATED: 'به‌روزرسانی پیش‌نویس صفحه اصلی',
  HOMEPAGE_DRAFT_VALIDATION_FAILED: 'خطای اعتبارسنجی پیش‌نویس صفحه اصلی',

  // Homepage publications
  HOMEPAGE_PUBLICATION_SCHEDULED: 'زمان‌بندی انتشار صفحه اصلی',
  HOMEPAGE_PUBLICATION_PUBLISHED: 'انتشار صفحه اصلی',
  HOMEPAGE_PUBLICATION_FAILED: 'خطا در انتشار صفحه اصلی',
  HOMEPAGE_PUBLICATION_CANCELLED: 'لغو انتشار زمان‌بندی‌شده صفحه اصلی',
  HOMEPAGE_SCHEDULE_CANCEL_FAILED: 'خطا در لغو انتشار زمان‌بندی‌شده',
  HOMEPAGE_ROLLBACK_CREATED: 'بازگردانی نسخه صفحه اصلی',
  HOMEPAGE_ROLLBACK_FAILED: 'خطا در بازگردانی نسخه صفحه اصلی',
  HOMEPAGE_SCHEDULED_ACTIVATED: 'فعال‌سازی انتشار زمان‌بندی‌شده صفحه اصلی',
  HOMEPAGE_SCHEDULED_ACTIVATION_BLOCKED: 'مسدود شدن فعال‌سازی انتشار صفحه اصلی',
  HOMEPAGE_SCHEDULED_ACTIVATION_FAILED: 'تلاش ناموفق فعال‌سازی انتشار صفحه اصلی',
}

const AUDIT_ENTITY_LABELS: Record<string, string> = {
  User: 'کاربر',
  UserProfile: 'پروفایل کاربر',
  UserSession: 'نشست کاربر',
  UserRole: 'نقش کاربر',
  Partner: 'همکار',
  PartnerTier: 'سطح همکاری',
  BusinessDocument: 'سند کسب‌وکار',
  Address: 'آدرس',
  Brand: 'برند',
  Category: 'دسته‌بندی',
  CategoryPriceRule: 'قانون قیمت دسته‌بندی',
  Product: 'محصول',
  ProductVariant: 'نوع محصول',
  ProductPriceOverride: 'بازنویسی قیمت محصول',
  Promotion: 'تخفیف',
  InventoryItem: 'قلم موجودی',
  Reservation: 'رزرو',
  Warehouse: 'انبار',
  Order: 'سفارش',
  Shipment: 'مرسوله',
  ReturnRequest: 'درخواست مرجوعی',
  Review: 'نقد',
  Rfq: 'استعلام',
  BlogPost: 'مطلب وبلاگ',
  BlogCategory: 'دسته وبلاگ',
  MerchCampaign: 'کمپین',
  MerchMedia: 'رسانه بازاریابی',
  HomepageDraft: 'پیش‌نویس صفحه اصلی',
  HomepagePublication: 'نسخه صفحه اصلی',
}

export const AUDIT_ACTION_ORDER: string[] = Object.keys(AUDIT_ACTION_LABELS)
export const AUDIT_ENTITY_ORDER: string[] = Object.keys(AUDIT_ENTITY_LABELS)

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action
}

export function auditEntityLabel(entity: string): string {
  return AUDIT_ENTITY_LABELS[entity] ?? entity
}
