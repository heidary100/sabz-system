/**
 * Homepage demo-seed constants.
 *
 * The demo tooling is deliberately outside the normal Nest bootstrap. These
 * values are the stable markers used to identify demo-owned records; they are
 * real schema fields, not synthetic metadata columns.
 */

export const DEMO_SEED_ACTOR_ID = 'homepage-demo-seed';

/** Internal campaign-name prefix. `internalName` is an operator-facing field. */
export const DEMO_CAMPAIGN_PREFIX = 'homepage-demo:';

/** Public slug prefix for demo blog articles. */
export const DEMO_BLOG_SLUG_PREFIX = 'homepage-demo-';

/** Display-name prefix for demo merchandising media metadata. */
export const DEMO_MEDIA_NAME_PREFIX = 'homepage-demo-';

export const DEMO_CONFIRM_ENV = 'HOMEPAGE_DEMO_CONFIRM';
export const DEMO_EXPECTED_FINGERPRINT_ENV = 'HOMEPAGE_DEMO_EXPECTED_FINGERPRINT';
export const DEMO_PUBLISH_CONFIRM_ENV = 'HOMEPAGE_DEMO_PUBLISH_CONFIRM';
export const DEMO_OPERATION_ID_ENV = 'HOMEPAGE_DEMO_OPERATION_ID';
export const DEMO_MEDIA_ACK_IDS_ENV = 'HOMEPAGE_DEMO_MEDIA_ACK_IDS';
export const DEMO_PUBLIC_API_BASE_URL_ENV = 'HOMEPAGE_DEMO_PUBLIC_API_BASE_URL';
export const DEMO_BACKUP_DIR_ENV = 'HOMEPAGE_DEMO_BACKUP_DIR';
export const DEMO_ASSETS_DIR_ENV = 'HOMEPAGE_DEMO_ASSETS_DIR';

export const DEFAULT_BACKUP_DIR = '.data/homepage-demo-backups';
export const DEFAULT_ASSETS_DIR = '.data/homepage-demo-assets';

/** Database lease/journal and asset limits. */
export const DEMO_LOCK_ID = 'homepage-demo';
export const DEMO_LOCK_LEASE_MS = 120_000;
export const DEMO_LOCK_HEARTBEAT_MS = 30_000;
export const DEMO_MAX_ASSET_BYTES = 10 * 1_024 * 1_024;

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_DIR_MODE = 0o700;
export const BACKUP_FILE_MODE = 0o600;

/**
 * Public merchandising media route (API global prefix `/api/v1` is part of the
 * operator-provided public API base).
 */
export const PUBLIC_MERCH_MEDIA_PATH = '/catalog/merch-media';

/** Existing SS-245 test article. The demo tool must never mutate it. */
export const SS_245_POST_SLUG = 'azmvn-ss-245-rahnmay-khryd-mavs-gymyng';
