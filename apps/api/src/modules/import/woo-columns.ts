/**
 * WooCommerce export column classification (SS-206).
 *
 * Every header of the 243-column Persian export resolves to exactly one
 * disposition:
 * - mapped: normalized handling exists (this issue's resolvers or a later
 *   domain issue owns it).
 * - deferred: no normalized home yet; preserved raw in ImportRecord.sourceData
 *   for a future mapping. Never silently dropped.
 * - ignored: no commerce meaning (theme/plugin internals, constants, ACF
 *   field-key references), documented with a reason.
 *
 * Rules come from three sources, in order: explicit named entries, indexed
 * attribute-column patterns (نام/مقدار/نمایان/سراسری/پیشفرض N صفت), and
 * `متا:` dispatch. Anything else falls back to deferred (loud, never lossy);
 * the spec asserts the real header never hits the fallback.
 */

export type WooDisposition = 'mapped' | 'deferred' | 'ignored';
export type WooRuleSource = 'explicit' | 'pattern' | 'fallback';

export interface WooColumnRule {
  disposition: WooDisposition;
  /** Normalized target (model/field) for mapped columns. */
  target?: string;
  /** Why: mapping, deferral reason, or ignore reason. */
  reason: string;
  via: WooRuleSource;
}

function mapped(target: string, reason: string): Omit<WooColumnRule, 'via'> {
  return { disposition: 'mapped', target, reason };
}

function deferred(reason: string): Omit<WooColumnRule, 'via'> {
  return { disposition: 'deferred', reason };
}

function ignored(reason: string): Omit<WooColumnRule, 'via'> {
  return { disposition: 'ignored', reason };
}

