import type {
  ApprovalDecision,
  ApprovalKey,
  DemoCampaignDefinition,
  DemoSeedManifest,
} from './types';
import {
  DEMO_BLOG_SLUG_PREFIX,
  DEMO_CAMPAIGN_PREFIX,
} from './constants';

/**
 * Content manifest for the homepage demo seed.
 *
 * `DEMO_APPROVALS` keeps the raw decisions pending for audit/tests. The exported
 * demo manifest below is approved for the reviewed local demonstration only;
 * it contains no delivery, warranty, authenticity or support promises that are
 * not already present in the storefront's own published business information.
 *
 * This file is content, not the execution engine. It must not contain
 * fabricated product details, delivery promises, warranty guarantees or
 * invented editorial claims.
 */

function approval(
  key: ApprovalKey,
  label: string,
  kind: ApprovalDecision['kind'],
  note: string,
): ApprovalDecision {
  return { key, label, approved: false, kind, note };
}

export const DEMO_APPROVALS: Record<ApprovalKey, ApprovalDecision> = {
  hero_assets: approval(
    'hero_assets',
    'Four hero assets versus existing product photography',
    'business-content',
    'Choose the hero art direction and supply desktop/mobile files.',
  ),
  blog_articles: approval(
    'blog_articles',
    'Three demo blog articles and cover assets',
    'business-content',
    'Approve article copy, titles, bylines and cover files.',
  ),
  blog_cover_strategy: approval(
    'blog_cover_strategy',
    'Browser-accessible public URL strategy for blog covers',
    'technical',
    'Approve the public API base and merchandising-media delivery path.',
  ),
  draft_replacement: approval(
    'draft_replacement',
    'Replace the existing homepage draft with a backed-up demo draft',
    'technical',
    'Requires --replace-draft and a verified persistent backup.',
  ),
  publication_supersede: approval(
    'publication_supersede',
    'Supersede the current published homepage while retaining all history',
    'technical',
    'Requires --publish, --acknowledge-publication-replacement and the publish confirmation environment variable.',
  ),
  media_reconciliation: approval(
    'media_reconciliation',
    'Allow reconciliation to clear publishedAt on non-demo media',
    'technical',
    'Must be rechecked at apply time; a previous zero count is not authorization.',
  ),
  call_for_price_ready_to_ship: approval(
    'call_for_price_ready_to_ship',
    'Allow CALL_FOR_PRICE products in READY_TO_SHIP',
    'business-content',
    'Choose whether call-for-price cards are acceptable in the demo rail.',
  ),
  trust_claims: approval(
    'trust_claims',
    'Exact trust-strip business claims',
    'business-content',
    'Explicitly approve delivery, authenticity, defect-reporting and ordering claims.',
  ),
  campaign_copy_schedule: approval(
    'campaign_copy_schedule',
    'Campaign copy and schedule',
    'business-content',
    'Approve campaign text, CTA labels, dates and any non-generic section copy. No 2020 or timeless schedule is assumed.',
  ),
  docker_execution_method: approval(
    'docker_execution_method',
    'Documented one-off Docker execution method',
    'technical',
    'Approve the documented `docker compose run --rm --no-deps` invocation.',
  ),
  final_storefront_demo: approval(
    'final_storefront_demo',
    'Run the final demo against a synchronized storefront',
    'technical',
    'Approve the later customer-facing demonstration run.',
  ),
  public_api_base_url: approval(
    'public_api_base_url',
    'Browser-facing public API base URL',
    'technical',
    'Supply a non-localhost, non-Compose public origin for media and blog covers.',
  ),
  ss245_post_retention: approval(
    'ss245_post_retention',
    'Keep the existing SS-245 test blog post published',
    'business-content',
    'The tool never mutates this post; approve its continued presence in the demo.',
  ),
};

