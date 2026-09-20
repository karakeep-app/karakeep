import type { Metadata } from "next";
import { notFound } from "next/navigation";
import KarakeepLogo from "@/components/KarakeepIcon";
import { PublicBookmarkCard } from "@/components/public/lists/PublicBookmarkGrid";
import { api } from "@/server/api/client";
import { TRPCError } from "@trpc/server";

export async function generateMetadata(props: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  try {
    const { bookmark, ownerName } = await api.publicBookmarks.getPublicBookmark(
      {
        token: params.token,
      },
    );
    return {
      title: `${bookmark.title ?? "Bookmark"} shared by ${ownerName} - Karakeep`,
      applicationName: "Karakeep",
      authors: [
        {
          name: ownerName,
        },
      ],
    };
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") {
      notFound();
    }
  }
  return {
    title: "Karakeep",
  };
}

export default async function PublicBookmarkPage(props: {
  params: Promise<{ token: string }>;
}) {
  const params = await props.params;
  try {
    const { bookmark, ownerName } = await api.publicBookmarks.getPublicBookmark(
      {
        token: params.token,
      },
    );
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="flex items-center justify-between gap-3">
          <KarakeepLogo height={38} />
          <p className="text-sm text-muted-foreground">
            Shared by{" "}
            <span className="font-medium text-foreground">{ownerName}</span>
          </p>
        </div>
        <PublicBookmarkCard bookmark={bookmark} />
      </div>
    );
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") {
      notFound();
    }
    // Anything else is not a missing share. Let it reach the error boundary
    // rather than returning nothing from the component.
    throw e;
  }
}
