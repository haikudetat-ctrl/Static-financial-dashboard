import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarDays,
  ClipboardCheck,
  CookingPot,
  FileInput,
  FileText,
  GitCompare,
  PackageCheck,
  ReceiptText,
  ShoppingBasket,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  group?: "Overview" | "Operations" | "Data";
};

export const managerNavigation: NavigationItem[] = [
  {
    label: "Today",
    href: "/today",
    icon: Sparkles,
    description: "What needs attention and how the period is tracking.",
    group: "Overview",
  },
  {
    label: "Financials",
    href: "/financial-health",
    icon: BarChart3,
    description: "Profit and loss, cost of goods, and menu profitability.",
    group: "Overview",
  },
  {
    label: "Periods",
    href: "/periods",
    icon: CalendarDays,
    description: "The 12-period fiscal calendar and period close.",
    group: "Overview",
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Boxes,
    description: "On-hand value, counts, and variance.",
    group: "Operations",
  },
  {
    label: "Purchasing",
    href: "/purchasing",
    icon: ShoppingBasket,
    description: "Suggested orders, purchase orders, and vendor activity.",
    group: "Operations",
  },
  {
    label: "Invoices",
    href: "/invoices/upload",
    icon: FileText,
    description: "Vendor invoices, price changes, and approvals.",
    group: "Operations",
  },
  {
    label: "Recipes",
    href: "/recipes",
    icon: ReceiptText,
    description: "Recipe versions, costs, yields, and menu mappings.",
    group: "Operations",
  },
  {
    label: "Imports",
    href: "/imports",
    icon: FileInput,
    description: "Toast exports, uploads and the shared Drive inbox.",
    group: "Data",
  },
  {
    label: "Mapping",
    href: "/mapping",
    icon: GitCompare,
    description: "Map Toast items, vendor codes, and units to inventory.",
    group: "Data",
  },
  {
    label: "Exceptions",
    href: "/exceptions",
    icon: AlertTriangle,
    description: "Blocking issues, incomplete data, and warnings.",
    group: "Data",
  },
];

export const staffNavigation: NavigationItem[] = [
  {
    label: "Receive",
    href: "/receive",
    icon: PackageCheck,
    description: "Receive a delivery against an open order.",
  },
  {
    label: "Count",
    href: "/count",
    icon: ClipboardCheck,
    description: "Complete assigned inventory counts.",
  },
  {
    label: "Production",
    href: "/production",
    icon: CookingPot,
    description: "Record a prep batch and its actual yield.",
  },
  {
    label: "Waste",
    href: "/waste",
    icon: Trash2,
    description: "Record waste, breakage, or spillage.",
  },
];

/** Sub-pages of each multi-screen section, shown as tabs under the header. */
export const sectionNavigation = {
  financials: [
    { label: "Profit & loss", href: "/financial-health" },
    { label: "Expenses", href: "/financial-health/expenses" },
    { label: "Sales categories", href: "/financial-health/sales-categories" },
    {
      label: "Menu profitability",
      href: "/financial-health/menu-profitability",
    },
    { label: "Budget basis", href: "/financial-health/budget-basis" },
  ],
  purchasing: [
    { label: "Orders", href: "/purchasing" },
    { label: "Suggested order", href: "/purchasing/suggested-order" },
    { label: "Order guide", href: "/purchasing/order-guide" },
    { label: "Price changes", href: "/purchasing/price-changes" },
    { label: "Receiving", href: "/receiving/review" },
    { label: "Reports", href: "/purchasing/reports" },
  ],
  recipes: [
    { label: "Recipes", href: "/recipes" },
    { label: "Ingredients", href: "/recipes/ingredients" },
    { label: "Menu mappings", href: "/recipes/mappings" },
    { label: "Sales", href: "/recipes/sales" },
    { label: "Theoretical usage", href: "/recipes/theoretical-usage" },
  ],
  inventory: [
    { label: "Overview", href: "/inventory" },
    { label: "Counts", href: "/inventory/counts" },
    { label: "Variance", href: "/inventory/variance" },
    { label: "On hand", href: "/inventory/on-hand" },
  ],
  imports: [
    { label: "Uploads & Toast", href: "/imports" },
    { label: "Drive inbox", href: "/imports/drive" },
  ],
  exceptions: [
    { label: "Overview", href: "/exceptions" },
    { label: "Negative inventory", href: "/exceptions/negative-inventory" },
    { label: "Catalog review", href: "/exceptions/catalog-review" },
  ],
} as const;
