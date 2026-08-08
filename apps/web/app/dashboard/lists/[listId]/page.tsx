import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DenseFiles from "@/components/dashboard/dense/DenseFiles";
import { api } from "@/server/api/client";
import { TRPCError } from "@trpc/server";

export async function generateMetadata(props: {
  params: Promise<{ listId: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  try {
    const list = await api.lists.get({ listId: params.listId });
    return {
      title: `${list.name} | Karakeep`,
    };
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") {
      notFound();
    }
    throw e;
  }
}

export default async function ListPage(props: {
  params: Promise<{ listId: string }>;
  searchParams?: Promise<{
    includeArchived?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const userSettings = await api.users.settings();
  let list;
  try {
    list = await api.lists.get({ listId: params.listId });
  } catch (e) {
    if (e instanceof TRPCError) {
      if (e.code == "NOT_FOUND") {
        notFound();
      }
    }
    throw e;
  }

  const includeArchived =
    searchParams?.includeArchived !== undefined
      ? searchParams.includeArchived === "true"
      : userSettings.archiveDisplayBehaviour === "show";

  // Smart lists reject additions server-side — their contents are computed
  // from list.query, not a manual membership row — and viewers can't add
  // regardless of list type.
  const canEdit = list.userRole === "owner" || list.userRole === "editor";

  return (
    <DenseFiles
      label={`${list.icon} ${list.name}`}
      query={{
        listId: list.id,
        archived: !includeArchived ? false : undefined,
      }}
      disableAdd={list.type !== "manual" || !canEdit}
    />
  );
}