/** Named columns with individual dispositions. */
const EXPLICIT: Record<string, Omit<WooColumnRule, 'via'>> = {
  // Identity + lifecycle.
  'شناسه': mapped('sourceId', 'WooCommerce row id → (WOOCOMMERCE, شناسه) identity.'),
  'نوع': mapped('sourceType', 'simple | variable | variation → product shell vs variant.'),
  'شناسه محصول': mapped('Variant.sku', 'English product code → variant SKU (deduped, reported).'),
  'GTIN، UPC، EAN یا ISBN': mapped('Variant.barcode', 'Single populated row; RankMath GTIN field is unreliable (stores titles), deferred separately.'),
  'نام': mapped('Product.name', 'Persian display name; slug transliterated (SS-205).'),
  'منتشر شده': mapped('Product.status', '1 → PUBLISHED (if resolvable), 0/-1 → DRAFT.'),
  'آیا ویژه است؟': deferred('No Product.isFeatured yet; 9 rows → future merchandising flag.'),
  'قابل مشاهده در کاتالوگ': mapped('visibility gate', 'All rows visible; unexpected values proposed SKIP + reported.'),
  'توضیح کوتاه': mapped('Product.shortDescription', '183 rows.'),
  'توضیحات': mapped('Product.description', 'Sanitized HTML; inline images take the description-image path.'),
  // Pricing.
  'تاریخ شروع فروش ویژه': deferred('Sale window 2026-09-05→21 active on 29 rows; no sale-date fields yet — compareAt imports as evergreen, window recorded.'),
  'تاریخ پایان فروش ویژه': deferred('See sale-start; same window.'),
  'وضعیت مالیات': ignored('Constant across all rows; single tax regime.'),
  'کلاس مالیاتی': ignored('Empty or "parent" (variation inheritance); single tax regime.'),
  // Stock.
  'در انبار؟': mapped('ledger read', 'Cross-checked with انبار quantities.'),
  'انبار': mapped('InventoryItem INITIAL_STOCK', 'One receipt per variant on DEFAULT warehouse.'),
  'کمبود موجودی انبار': ignored('Single populated row; no backorder-threshold domain.'),
  'پیش‌فروش مجاز است؟': ignored('Single "notify" row; no preorder domain.'),
  'فروش به صورت جداگانه؟': ignored('Near-constant sold-individually flag; no quantity domain until M3 cart.'),
  // Dimensions (empty in this export, schema-ready).
  'وزن (گرم)': mapped('Product.weightKg', 'Grams ÷ 1000; zero rows populated, mapping ready.'),
  'درازا (سانتیمتر)': mapped('Product.depthCm', 'Zero rows populated, mapping ready.'),
  'پهنا (سانتیمتر)': mapped('Product.widthCm', 'Zero rows populated, mapping ready.'),
  'بلندا (سانتیمتر)': mapped('Product.heightCm', 'Zero rows populated, mapping ready.'),
  'آیا به مشتری اجازه نوشتن نقد داده شود؟': ignored('Near-constant review toggle; no review domain. Export shows reviews off.'),
  'یادداشت خرید': ignored('Zero rows populated.'),
  'قیمت فروش ویژه': mapped('Variant.compareAtPrice', '12 rows; sale without regular is an edge (priceless + flagged).'),
  'قیمت عادی': mapped('Variant.price', 'Missing on 818 published rows → CALL_FOR_PRICE (Q1); zero treated as missing.'),
  // Taxonomy + merchandising.
  'دسته‌ها': mapped('Product.categoryId', 'Deepest path wins; ancestor chain is redundant; uncategorized skipped.'),
  'برچسب‌ها': mapped('Tag/ProductTag', '1079 distinct, ZWNJ-normalized (SS-203).'),
  'کلاس حمل و نقل': ignored('Single populated row; no shipping-class domain.'),
  'تصاویر': mapped('ProductMedia', '5170 refs, single domain; order → sortOrder, first → primary.'),
  'محدودیت دانلود': ignored('Zero rows populated; no downloadable products.'),
  'روز انقضاء دانلود': ignored('Zero rows populated.'),
  'مادر': mapped('Variant.productId', 'Variation→parent link holding the parent SKU (not name); empty → orphan SKIP.'),
  'محصولات گروهی': ignored('Zero rows populated (grouped products unused).'),
  'تشویق برای خرید بیشتر': deferred('Upsell names on 5 rows → future related-products (M3).'),
  'محصولات مشابه (Cross-Sells)': deferred('Cross-sell refs (names + id:NNNNN) on 3 rows → future related-products.'),
  'آدرس خارجی': ignored('Zero rows populated.'),
  'متن دکمه': ignored('Zero rows populated.'),
  'موقعیت': ignored('Menu-order-ish 0/1 values only; no reliable ordering signal (first-seen order used).'),
  'برندها': mapped('Brand', 'Column wins over برند attribute; 924 unbranded → nullable (Q2 proposed).'),
  // Mapped meta (display data).
  'متا: product_english_name': mapped('Product.nameEn', '799 rows; search + B2B display.'),
  'متا: custom_attributes': mapped('ProductSpec WOO_CUSTOM', '912 free-text spec blocks, line-parsed (SS-202 contract).'),
  'متا: garrantie': mapped('Product.warranty', '711 free-text warranty lines; normalization dictionary later.'),
  'متا: seller_brand': mapped('sourceMeta trust signal', 'Near-constant سبز سیستم; single fulfilment component, not columns.'),
  'متا: stock_name': mapped('sourceMeta trust signal', 'Near-constant آماده ارسال از انبار; same component.'),
  'متا: send_by': mapped('sourceMeta trust signal', '832 rows, spelling variants; same component.'),
  'متا: newkala_subtitle_product': mapped('Product.subtitle', '948 rows.'),
  'متا: second_image': mapped('gallery position 1', 'Legacy hover image → sortOrder convention, no new field.'),
  'متا: rank_math_title': mapped('Product.metaTitle', '2 rows; titles migrate.'),
  'متا: rank_math_description': mapped('Product.metaDescription', '357 rows.'),
  'متا: rank_math_focus_keyword': mapped('Product.focusKeyword', '952 rows; index-only for SS-216.'),
  'متا: _yoast_wpseo_metadesc': mapped('Product.metaDescription', '132 rows; RankMath wins on conflict, reported.'),
  // Deferred meta (preserved raw, future mapping).
  'متا: wholesale_customer_wholesale_price': deferred('138 rows tier-price evidence → B2B pricing engine (future).'),
  'متا: wholesale_customer_have_wholesale_price': deferred('Wholesale-access flag → B2B engine.'),
  'متا: wholesale_customer_variations_with_wholesale_price': deferred('Per-variation wholesale flags → B2B engine.'),
  'متا: قیمت همکار': deferred('6 rows partner price → B2B engine.'),
  'متا: Wholesale Prices': deferred('Single row → B2B engine.'),
  'متا: ced_cwsm_wholesale_price': deferred('Single row → B2B engine.'),
  'متا: count_recommended': deferred('331 rows view-count analytics → future.'),
  'متا: post-views': deferred('361 rows view-count analytics → future.'),
  'متا: osa_app_report_postviews': deferred('Analytics plugin state → future.'),
  'متا: timestamp_add_offer': deferred('447 rows offer-scheduling state → promo engine.'),
  'متا: special_offers': deferred('366 rows promo flags → promo engine.'),
  'متا: inslider_special_offers': deferred('278 rows promo flags → promo engine.'),
  'متا: how_apply_product_rule': deferred('29 "only_this" rows correlate with the sale set → pricing-rule plugin.'),
  'متا: des_before_price_simple_product': deferred('2 Persian display notes ("قیمت عمده ادمین") → B2B display fragment.'),
  'متا: off_product_cat': deferred('23 PHP-serialized "Array" values → promo scoping, needs unserialize policy.'),
  'متا: content_slider': deferred('Single-row spec-ish content block → content fragment, preserved raw.'),
  'متا: special_offer_short_title_add_field_title': deferred('3 promo titles ("5 عدد ویژه افتتاحیه") → promo engine.'),
  'متا: _rank_math_gtin_code': deferred('451 rows but content is model codes/titles, not GTINs — untrusted, never barcode.'),
  'متا: _woodmart_new_label': deferred('Single theme label row → future merchandising flag.'),
  'متا: _subtitle': deferred('Single row → subtitle candidate on mapping review.'),
  'متا: product_video_code': deferred('Single video embed code → video path (negligible volume).'),
  'متا: _product_video_code': deferred('Storage twin of the video code.'),
  'متا: product_video_url': deferred('Zero rows populated; video URL slot → video path.'),
  'متا: type_vidoe': deferred('Video presence flag (0/video_code) → video path.'),
  'متا: nkcps_title': deferred('70 "call before buying" notices → call-box content fragment.'),
  'متا: nkcps_icon': deferred('Single media-library id for the call box → call-box styling.'),
  'متا: nkcps_color_bg': deferred('71 call-box background colors → call-box styling.'),
  'متا: nkcps_color_font': deferred('Call-box font colors → call-box styling.'),
  'متا: nkcps_color_border': deferred('Call-box border colors → call-box styling.'),
  'متا: _product_video_url': deferred('3 video URL refs → video path.'),
  'متا: insert_direct_link': deferred('Single direct-link flag → video path.'),
  'متا: _insert_direct_link': deferred('Storage twin of the direct-link flag.'),
  'متا: simple_date_and_price_chart': deferred('Empty price-history series → price-history feature.'),
  'متا: _simplePriceChart': deferred('Empty price-history series.'),
  'متا: _simplePriceChartDate': deferred('Empty price-history series.'),
  'متا: date_and_price_chart': deferred('Empty price-history series.'),
  'متا: _priceChart': deferred('Empty price-history series.'),
  'متا: _priceChartDate': deferred('Empty price-history series.'),
  // Ignored meta (no commerce meaning).
  'متا: _product_addons_exclude_global': ignored('Constant "0"; addon plugin state.'),
  'متا: _low_stock_send': ignored('Notification flag state ("yes"/empty).'),
  'متا: _out_stock_send_sms': ignored('Notification flag state.'),
  'متا: _product_rules': ignored('Zero rows populated.'),
  'متا: display_warning_text': ignored('Constant "off" toggle; warnings disabled export-wide.'),
  'متا: _display_warning_text': ignored('Storage twin of the toggle.'),
  'متا: edit_warning_text': ignored('Zero rows populated.'),
  'متا: _edit_warning_text': ignored('Zero rows populated.'),
  'متا: _wp_page_template': ignored('Theme template ref ("default").'),
  'متا: enable_rating_review': ignored('Constant "0"; reviews disabled export-wide.'),
  'متا: _enable_rating_review': ignored('ACF field-key reference.'),
  'متا: options_ratings_review': ignored('Zero rows populated.'),
  'متا: _options_ratings_review': ignored('ACF field-key reference.'),
  'متا: rank_math_rich_snippet': ignored('"off" constants; schema-markup config, no data.'),
  'متا: rank_math_dont_show_seo_score': ignored('Editor UI state.'),
  'متا: rank_math_news_sitemap_robots': ignored('SEO plugin state.'),
  'متا: rank_math_internal_links_processed': ignored('SEO plugin state.'),
  'متا: rank_math_permalink': ignored('SEO plugin state.'),
  'متا: rank_math_seo_score': ignored('SEO score, not content.'),
  'متا: rank_math_facebook_enable_image_overlay': ignored('Social overlay config.'),
  'متا: rank_math_facebook_image_overlay': ignored('Social overlay config.'),
  'متا: rank_math_twitter_use_facebook': ignored('Social config.'),
  'متا: rank_math_twitter_card_type': ignored('Social config.'),
  'متا: rank_math_twitter_enable_image_overlay': ignored('Social overlay config.'),
  'متا: rank_math_twitter_image_overlay': ignored('Social overlay config.'),
  'متا: _rank_math_video': ignored('SEO video state.'),
  'متا: rank_math_analytic_object_id': ignored('Analytics plugin state.'),
  'متا: rank_math_primary_product_cat': ignored('RankMath primary-term pointer; taxonomy resolves from دسته‌ها.'),
  'متا: _yoast_wpseo_primary_product_cat': ignored('Yoast primary-term pointer; same.'),
  'متا: rank_math_primary_product_brand': ignored('RankMath primary-term pointer; brand resolves from برندها.'),
  'متا: _yoast_wpseo_primary_product_brand': ignored('Yoast primary-term pointer; same.'),
  'متا: rank_math_pillar_content': ignored('SEO plugin state.'),
  'متا: _yoast_wpseo_content_score': ignored('SEO score, not content.'),
  'متا: _yoast_wpseo_estimated-reading-time-minutes': ignored('SEO plugin state.'),
  'متا: _elementor_edit_mode': ignored('Page-builder state.'),
  'متا: _elementor_template_type': ignored('Page-builder state.'),
  'متا: _elementor_version': ignored('Page-builder state.'),
  'متا: _elementor_data': ignored('2 rows page-builder payload; theme internals.'),
  'متا: _elementor_pro_version': ignored('Page-builder state.'),
  'متا: _woodmart_product-background': ignored('Theme state.'),
  'متا: woodmart_sguide_select': ignored('Theme state.'),
  'متا: include_amazingwrap_option': ignored('Theme state.'),
  'متا: description_amazing_option': ignored('Theme state.'),
  'متا: _wp_old_date': ignored('WordPress housekeeping.'),
  'متا: _wp_desired_post_slug': ignored('Zero rows populated (slugs generated, SS-205).'),
  'متا: festiUserRolePrices': ignored('Role-price plugin state ("[]" in export).'),
  'متا: festiHideProductForUserRoles': ignored('Role-visibility plugin state ("[]").'),
  'متا: festiUserRoleHidenPrices': ignored('Role-price plugin state ("[]").'),
  'متا: festiUserRoleIgnoreDiscount': ignored('Role-discount plugin state ("0").'),
};

