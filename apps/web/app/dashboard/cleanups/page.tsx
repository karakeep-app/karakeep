import { IgnoredTagPairs } from "@/components/dashboard/cleanups/IgnoredTagPairs";
import { TagDuplicationDetection } from "@/components/dashboard/cleanups/TagDuplicationDetention";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/lib/i18n/server";
import { EyeOff, Paintbrush, Tags } from "lucide-react";

export default async function Cleanups() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();

  return (
    <div className="flex flex-col gap-y-4 rounded-md border bg-background p-4">
      <span className="flex items-center gap-1 text-2xl">
        <Paintbrush />
        {t("cleanups.cleanups")}
      </span>
      <Separator />
      <span className="flex items-center gap-1 text-xl">
        <Tags />
        {t("cleanups.duplicate_tags.title")}
      </span>
      <Separator />
      <TagDuplicationDetection />
      <Separator />
      <span className="flex items-center gap-1 text-lg">
        <EyeOff />
        Ignored Tag Pairs
      </span>
      <IgnoredTagPairs />
    </div>
  );
}
