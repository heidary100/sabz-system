/**
 * Tag shared shapes (SS-203).
 *
 * Definitions are reference data managed through TagsService (service-only
 * in v1; the importer is the primary writer). Assignments are derived rows,
 * hard-deleted on unassign or with their product.
 */

export interface TagDto {
  id: string;
  name: string;
  slug: string;
}
