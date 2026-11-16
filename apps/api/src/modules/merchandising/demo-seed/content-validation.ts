import type { DemoSeedManifest } from './types';

export interface ContentIssue {
  path: string;
  message: string;
}

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /PENDING\s+APPROVAL/i,
  /PENDING_APPROVAL/i,
  /\bPLACEHOLDER\b/i,
  /\bTODO\b/i,
  /\bTBD\b/i,
  /\{\{[^}]+\}\}/,
  /__[A-Z0-9_]+__/,
];

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function requiredText(
  value: unknown,
  path: string,
  issues: ContentIssue[],
): void {
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push({ path, message: 'Required text is empty.' });
    return;
  }
  if (isPlaceholder(value)) {
    issues.push({ path, message: 'Placeholder content is still present.' });
  }
}

function optionalText(
  value: unknown,
  path: string,
  issues: ContentIssue[],
): void {
  if (value === null || value === undefined) return;
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push({ path, message: 'Optional text must be null or non-empty.' });
    return;
  }
  if (isPlaceholder(value)) {
    issues.push({ path, message: 'Placeholder content is still present.' });
  }
}

function validDate(value: string | null, path: string, issues: ContentIssue[]): number | null {
  if (value === null) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    issues.push({ path, message: 'Date is not a valid ISO timestamp.' });
    return null;
  }
  return timestamp;
}

/**
 * Content completeness is independent from approval booleans. An operator can
 * approve a decision but cannot apply while placeholder/provisional content or
 * unresolved references remain.
 */
