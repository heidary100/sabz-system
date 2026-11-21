import type { FooterSettings } from '@sabz/types';

/**
 * Backend-owned default footer (SS-900 Part II).
 *
 * These are the verified company facts already used by the storefront. The
 * migration inserts the same document for fresh databases; this constant keeps
 * the API's fallback behavior (and tests) backend-owned instead of making the
 * storefront static content the normal source of truth.
 */
export const DEFAULT_FOOTER: FooterSettings = {
  enabled: true,
  blurb:
    'سبز سیستم، فروشگاه اینترنتی کالای دیجیتال و لوازم جانبی در شمال کشور. «ارسال سریع»، «ضمانت بهترین قیمت» و «تضمین اصالت کالا» سه اصل اولیه سبز سیستم از نخستین روز تأسیس بوده است.',
  columns: [
    {
      title: 'فروشگاه',
      links: [
        { label: 'همه محصولات', href: '/products' },
        { label: 'همه دسته‌بندی‌ها', href: '/categories' },
        { label: 'وبلاگ', href: '/blog' },
        { label: 'درباره ما', href: '/about' },
        { label: 'تماس با ما', href: '/contact' },
        { label: 'شرایط و قوانین', href: '/terms' },
      ],
    },
  ],
  contact: {
    address:
      'ساری – بلوار پاسداران – روبروی مرکز تخصصی پرتو مازند – بازرگانی سبز سیستم',
    phone: '۰۲۱-۹۱۳۰۱۹۰۰',
    email: 'info@sabzsistem.com',
    hours: 'شنبه تا چهارشنبه ۹ تا ۱۸:۳۰ — پنجشنبه ۹ تا ۱۳:۳۰',
  },
  socials: [
    { label: 'اینستاگرام', href: 'https://www.instagram.com/sabzsistem', external: true },
    { label: 'کانال تلگرام', href: 'https://t.me/SabzSisTeM', external: true },
    { label: 'بله', href: 'https://web.bale.ai/@sabzsistem', external: true },
  ],
  legalLinks: [
    { label: 'شرایط و قوانین', href: '/terms' },
    {
      label: 'نماد اعتماد الکترونیکی',
      href: 'https://trustseal.enamad.ir/?id=147499&Code=L40xHynZjPMelCe7vsbe',
      external: true,
    },
    { label: 'تضمین قیمت در ترب', href: 'https://torob.com/shop/5732', external: true },
  ],
  copyright: null,
};
