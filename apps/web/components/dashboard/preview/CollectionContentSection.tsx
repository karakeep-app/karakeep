"use client";

import Image from "next/image";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

export function CollectionContentSection({
  bookmark,
}: {
  bookmark: ZBookmark;
}) {
  if (bookmark.content.type !== BookmarkTypes.COLLECTION) {
    throw new Error("Invalid content type");
  }

  const { t } = useTranslation();
  const items = [...bookmark.content.items].sort(
    (a, b) => a.position - b.position,
  );
  const api = useTRPC();
  const queryClient = useQueryClient();

  const { mutate: reorderItems, isPending: isReordering } = useMutation(
    api.bookmarks.reorderImageCollectionItems.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          api.bookmarks.getBookmark.queryFilter({ bookmarkId: bookmark.id }),
        );
        queryClient.invalidateQueries(api.bookmarks.getBookmarks.pathFilter());
      },
      onError: () => {
        toast({
          description: t("preview.failed_to_reorder_images"),
          variant: "destructive",
        });
      },
    }),
  );

  const { mutate: deleteItem, isPending: isDeleting } = useMutation(
    api.bookmarks.deleteImageCollectionItem.mutationOptions({
      onSuccess: () => {
        toast({
          description: t("preview.image_removed_from_collection"),
        });
        queryClient.invalidateQueries(
          api.bookmarks.getBookmark.queryFilter({ bookmarkId: bookmark.id }),
        );
        queryClient.invalidateQueries(api.bookmarks.getBookmarks.pathFilter());
      },
      onError: (e) => {
        toast({
          description: e.message || t("preview.failed_to_delete_image"),
          variant: "destructive",
        });
      },
    }),
  );

  const moveItem = (fromIndex: number, toIndex: number) => {
    const nextItems = [...items];
    const [item] = nextItems.splice(fromIndex, 1);
    if (!item) {
      return;
    }
    nextItems.splice(toIndex, 0, item);

    reorderItems({
      bookmarkId: bookmark.id,
      bookmarkIds: nextItems.map((item) => item.bookmarkId),
    });
  };

  return (
    <div className="flex h-full min-w-full flex-col gap-3">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto">
        {items.map((item, index) => (
          <div key={item.bookmarkId} className="flex flex-col gap-2">
            {items.length > 1 && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                  <span className="shrink-0">
                    {index + 1} / {items.length}
                  </span>
                  {item.fileName && (
                    <span className="truncate" title={item.fileName}>
                      {item.fileName}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={index === 0 || isReordering || isDeleting}
                    onClick={() => moveItem(index, index - 1)}
                    title={t("preview.move_image_up")}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={
                      index === items.length - 1 || isReordering || isDeleting
                    }
                    onClick={() => moveItem(index, index + 1)}
                    title={t("preview.move_image_down")}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <ActionConfirmingDialog
                    title={t("preview.remove_image_from_collection_title")}
                    description={t(
                      "preview.remove_image_from_collection_description",
                    )}
                    actionButton={(setDialogOpen) => (
                      <ActionButton
                        loading={isDeleting}
                        variant="destructive"
                        onClick={() =>
                          deleteItem(
                            {
                              bookmarkId: bookmark.id,
                              itemBookmarkId: item.bookmarkId,
                            },
                            { onSettled: () => setDialogOpen(false) },
                          )
                        }
                      >
                        <Trash2 className="mr-2 size-4" />
                        {t("preview.delete_image")}
                      </ActionButton>
                    )}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={items.length <= 1 || isReordering || isDeleting}
                      title={t("preview.delete_image")}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </ActionConfirmingDialog>
                </div>
              </div>
            )}

            <div className="relative min-h-[60vh] overflow-hidden rounded border bg-muted">
              <Link
                href={`/dashboard/preview/${item.bookmarkId}`}
                aria-label={t("preview.collection_image", {
                  index: index + 1,
                })}
              >
                <Image
                  alt={t("preview.collection_image", { index: index + 1 })}
                  fill={true}
                  unoptimized
                  className="object-contain"
                  src={getAssetUrl(item.assetId)}
                />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
