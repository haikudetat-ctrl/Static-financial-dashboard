export type UnitType = "volume" | "weight" | "each" | "count" | "dash" | "drop";

export type Unit = {
  id: string;
  organization_id: string;
  name: string;
  abbreviation: string;
  unit_type: UnitType;
  base_unit_id: string | null;
  conversion_factor_to_base: number | null;
};

export type UnitConversion = {
  id: string;
  organization_id: string;
  from_unit_id: string;
  to_unit_id: string;
  conversion_factor: number;
  item_specific: boolean;
  inventory_item_id: string | null;
};

export type InventoryCategory = {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  parent_id: string | null;
};

export type InventoryItem = {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  category_id: string | null;
  base_unit_id: string;
  purchase_unit_id: string | null;
  count_unit_id: string | null;
  is_purchased: boolean;
  is_produced: boolean;
  allows_tenths_counting: boolean;
  default_storage_location_id: string | null;
  active: boolean;
};

export type Vendor = {
  id: string;
  organization_id: string;
  name: string;
  vendor_type: string;
  active: boolean;
};

export type VendorItem = {
  id: string;
  organization_id: string;
  vendor_id: string;
  inventory_item_id: string | null;
  vendor_product_code: string;
  vendor_product_name: string;
  pack_size: string;
  purchase_unit_id: string | null;
};

export type VendorItemPrice = {
  id: string;
  organization_id: string;
  vendor_item_id: string;
  unit_price: number;
  effective_date: string;
};

export type SourceImport = {
  id: string;
  organization_id: string;
  location_id: string;
  source_type: string;
  file_hash: string;
  file_path: string;
  file_name: string;
  parser_version: string;
  status: string;
  row_count: number;
  error_message: string;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
};

export type SourceImportRow = {
  id: string;
  source_import_id: string;
  row_index: number;
  raw_data: Record<string, unknown>;
  normalized_data: Record<string, unknown>;
  status: string;
  error_message: string;
};

export type MappingQueueItem = {
  id: string;
  organization_id: string;
  queue_type: string;
  status: string;
  source_value: string;
  source_context: Record<string, unknown>;
  suggested_match_id: string | null;
  suggested_match_label: string;
  suggested_confidence: number | null;
  confirmed_match_id: string | null;
  confirmed_match_type: string | null;
  notes: string;
  resolved_by: string | null;
  resolved_at: string | null;
};

export type MappingQueueType =
  | "toast_item_to_recipe"
  | "toast_item_to_inventory"
  | "vendor_item_to_inventory"
  | "unknown_unit_to_unit";

export type PlcbOrderRow = {
  order_id: string;
  date: string;
  type: string;
  status: string;
  item_code: string;
  product: string;
  bottle_size: string;
  ordered_quantity: number;
  shipped_quantity: number;
  unit_price: number;
  discount: number;
  tax: number;
  freight: number;
  total: number;
};

export type ToastPmixRow = {
  item_guid: string;
  item_name: string;
  business_date: string;
  quantity_sold: number;
  net_sales: number;
  void_quantity: number;
  comp_quantity: number;
  category: string;
  menu_group: string;
};