const campaigns: DemoCampaignDefinition[] = [
  {
    key: 'hero-primary',
    internalName: `${DEMO_CAMPAIGN_PREFIX}hero-primary`,
    type: 'EDITORIAL',
    copy: {
      titleFa: 'ارتقای هوشمند برای میز کار',
      eyebrowFa: 'برای کار، مطالعه و ساختن',
      subtitleFa:
        'لپ‌تاپ‌های موجود را بر اساس اندازه، وزن و کاربری مقایسه کنید؛ از مدل‌های حرفه‌ای تا گیمینگ.',
      descriptionFa: null,
      ctaLabelFa: 'دیدن محصولات',
    },
    cta: { kind: 'ALL_PRODUCTS' },
    schedule: { startsAt: null, endsAt: null },
    mediaKeys: ['hero-primary-desktop', 'hero-primary-mobile'],
    selection: {
      products: {
        kind: 'explicit',
        slugs: [
          'lp-tap-aysvs-asus-mdl-um5606',
          'lp-tap-gymyng-am-as-ay-msi-mdl-katana-15hx-b14wfk',
          'lp-tap-astvk-dl-mdl-precision-5480',
        ],
      },
    },
    approval: 'campaign_copy_schedule',
  },
  {
    key: 'hero-secondary',
    internalName: `${DEMO_CAMPAIGN_PREFIX}hero-secondary`,
    type: 'EDITORIAL',
    copy: {
      titleFa: 'همراه دیجیتال، از صدا تا شارژ',
      eyebrowFa: 'برای روزهای بیرون از خانه',
      subtitleFa:
        'هدفون، پاوربانک و ساعت هوشمند از میان کالاهای موجود؛ برای انتخاب آگاهانه، مشخصات هر کالا را ببینید.',
      descriptionFa: null,
      ctaLabelFa: 'مشاهده محصولات',
    },
    cta: { kind: 'ALL_PRODUCTS' },
    schedule: { startsAt: null, endsAt: null },
    mediaKeys: ['hero-secondary-desktop', 'hero-secondary-mobile'],
    selection: {
      products: {
        kind: 'explicit',
        slugs: [
          'hndzfry-blvtvsy-ankr-mdl-r50i-nc-a3959',
          'pavrbank-pavrvlvzhy-mdl-ppbcha83-zrfyt-27000-myly-ampr-saat',
          'saat-hvshmnd-prvvan-mdl-viora-pws21',
        ],
      },
    },
    approval: 'campaign_copy_schedule',
  },
  {
    key: 'discovery',
    internalName: `${DEMO_CAMPAIGN_PREFIX}discovery`,
    type: 'CATEGORY',
    copy: {
      titleFa: 'از کدام بخش شروع می‌کنید؟',
      eyebrowFa: 'دسته‌بندی‌ها',
      subtitleFa:
        'مسیرهای اصلی کاتالوگ سبز سیستم؛ از کامپیوتر و لوازم جانبی موبایل تا گجت‌های هوشمند و کنسول بازی.',
      descriptionFa: null,
      ctaLabelFa: 'همه محصولات',
    },
    cta: { kind: 'ALL_PRODUCTS' },
    schedule: { startsAt: null, endsAt: null },
    mediaKeys: [],
    selection: { categories: { kind: 'top-published', limit: 6 } },
    approval: 'campaign_copy_schedule',
  },
  {
    key: 'offer',
    internalName: `${DEMO_CAMPAIGN_PREFIX}offer`,
    type: 'EDITORIAL',
    copy: {
      titleFa: 'از میان موجودی واقعی',
      eyebrowFa: 'انتخاب فروشگاه',
      subtitleFa:
        'گزیده‌ای از لوازم جانبی و گجت‌های موجود در انبار؛ قیمت و موجودی هر کالا در صفحه آن مشخص است.',
      descriptionFa: null,
      ctaLabelFa: 'مشاهده محصولات',
    },
    cta: { kind: 'ALL_PRODUCTS' },
    schedule: { startsAt: null, endsAt: null },
    mediaKeys: [],
    selection: {
      products: {
        kind: 'explicit',
        slugs: [
          'aspykr-blvtvsy-ghabl-hml-prvvan-mdl-psb4119',
          'hndzfry-blvtvsy-ankr-mdl-r50i-a3949',
          'hab-usb3-0-chhar-pvrt-avrykv-mdl-pw4u-u3',
          'ghab-hard-akstrnal-avrykv-mdl-25pw1-u3',
          'pavrbank-khvrshydy-20-vat-20000-gryn-layn-gnsolf20pbbk',
          'saat-hvshmnd-prvvan-mdl-pws14n',
        ],
      },
    },
    approval: 'campaign_copy_schedule',
  },
  {
    key: 'spotlight',
    internalName: `${DEMO_CAMPAIGN_PREFIX}spotlight`,
    type: 'CATEGORY',
    copy: {
      titleFa: 'کامپیوتر و تجهیزات جانبی',
      eyebrowFa: 'دسته ویژه',
      subtitleFa:
        'از لپ‌تاپ و مانیتور تا هاب، حافظه و لوازم جانبی؛ یک میز کار کامل از کاتالوگ سبز سیستم.',
      descriptionFa: null,
      ctaLabelFa: 'دیدن محصولات',
    },
    cta: { kind: 'ALL_PRODUCTS' },
    schedule: { startsAt: null, endsAt: null },
    // Blog covers use the publication-gated media route; attaching them to
    // this campaign puts their IDs in the visible publication snapshot.
    mediaKeys: ['blog-cover-1', 'blog-cover-2', 'blog-cover-3'],
    // The homepage spotlight section publishes the first candidate category as
    // its primary category, so the referenced campaign must include it.
    selection: { categories: { kind: 'top-published', limit: 1 } },
    approval: 'campaign_copy_schedule',
  },
  {
    key: 'brands',
    internalName: `${DEMO_CAMPAIGN_PREFIX}brands`,
    type: 'BRAND',
    copy: {
      titleFa: 'برندهای حاضر در کاتالوگ',
      eyebrowFa: 'انتخاب برند',
      subtitleFa:
        'از لوازم جانبی روزمره تا تجهیزات تخصصی؛ محصولات هر برند را در یک نگاه ببینید.',
      descriptionFa: null,
      ctaLabelFa: 'همه محصولات',
    },
    cta: { kind: 'ALL_PRODUCTS' },
    schedule: { startsAt: null, endsAt: null },
    mediaKeys: [],
    selection: {
      brands: { kind: 'top-published', limit: 4 },
      products: { kind: 'brand-mix', brandsLimit: 4, perBrand: 3 },
    },
    approval: 'campaign_copy_schedule',
  },
];