/** Explicitly classified header names (completeness-test input). */
export function explicitHeaderNames(): string[] {
  return Object.keys(EXPLICIT);
}

/** ACF field-key references (`field_…` storage, no commerce data). */
const ACF_KEY_METAS = new Set([
  'متا: _garrantie',
  'متا: _seller_brand',
  'متا: _stock_name',
  'متا: _send_by',
  'متا: _second_image',
  'متا: _custom_attributes',
  'متا: _type_vidoe',
  'متا: _nkcps_title',
  'متا: _nkcps_icon',
  'متا: _nkcps_color_bg',
  'متا: _nkcps_color_font',
  'متا: _nkcps_color_border',
]);

const ATTRIBUTE_SLOTS = 22;

/**
 * Indexed attribute columns: `نام N صفت`, `مقدار(های) N صفت`,
 * `نمایان بودن N صفت`, `صفت N سراسری` (note the different shape),
 * `پیشفرض N صفت` (N ≤ 22).
 */
export function classifyAttributeColumn(header: string): WooColumnRule | null {
  const slotted = header.match(/^(نام|مقدار\(های\)|نمایان بودن|پیشفرض) (\d+) صفت$/);
  const globalFlag =
    slotted === null ? header.match(/^صفت (\d+) سراسری$/) : null;
  const match = slotted ?? globalFlag;
  if (!match) {
    return null;
  }
  const kind = globalFlag !== null ? 'سراسری' : match[1];
  const slot = Number(match[match.length - 1]);
  if (!Number.isInteger(slot) || slot < 1 || slot > ATTRIBUTE_SLOTS) {
    return null;
  }
  if (kind === 'پیشفرض') {
    return {
      disposition: 'mapped',
      target: 'variation default option',
      reason: 'Variation default marker; only slots 1/2/22 present.',
      via: 'pattern',
    };
  }
  return {
    disposition: 'mapped',
    target: 'Attribute pipeline (SS-202)',
    reason: `Attribute slot ${slot} ${kind}: variant axis vs spec split at resolve time.`,
    via: 'pattern',
  };
}

