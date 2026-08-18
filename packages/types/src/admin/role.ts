import type { AppRole } from '../auth/roles';

export interface RoleSummary {
  id: string;
  name: AppRole;
  description: string | null;
  permissions: string[];
}
