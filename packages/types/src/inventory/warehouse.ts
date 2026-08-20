import type { WarehouseStatus } from './type';

export interface WarehouseSummary {
  id: string;
  code: string;
  name: string;
  status: WarehouseStatus;
}

export interface WarehouseDetail {
  id: string;
  code: string;
  name: string;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  status: WarehouseStatus;
  createdAt: string;
  updatedAt: string;
}
