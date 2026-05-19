import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";
import TagHeader from "@/components/dashboard/tags/TagHeader";
import { api } from "@/server/api/client";
import { TRPCError } from "@trpc/server";

export async function generateMetadata(props: {
  params: Promise<{ tagId: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  try {
    const tag = await api.tags.get({ tagId: params.tagId });
    return {
      title: `${tag.name} | Karakeep`,
    };
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") {
      notFound();
    }
    throw e;
  }
}

export default async function TagPage(props: {
  params: Promise<{ tagId: string }>;
  searchParams?: Promise<{
    includeArchived?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  let tag;
  try {
    tag = await api.tags.get({ tagId: params.tagId });
  } catch (e) {
    if (e instanceof TRPCError) {
      if (e.code == "NOT_FOUND") {
        notFound();
      }
    }
    throw e;
  }
  const userSettings = await api.users.settings();

  const includeArchived =
    searchParams?.includeArchived !== undefined
      ? searchParams.includeArchived === "true"
      : userSettings.archiveDisplayBehaviour === "show";

  return (
    <Bookmarks
      header={<TagHeader initialData={tag} />}
      showDivider={true}
      query={{
        tagId: tag.id,
        archived: !includeArchived ? false : undefined,
      }}
      showEditorCard={true}
    />
  );
}
