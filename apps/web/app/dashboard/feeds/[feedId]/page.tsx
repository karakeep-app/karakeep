import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/server/api/client";
import { TRPCError } from "@trpc/server";

export async function generateMetadata(props: {
  params: Promise<{ feedId: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  try {
    const feed = await api.feeds.get({ feedId: params.feedId });
    return {
      title: `${feed.name} | Karakeep`,
    };
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") {
      notFound();
    }
    throw e;
  }
}

export default async function FeedPage(props: {
  params: Promise<{ feedId: string }>;
}) {
  const params = await props.params;
  let feed;
  try {
    feed = await api.feeds.get({ feedId: params.feedId });
  } catch (e) {
    if (e instanceof TRPCError) {
      if (e.code == "NOT_FOUND") {
        notFound();
      }
    }
    throw e;
  }

  return (
    <Bookmarks
      query={{ rssFeedId: feed.id }}
      showDivider={true}
      showEditorCard={false}
      header={<PageHeader title={feed.name} />}
    />
  );
}
