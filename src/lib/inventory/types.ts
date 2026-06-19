export type CountSheetItem = {
  id: string;
  name: string;
  walkOrder: number;
};

export type CountSheetStorageLocation = {
  id: string;
  name: string;
  walkOrder: number;
  items: CountSheetItem[];
};

export type CountAssignmentDraft = {
  storageLocationId: string;
  storageLocationName: string;
  walkOrder: number;
  items: CountSheetItem[];
};

export type InventoryCountType = "full" | "spot";

export type InventoryCountStatus =
  | "draft"
  | "in_progress"
  | "counted"
  | "approved"
  | "cancelled";

export type InventoryCountLineStatus =
  | "pending"
  | "counted"
  | "recount_requested";
