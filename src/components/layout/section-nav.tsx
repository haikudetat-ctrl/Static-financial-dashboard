import { SectionTabs } from "@/components/ui";

const SECTIONS = {
  purchasing: [
    { label: "Orders", href: "/purchasing" },
    { label: "Suggested order", href: "/purchasing/suggested-order" },
    { label: "Order guide", href: "/purchasing/order-guide" },
    { label: "Receiving", href: "/receiving/review" },
    { label: "Reports", href: "/purchasing/reports" },
  ],
  recipes: [
    { label: "Recipes", href: "/recipes" },
    { label: "Menu mappings", href: "/recipes/mappings" },
    { label: "Sales", href: "/recipes/sales" },
    { label: "Theoretical usage", href: "/recipes/theoretical-usage" },
  ],
  inventory: [
    { label: "Overview", href: "/inventory" },
    { label: "Counts", href: "/inventory/counts" },
    { label: "On hand", href: "/inventory/on-hand" },
  ],
  exceptions: [
    { label: "Overview", href: "/exceptions" },
    { label: "Negative inventory", href: "/exceptions/negative-inventory" },
    { label: "Catalog review", href: "/exceptions/catalog-review" },
  ],
} as const;

export function SectionNav({
  section,
  active,
}: {
  section: keyof typeof SECTIONS;
  active: string;
}) {
  return (
    <SectionTabs
      items={SECTIONS[section].map((item) => ({
        ...item,
        active: item.href === active,
      }))}
    />
  );
}
