import { SectionTabs } from "@/components/ui";
import { sectionNavigation } from "@/lib/navigation";

export function SectionNav({
  section,
  active,
}: {
  section: keyof typeof sectionNavigation;
  active: string;
}) {
  return (
    <SectionTabs
      items={sectionNavigation[section].map((item) => ({
        ...item,
        active: item.href === active,
      }))}
    />
  );
}