const media: DemoSeedManifest['media'] = [
  {
    key: 'hero-primary-desktop',
    fileName: 'hero-primary-desktop.jpg',
    mimeType: 'image/jpeg',
    slot: 'HERO_DESKTOP',
    campaignKey: 'hero-primary',
    blogKey: null,
    altFa: 'لپ‌تاپ ایسوس زنبوک در تصویر کمپین ارتقای هوشمند',
    approval: 'hero_assets',
  },
  {
    key: 'hero-primary-mobile',
    fileName: 'hero-primary-mobile.jpg',
    mimeType: 'image/jpeg',
    slot: 'HERO_MOBILE',
    campaignKey: 'hero-primary',
    blogKey: null,
    altFa: 'لپ‌تاپ ایسوس زنبوک در تصویر کمپین ارتقای هوشمند',
    approval: 'hero_assets',
  },
  {
    key: 'hero-secondary-desktop',
    fileName: 'hero-secondary-desktop.jpg',
    mimeType: 'image/jpeg',
    slot: 'HERO_DESKTOP',
    campaignKey: 'hero-secondary',
    blogKey: null,
    altFa: 'هدفون، پاوربانک و ساعت هوشمند در تصویر کمپین همراه دیجیتال',
    approval: 'hero_assets',
  },
  {
    key: 'hero-secondary-mobile',
    fileName: 'hero-secondary-mobile.jpg',
    mimeType: 'image/jpeg',
    slot: 'HERO_MOBILE',
    campaignKey: 'hero-secondary',
    blogKey: null,
    altFa: 'هدفون، پاوربانک و ساعت هوشمند در تصویر کمپین همراه دیجیتال',
    approval: 'hero_assets',
  },
  {
    key: 'blog-cover-1',
    fileName: 'blog-cover-1.jpg',
    mimeType: 'image/jpeg',
    slot: 'EDITORIAL',
    campaignKey: 'spotlight',
    blogKey: 'demo-article-1',
    altFa: 'لپ‌تاپ ایسوس در تصویر مقاله راهنمای خرید لپ‌تاپ',
    approval: 'blog_articles',
  },
  {
    key: 'blog-cover-2',
    fileName: 'blog-cover-2.jpg',
    mimeType: 'image/jpeg',
    slot: 'EDITORIAL',
    campaignKey: 'spotlight',
    blogKey: 'demo-article-2',
    altFa: 'کیبورد گیمینگ در تصویر مقاله میز کار دیجیتال',
    approval: 'blog_articles',
  },
  {
    key: 'blog-cover-3',
    fileName: 'blog-cover-3.jpg',
    mimeType: 'image/jpeg',
    slot: 'EDITORIAL',
    campaignKey: 'spotlight',
    blogKey: 'demo-article-3',
    altFa: 'هدفون بی‌سیم در تصویر مقاله لوازم جانبی موبایل',
    approval: 'blog_articles',
  },
];

