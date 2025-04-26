import { TagAIDuplicationDetection } from "@/components/dashboard/cleanups/TagAIDuplicationDetention";
import { TagDuplicationDetection } from "@/components/dashboard/cleanups/TagDuplicationDetention";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/lib/i18n/server";
import { Paintbrush } from "lucide-react";

export default async function Cleanups() {
  const { t } = await useTranslation();

  return (
    <div className="flex flex-col gap-y-4 rounded-md border bg-background p-4">
      <span className="flex items-center gap-1 text-2xl">
        <Paintbrush />
        {t("cleanups.cleanups")}
      </span>
      <Separator />
      <TagDuplicationDetection />
      <TagAIDuplicationDetection />
    </div>
  );
}
