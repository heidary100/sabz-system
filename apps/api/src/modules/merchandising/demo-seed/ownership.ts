import { DEMO_SEED_ACTOR_ID } from './constants';
import { sanitizeMediaDisplayName } from '../../products/media-validation';
import type {
  DemoBlogRow,
  DemoCampaignRow,
  DemoMediaAssetDefinition,
  DemoMediaRow,
} from './types';

export type RecordOwnership =
  | 'absent'
  | 'owned'
  | 'manually-edited'
  | 'ambiguous';

export function expectedCampaignInternalName(key: string): string {
  return `homepage-demo:${key}`;
}

export function expectedMediaOriginalName(
  asset: DemoMediaAssetDefinition,
): string {
  return sanitizeMediaDisplayName(
    `homepage-demo-${asset.key}-${asset.fileName}`,
  );
}

export function campaignOwnership(
  row: DemoCampaignRow | null,
  expectedInternalName: string,
): RecordOwnership {
  if (row === null) return 'absent';
  if (row.internalName !== expectedInternalName) return 'ambiguous';
  if (row.createdBy !== DEMO_SEED_ACTOR_ID) return 'ambiguous';
  if (row.updatedBy !== null && row.updatedBy !== DEMO_SEED_ACTOR_ID) {
    return 'manually-edited';
  }
  return 'owned';
}

export function blogOwnership(
  row: DemoBlogRow | null,
  expectedSlug: string,
): RecordOwnership {
  if (row === null) return 'absent';
  if (row.slug !== expectedSlug) return 'ambiguous';
  if (row.createdBy !== DEMO_SEED_ACTOR_ID) return 'ambiguous';
  if (row.updatedBy !== null && row.updatedBy !== DEMO_SEED_ACTOR_ID) {
    return 'manually-edited';
  }
  return 'owned';
}

export function mediaOwnership(
  row: DemoMediaRow | null,
  expectedOriginalName: string,
): RecordOwnership {
  if (row === null) return 'absent';
  if (row.originalName !== expectedOriginalName) return 'ambiguous';
  if (row.createdBy !== DEMO_SEED_ACTOR_ID) return 'ambiguous';
  if (row.deletedAt !== null) return 'ambiguous';
  return 'owned';
}