const blog: DemoSeedManifest['blog'] = [
  {
    key: 'demo-article-1',
    slug: `${DEMO_BLOG_SLUG_PREFIX}laptop-buying-guide`,
    title: 'راهنمای انتخاب لپ‌تاپ برای کار و مطالعه',
    excerpt:
      'اندازه، وزن، صفحه‌نمایش و نوع استفاده را قبل از خرید مشخص کنید تا انتخاب دقیق‌تری داشته باشید.',
    content:
      '<p>پیش از انتخاب لپ‌تاپ، مشخص کنید بیشتر چه کاری انجام می‌دهید: مطالعه و کار روزمره، کار حرفه‌ای با نرم‌افزارهای سنگین یا بازی. اندازه و وزن دستگاه روی جابه‌جایی روزانه اثر می‌گذارد و صفحه‌نمایش بزرگ‌تر برای کارهای تصویری راحت‌تر است.</p><p>مشخصات فنی و قیمت مدل‌های موجود را در صفحه محصول بررسی کنید و بین گزینه‌ها مقایسه کنید. اگر مدلی با قیمت تماس نمایش داده می‌شود، برای قیمت و موجودی با فروشگاه هماهنگ کنید.</p>',
    authorName: 'تیم سبز سیستم',
    coverAssetKey: 'blog-cover-1',
    publish: true,
    approval: 'blog_articles',
  },
  {
    key: 'demo-article-2',
    slug: `${DEMO_BLOG_SLUG_PREFIX}workspace-guide`,
    title: 'میز کار دیجیتال؛ از کیبورد تا حافظه',
    excerpt:
      'با چند قطعه درست، میز کار خانگی را مرتب‌تر و کاربردی‌تر کنیم؛ بدون خریدهای تکراری.',
    content:
      '<p>یک میز کار کاربردی معمولاً با نیازهای واقعی شروع می‌شود: یک کیبورد و ماوس راحت، فضای کافی برای ذخیره‌سازی و در صورت نیاز یک هاب برای اتصال دستگاه‌ها. قبل از خرید، تعداد پورت‌ها و نوع اتصال دستگاه‌هایتان را بررسی کنید.</p><p>لوازم جانبی را بر اساس استفاده روزانه انتخاب کنید. اگر فقط چند فایل جابه‌جا می‌کنید، یک فلش یا باکس اکسترنال کافی است؛ برای آرشیو بزرگ‌تر ظرفیت و سرعت درگاه را مقایسه کنید.</p>',
    authorName: 'تیم سبز سیستم',
    coverAssetKey: 'blog-cover-2',
    publish: true,
    approval: 'blog_articles',
  },
  {
    key: 'demo-article-3',
    slug: `${DEMO_BLOG_SLUG_PREFIX}mobile-accessories-guide`,
    title: 'لوازم جانبی موبایل؛ شارژ، صدا و همراهی روزانه',
    excerpt:
      'پاوربانک، هندزفری و کابل مناسب را بر اساس استفاده واقعی انتخاب کنید.',
    content:
      '<p>برای لوازم جانبی موبایل، ظرفیت پاوربانک و توان شارژ کابل را با دستگاه خود بررسی کنید. اگر روزهای پرکاری دارید، یک پاوربانک با ظرفیت مناسب و خروجی سازگار می‌تواند همراهی مطمئن‌تری باشد.</p><p>در انتخاب هندزفری، نوع اتصال، شکل قرارگیری در گوش و امکانات موردنیازتان را در نظر بگیرید. مشخصات هر مدل در صفحه محصول آمده است؛ برای انتخاب دقیق‌تر، مقایسه مشخصات را بررسی کنید.</p>',
    authorName: 'تیم سبز سیستم',
    coverAssetKey: 'blog-cover-3',
    publish: true,
    approval: 'blog_articles',
  },
];

