import type {
  InventoryMovementType,
  InventoryStockStatus,
  ReservationStatus,
  WarehouseStatus,
} from './type';

export interface WarehouseListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: WarehouseStatus;
}

export interface InventoryListQuery {
  page?: number;
  limit?: number;
  variantId?: string;
  warehouseId?: string;
  stockStatus?: InventoryStockStatus;
  search?: string;
}

export interface MovementListQuery {
  page?: number;
  limit?: number;
  variantId?: string;
  warehouseId?: string;
  type?: InventoryMovementType;
  from?: string;
  to?: string;
}

export interface ReservationListQuery {
  page?: number;
  limit?: number;
  status?: ReservationStatus;
  variantId?: string;
  warehouseId?: string;
}

export interface CreateWarehouseInput {
  code: string;
  name: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
}

export interface UpdateWarehouseInput {
  code?: string;
  name?: string;
  address?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
}

export interface ReceiveStockInput {
  variantId: string;
  warehouseId: string;
  quantity: number;
  notes?: string;
}

export interface AdjustInventoryInput {
  variantId: string;
  warehouseId: string;
  quantity: number;
  reason: string;
  notes?: string;
}

export interface ReserveInventoryInput {
  variantId: string;
  warehouseId: string;
  quantity: number;
  expiresIn?: number;
}