export function validateManifestContent(
  manifest: DemoSeedManifest,
): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const campaignKeys = new Set(manifest.campaigns.map((campaign) => campaign.key));
  const campaignNames = new Set(
    manifest.campaigns.map((campaign) => campaign.internalName),
  );
  const mediaKeys = new Set(manifest.media.map((asset) => asset.key));
  const blogByKey = new Map(
    manifest.blog.map((article) => [article.key, article]),
  );
  const blogKeys = new Set(blogByKey.keys());
  const sectionKeys = new Set<string>();

  if (manifest.campaigns.length === 0) {
    issues.push({ path: 'campaigns', message: 'At least one campaign is required.' });
  }
  for (const [index, campaign] of manifest.campaigns.entries()) {
    const path = `campaigns[${index}]`;
    requiredText(campaign.key, `${path}.key`, issues);
    requiredText(campaign.internalName, `${path}.internalName`, issues);
    if (!campaign.internalName.startsWith('homepage-demo:')) {
      issues.push({
        path: `${path}.internalName`,
        message: 'Demo campaign internalName must use the homepage-demo: prefix.',
      });
    }
    if (campaignNames.size !== manifest.campaigns.length) {
      issues.push({ path: 'campaigns', message: 'Campaign internal names must be unique.' });
    }
    requiredText(campaign.type, `${path}.type`, issues);
    requiredText(campaign.copy.titleFa, `${path}.copy.titleFa`, issues);
    optionalText(campaign.copy.eyebrowFa, `${path}.copy.eyebrowFa`, issues);
    optionalText(campaign.copy.subtitleFa, `${path}.copy.subtitleFa`, issues);
    optionalText(campaign.copy.descriptionFa, `${path}.copy.descriptionFa`, issues);
    optionalText(campaign.copy.ctaLabelFa, `${path}.copy.ctaLabelFa`, issues);
    if (campaign.cta.kind !== 'NONE' && campaign.copy.ctaLabelFa === null) {
      issues.push({
        path: `${path}.copy.ctaLabelFa`,
        message: 'A CTA destination requires a CTA label.',
      });
    }
    const start = validDate(campaign.schedule.startsAt, `${path}.schedule.startsAt`, issues);
    const end = validDate(campaign.schedule.endsAt, `${path}.schedule.endsAt`, issues);
    if (start !== null && end !== null && start >= end) {
      issues.push({
        path: `${path}.schedule`,
        message: 'Campaign start must be before end.',
      });
    }
    if (campaign.schedule.startsAt === null && campaign.schedule.endsAt !== null) {
      issues.push({
        path: `${path}.schedule`,
        message: 'An end date cannot exist without a start date.',
      });
    }
    for (const mediaKey of campaign.mediaKeys) {
      if (!mediaKeys.has(mediaKey)) {
        issues.push({
          path: `${path}.mediaKeys`,
          message: `Unknown media key ${mediaKey}.`,
        });
      }
    }
  }

  for (const [index, section] of manifest.sections.entries()) {
    const path = `sections[${index}]`;
    requiredText(section.key, `${path}.key`, issues);
    if (sectionKeys.has(section.key)) {
      issues.push({ path: `${path}.key`, message: 'Section keys must be unique.' });
    }
    sectionKeys.add(section.key);
    if (section.order !== index) {
      issues.push({
        path: `${path}.order`,
        message: 'Section order must be contiguous.',
      });
    }
    const campaignRefs =
      'campaignKey' in section
        ? [section.campaignKey]
        : 'campaignKeys' in section
          ? section.campaignKeys
          : [];
    for (const key of campaignRefs) {
      if (!campaignKeys.has(key)) {
        issues.push({ path, message: `Unknown campaign key ${key}.` });
      }
    }
    if (section.type === 'TRUST_STRIP') {
      if (section.items.length === 0 || section.items.length > 4) {
        issues.push({ path: `${path}.items`, message: 'Trust strip requires 1–4 items.' });
      }
      for (const [itemIndex, item] of section.items.entries()) {
        requiredText(item.title, `${path}.items[${itemIndex}].title`, issues);
        optionalText(item.body, `${path}.items[${itemIndex}].body`, issues);
      }
    }
    if (section.type === 'READY_TO_SHIP') {
      if (section.title !== null) {
        requiredText(section.title, `${path}.title`, issues);
      }
      optionalText(section.subtitle, `${path}.subtitle`, issues);
    }
    if (section.type === 'PRODUCT_RAIL') {
      requiredText(section.title, `${path}.title`, issues);
      optionalText(section.subtitle, `${path}.subtitle`, issues);
      optionalText(section.actionHref, `${path}.actionHref`, issues);
    }
    if (section.type === 'BLOG_FEATURE') {
      if (section.postKeys.length === 0 || section.postKeys.length > 3) {
        issues.push({ path: `${path}.postKeys`, message: 'Blog feature requires 1–3 posts.' });
      }
      for (const key of section.postKeys) {
        const article = blogByKey.get(key);
        if (!article) {
          issues.push({ path: `${path}.postKeys`, message: `Unknown blog key ${key}.` });
        } else if (!article.publish) {
          issues.push({
            path: `${path}.postKeys`,
            message: `Blog article ${key} must be marked for publication.`,
          });
        }
      }
    }
  }

  for (const [index, asset] of manifest.media.entries()) {
    const path = `media[${index}]`;
    requiredText(asset.key, `${path}.key`, issues);
    requiredText(asset.fileName, `${path}.fileName`, issues);
    requiredText(asset.altFa, `${path}.altFa`, issues);
    if (asset.fileName.includes('..') || asset.fileName.startsWith('/')) {
      issues.push({ path: `${path}.fileName`, message: 'Asset filename must be relative and contained.' });
    }
    if (asset.campaignKey !== null && !campaignKeys.has(asset.campaignKey)) {
      issues.push({ path: `${path}.campaignKey`, message: `Unknown campaign key ${asset.campaignKey}.` });
    }
    if (asset.blogKey !== null && !blogKeys.has(asset.blogKey)) {
      issues.push({ path: `${path}.blogKey`, message: `Unknown blog key ${asset.blogKey}.` });
    }
  }

  for (const [index, article] of manifest.blog.entries()) {
    const path = `blog[${index}]`;
    requiredText(article.key, `${path}.key`, issues);
    requiredText(article.slug, `${path}.slug`, issues);
    if (!article.slug.startsWith('homepage-demo-')) {
      issues.push({
        path: `${path}.slug`,
        message: 'Demo blog slug must use the homepage-demo- prefix.',
      });
    }
    requiredText(article.title, `${path}.title`, issues);
    requiredText(article.content, `${path}.content`, issues);
    optionalText(article.excerpt, `${path}.excerpt`, issues);
    optionalText(article.authorName, `${path}.authorName`, issues);
    if (article.coverAssetKey !== null && !mediaKeys.has(article.coverAssetKey)) {
      issues.push({
        path: `${path}.coverAssetKey`,
        message: `Unknown cover asset ${article.coverAssetKey}.`,
      });
    }
  }

  return issues;
}
