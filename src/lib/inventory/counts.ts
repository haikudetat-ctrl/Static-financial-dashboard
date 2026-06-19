import type {
  CountAssignmentDraft,
  CountSheetStorageLocation,
} from "@/lib/inventory/types";

export function buildCountAssignments(
  storageLocations: CountSheetStorageLocation[],
  selectedStorageLocationIds: string[],
): CountAssignmentDraft[] {
  const selected = new Set(selectedStorageLocationIds);

  return storageLocations
    .filter((location) => selected.has(location.id))
    .sort((left, right) => left.walkOrder - right.walkOrder)
    .map((location) => ({
      storageLocationId: location.id,
      storageLocationName: location.name,
      walkOrder: location.walkOrder,
      items: [...location.items].sort(
        (left, right) =>
          left.walkOrder - right.walkOrder ||
          left.name.localeCompare(right.name),
      ),
    }));
}

export function countedTotal({
  countedQuantity,
  countedTenths,
  isOpenContainer,
}: {
  countedQuantity: number;
  countedTenths: number;
  isOpenContainer: boolean;
}) {
  return countedQuantity + (isOpenContainer ? countedTenths : 0);
}

export function calculateVariance({
  expectedQuantity,
  countedQuantity,
  unitCost,
  conversionFactorToBase = 1,
}: {
  expectedQuantity: number;
  countedQuantity: number;
  unitCost: number;
  conversionFactorToBase?: number;
}) {
  const quantityVariance = expectedQuantity - countedQuantity;

  return {
    quantityVariance,
    valueVariance: quantityVariance * conversionFactorToBase * unitCost,
  };
}

export function filterCountItems<
  T extends {
    id: string;
    categoryId: string | null;
    storageLocationId: string;
  },
>(
  items: T[],
  selection: {
    storageLocationIds: string[];
    categoryIds: string[];
    inventoryItemIds: string[];
  },
) {
  const storageLocations = new Set(selection.storageLocationIds);
  const categories = new Set(selection.categoryIds);
  const inventoryItems = new Set(selection.inventoryItemIds);
  const hasItemFilter = categories.size > 0 || inventoryItems.size > 0;

  return items.filter(
    (item) =>
      storageLocations.has(item.storageLocationId) &&
      (!hasItemFilter ||
        inventoryItems.has(item.id) ||
        (item.categoryId !== null && categories.has(item.categoryId))),
  );
}

export function isMaterialVariance(
  variance: { quantityVariance: number; valueVariance: number },
  threshold: { quantity: number; value: number },
) {
  return (
    Math.abs(variance.quantityVariance) >= threshold.quantity ||
    Math.abs(variance.valueVariance) >= threshold.value
  );
}

export function formatInventoryQuantity(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
  }).format(value);
}
