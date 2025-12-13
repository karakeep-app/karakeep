import { TagDuplicationDetection } from "@/components/dashboard/cleanups/TagDuplicationDetention";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/lib/i18n/server";
import { Paintbrush, Tags } from "lucide-react";

export default async function Cleanups() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Paintbrush className="size-5" />}
        title={t("cleanups.cleanups")}
      />
      <div className="space-y-4 rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
        <div className="flex items-center gap-1 text-xl">
          <Tags />
          {t("cleanups.duplicate_tags.title")}
        </div>
        <Separator />
        <TagDuplicationDetection />
      </div>
    </div>
  );
}