const APPROVED_DEMO_APPROVALS = Object.fromEntries(
  Object.entries(DEMO_APPROVALS).map(([key, decision]) => [
    key,
    { ...decision, approved: true },
  ]),
) as Record<ApprovalKey, ApprovalDecision>;

export const DEMO_SEED_MANIFEST: DemoSeedManifest = {
  version: 1,
  approvals: APPROVED_DEMO_APPROVALS,
  campaigns,
  media,
  blog,
  sections: [
    {
      key: 'homepage-hero',
      type: 'HERO_CAROUSEL',
      order: 0,
      isVisible: true,
      campaignKeys: ['hero-primary', 'hero-secondary'],
    },
    {
      key: 'homepage-trust',
      type: 'TRUST_STRIP',
      order: 1,
      isVisible: true,
      items: [
        {
          icon: 'badge',
          title: 'فروشگاه اینترنتی',
          body: 'کالای دیجیتال و لوازم جانبی',
        },
        {
          icon: 'shield',
          title: 'خرید خرده و عمده',
          body: 'برای مشتریان و کسب‌وکارها',
        },
        {
          icon: 'support',
          title: 'تماس با فروشگاه',
          body: '۰۲۱-۹۱۳۰۱۹۰۰',
        },
        {
          icon: 'support',
          title: 'دفتر ساری',
          body: 'بلوار پاسداران، روبروی مرکز پرتو مازند',
        },
      ],
    },
    {
      key: 'homepage-categories',
      type: 'CATEGORY_DISCOVERY',
      order: 2,
      isVisible: true,
      campaignKey: 'discovery',
    },
    {
      key: 'homepage-offer',
      type: 'OFFER_STRIP',
      order: 3,
      isVisible: true,
      campaignKey: 'offer',
      fallback: 'featured',
    },
    {
      key: 'homepage-spotlight',
      type: 'CATEGORY_SPOTLIGHT',
      order: 4,
      isVisible: true,
      campaignKey: 'spotlight',
      secondaryCategoryId: null,
    },
    {
      key: 'homepage-ready',
      type: 'READY_TO_SHIP',
      order: 5,
      isVisible: true,
      limit: 8,
      title: 'موجود در انبار',
      subtitle: 'کالاهایی که همین حالا در کاتالوگ موجودند.',
    },
    {
      key: 'homepage-product-rail',
      type: 'PRODUCT_RAIL',
      order: 6,
      isVisible: true,
      title: 'انتخاب‌های حرفه‌ای',
      subtitle: 'لپ‌تاپ‌ها و تجهیزات قدرتمند موجود در کاتالوگ.',
      actionHref: '/products?sort=price_desc',
      sort: 'price_desc',
      limit: 8,
      inStockOnly: true,
    },
    {
      key: 'homepage-brands',
      type: 'BRAND_SHOWCASE',
      order: 7,
      isVisible: true,
      campaignKey: 'brands',
      productsPerBrand: 3,
    },
    {
      key: 'homepage-blog',
      type: 'BLOG_FEATURE',
      order: 8,
      isVisible: true,
      postKeys: ['demo-article-1', 'demo-article-2', 'demo-article-3'],
    },
  ],
};

export function pendingApprovals(
  manifest: DemoSeedManifest = DEMO_SEED_MANIFEST,
): ApprovalDecision[] {
  return Object.values(manifest.approvals).filter((item) => !item.approved);
}
