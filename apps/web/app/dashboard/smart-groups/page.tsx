import Link from "next/link";
import { RegenerateSmartGroupsButton } from "@/components/dashboard/smartGroups/RegenerateSmartGroupsButton";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";
import { TRPCError } from "@trpc/server";
import { Sparkles } from "lucide-react";

export default async function SmartGroupsPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();

  let groups: Awaited<ReturnType<typeof api.smartGroups.list>>["groups"] = [];
  let enabled = true;
  try {
    ({ groups } = await api.smartGroups.list());
  } catch (e) {
    if (e instanceof TRPCError && e.code === "BAD_REQUEST") {
      enabled = false;
    } else {
      throw e;
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl tracking-normal text-foreground">
            <Sparkles className="size-6" />
            {t("common.smart_groups")}
          </h1>
          <p className="text-md text-muted-foreground">
            {t("smart_groups.description")}
          </p>
        </div>
        {enabled && <RegenerateSmartGroupsButton />}
      </div>

      {!enabled ? (
        <p className="text-muted-foreground">{t("smart_groups.disabled")}</p>
      ) : groups.length === 0 ? (
        <p className="text-muted-foreground">{t("smart_groups.empty")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Link key={group.id} href={`/dashboard/smart-groups/${group.id}`}>
              <Card className="h-full transition-colors hover:bg-accent/30">
                <CardHeader>
                  <CardTitle className="line-clamp-2 text-lg">
                    {group.label}
                  </CardTitle>
                  <CardDescription>
                    {t("smart_groups.bookmark_count", {
                      count: group.numBookmarks,
                    })}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
