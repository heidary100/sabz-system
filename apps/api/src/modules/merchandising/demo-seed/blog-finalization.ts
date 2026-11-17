import { BlogStatus, Prisma } from '@prisma/client';
import { sanitizeRichText } from '../../products/description-sanitize';
import { DEMO_SEED_ACTOR_ID } from './constants';
import { assertFinalBlogContentUnchanged } from './guards';
import type { DemoSeedManifest } from './types';

export interface FinalBlogRow {
  id: string;
  slug: string;
  status: BlogStatus;
  createdBy: string | null;
  updatedBy: string | null;
  publishedAt: Date | null;
  title: string;
  excerpt: string | null;
  content: string;
  coverImageUrl: string | null;
  authorName: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  categoryId: string | null;
}

export interface FinalBlogContext {
  manifest: DemoSeedManifest;
  blogIds: Readonly<Record<string, string>>;
  mediaIds: Readonly<Record<string, string>>;
  publicApiBaseUrl: string | null;
}

/**
 * Final-boundary blog lock and validation. The caller must use the same
 * transaction client as the publication transaction. Row locks block a normal
 * BlogService edit between validation and activation.
 */
export async function lockAndValidateFinalBlogRows(
  tx: Prisma.TransactionClient,
  context: FinalBlogContext,
): Promise<FinalBlogRow[]> {
  const ids = Object.values(context.blogIds);
  if (ids.length === 0) return [];

  await tx.$queryRaw`
    SELECT "id"
    FROM "BlogPost"
    WHERE "id" IN (${Prisma.join(ids)})
    FOR UPDATE
  `;
  const rows: FinalBlogRow[] = await tx.blogPost.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      slug: true,
      status: true,
      createdBy: true,
      updatedBy: true,
      publishedAt: true,
      title: true,
      excerpt: true,
      content: true,
      coverImageUrl: true,
      authorName: true,
      metaTitle: true,
      metaDescription: true,
      categoryId: true,
    },
  });
  if (rows.length !== ids.length) {
    throw new Error(
      'One or more demo blog posts disappeared before the final transaction.',
    );
  }

  for (const [key, id] of Object.entries(context.blogIds)) {
    const definition = context.manifest.blog.find(
      (article) => article.key === key,
    );
    if (!definition) {
      throw new Error(`Manifest blog article ${key} does not exist.`);
    }
    const row = rows.find((item) => item.id === id);
    if (
      !row ||
      row.slug !== definition.slug ||
      row.createdBy !== DEMO_SEED_ACTOR_ID ||
      (row.updatedBy !== null && row.updatedBy !== DEMO_SEED_ACTOR_ID) ||
      (row.status !== BlogStatus.DRAFT &&
        row.status !== BlogStatus.PUBLISHED)
    ) {
      throw new Error(
        `Blog post ${definition.slug} is not safely demo-owned at the final boundary.`,
      );
    }
    const coverMediaId = definition.coverAssetKey
      ? context.mediaIds[definition.coverAssetKey]
      : undefined;
    if (definition.coverAssetKey && !coverMediaId) {
      throw new Error(
        `Blog post ${definition.slug} cover media could not be resolved at the final boundary.`,
      );
    }
    let coverImageUrl: string | null = null;
    if (coverMediaId) {
      if (!context.publicApiBaseUrl) {
        throw new Error(
          'A public API base URL is required for demo blog covers.',
        );
      }
      coverImageUrl = `${context.publicApiBaseUrl.replace(/\/+$/, '')}/catalog/merch-media/${coverMediaId}`;
    }
    assertFinalBlogContentUnchanged({
      slug: definition.slug,
      existing: {
        title: row.title,
        excerpt: row.excerpt,
        content: row.content,
        coverImageUrl: row.coverImageUrl,
        authorName: row.authorName,
        metaTitle: row.metaTitle,
        metaDescription: row.metaDescription,
        categoryId: row.categoryId,
      },
      desired: {
        title: definition.title,
        excerpt: definition.excerpt ?? null,
        content: sanitizeRichText(definition.content),
        coverImageUrl,
        authorName: definition.authorName ?? null,
        metaTitle: null,
        metaDescription: null,
        categoryId: null,
      },
    });
  }

  return rows;
}

/** Activate only articles whose manifest definition is publish=true. */
export async function activateFinalBlogRows(
  tx: Prisma.TransactionClient,
  context: Pick<FinalBlogContext, 'manifest' | 'blogIds'>,
  rows: FinalBlogRow[],
  now: Date,
): Promise<string[]> {
  const activated: string[] = [];
  for (const [key, id] of Object.entries(context.blogIds)) {
    const definition = context.manifest.blog.find(
      (article) => article.key === key,
    );
    if (!definition) {
      throw new Error(`Manifest blog article ${key} does not exist.`);
    }
    if (!definition.publish) continue;
    const row = rows.find((item) => item.id === id);
    if (!row) {
      throw new Error(
        `Blog post ${definition.slug} disappeared before activation.`,
      );
    }
    await tx.blogPost.update({
      where: { id: row.id },
      data: {
        status: BlogStatus.PUBLISHED,
        publishedAt: row.publishedAt ?? now,
        updatedBy: DEMO_SEED_ACTOR_ID,
      },
    });
    activated.push(row.id);
  }
  return activated;
}
