import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ClipboardCheck,
  CookingPot,
  FileInput,
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
};

export const managerNavigation: NavigationItem[] = [
  {
    label: "Today",
    href: "/today",
    icon: Sparkles,
    description: "Reviews, cutoffs, tasks, and material exceptions.",
  },
  {
    label: "Imports",
    href: "/imports",
    icon: FileInput,
    description: "Upload and review source documents and extracts.",
  },
  {
    label: "Mapping",
    href: "/mapping",
    icon: GitCompare,
    description: "Map Toast items, vendor codes, and units to inventory.",
  },
  {
    label: "Financial health",
    href: "/financial-health",
    icon: BarChart3,
    description: "Sales, COGS, margin, labor, and prime cost.",
  },
  {
    label: "Purchasing",
    href: "/purchasing",
    icon: ShoppingBasket,
    description: "Suggested orders, purchase orders, and vendor activity.",
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Boxes,
    description: "On-hand projection, counts, variance, and known loss.",
  },
  {
    label: "Recipes",
    href: "/recipes",
    icon: ReceiptText,
    description: "Recipe versions, costs, yields, and menu mappings.",
  },
  {
    label: "Exceptions",
    href: "/exceptions",
    icon: AlertTriangle,
    description: "Blocking issues, incomplete data, and warnings.",
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