export function classifyColumn(header: string): WooColumnRule {
  const name = header.trim();
  const explicit = EXPLICIT[name];
  if (explicit) {
    return { ...explicit, via: 'explicit' };
  }
  const attribute = classifyAttributeColumn(name);
  if (attribute) {
    return attribute;
  }
  if (ACF_KEY_METAS.has(name)) {
    return {
      disposition: 'ignored',
      reason: 'ACF field-key reference (field_…); the display twin carries the data.',
      via: 'pattern',
    };
  }
  // Safe default: never silently discard. Unrecognized columns (including
  // future plugin metas) are preserved raw and flagged for mapping review.
  return {
    disposition: 'deferred',
    reason: 'Unrecognized column: preserved raw, needs mapping review.',
    via: 'fallback',
  };
}

/** Headers in a parsed file that only hit the fallback rule (review list). */
export function fallbackHeaders(headers: string[]): string[] {
  return headers.filter((header) => classifyColumn(header).via === 'fallback');
}

/** Disposition histogram over a header list (mapping-doc/report input). */
export function classifyHeaders(headers: string[]): {
  mapped: string[];
  deferred: string[];
  ignored: string[];
  fallback: string[];
} {
  const result = { mapped: [] as string[], deferred: [] as string[], ignored: [] as string[], fallback: [] as string[] };
  for (const header of headers) {
    const rule = classifyColumn(header);
    result[rule.disposition].push(header);
    if (rule.via === 'fallback') {
      result.fallback.push(header);
    }
  }
  return result;
}
