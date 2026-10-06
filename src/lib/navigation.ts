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
