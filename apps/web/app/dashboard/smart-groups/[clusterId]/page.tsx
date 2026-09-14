import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";
import { RegenerateSmartGroupsButton } from "@/components/dashboard/smartGroups/RegenerateSmartGroupsButton";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";
import { TRPCError } from "@trpc/server";
import { Sparkles } from "lucide-react";

export async function generateMetadata(props: {
  params: Promise<{ clusterId: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  try {
    const group = await api.smartGroups.get({ clusterId: params.clusterId });
    return {
      title: `${group.label} | Karakeep`,
    };
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") {
      notFound();
    }
    if (e instanceof TRPCError && e.code === "BAD_REQUEST") {
      return { title: "Karakeep" };
    }
    throw e;
  }
}

export default async function SmartGroupPage(props: {
  params: Promise<{ clusterId: string }>;
}) {
  const params = await props.params;
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  let group;
  try {
    group = await api.smartGroups.get({ clusterId: params.clusterId });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") {
      notFound();
    }
    if (e instanceof TRPCError && e.code === "BAD_REQUEST") {
      redirect("/dashboard/smart-groups");
    }
    throw e;
  }

  return (
    <Bookmarks
      query={{ clusterId: group.id }}
      showDivider={true}
      showEditorCard={false}
      header={
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h1 className="flex items-center gap-2 text-2xl tracking-normal text-foreground">
              <Sparkles className="size-6" />
              {group.label}
            </h1>
            <p className="text-md text-muted-foreground">
              {t("smart_groups.bookmark_count", {
                count: group.numBookmarks,
              })}
            </p>
          </div>
          <RegenerateSmartGroupsButton />
        </div>
      }
    />
  );
}
