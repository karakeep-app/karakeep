"use client";

import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { toast } from "@/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ASSET_TYPE_TO_ICON } from "@/lib/attachments";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { formatBytes } from "@/lib/utils";
import { ExternalLink, Trash2 } from "lucide-react";

import { useDetachBookmarkAsset } from "@karakeep/shared-react/hooks/assets";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";
import {
  humanFriendlyNameForAssertType,
  isAllowedToDetachAsset,
} from "@karakeep/trpc/lib/attachments";

export default function AssetsSettingsPage() {
  const { t } = useTranslation();
  const { mutate: detachAsset, isPending: isDetaching } =
    useDetachBookmarkAsset({
      onSuccess: () => {
        toast({
          description: "Asset has been deleted!",
        });
      },
      onError: (e) => {
        toast({
          description: e.message,
          variant: "destructive",
        });
      },
    });
  const {
    data,
    isLoading: isAssetsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = api.assets.list.useInfiniteQuery(
    {
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const assets = data?.pages.flatMap((page) => page.assets) ?? [];

  if (isAssetsLoading) {
    return <FullPageSpinner />;
  }

  return (
    <div className="rounded-md border bg-background p-4">
      <div className="flex flex-col gap-2">
        <div className="mb-2 text-lg font-medium">
          {t("settings.manage_assets.manage_assets")}
        </div>
        {assets.length === 0 && (
          <p className="rounded-md bg-muted p-2 text-sm text-muted-foreground">
            {t("settings.manage_assets.no_assets")}
          </p>
        )}
        {assets.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings.manage_assets.asset_type")}</TableHead>
                <TableHead>{t("common.size")}</TableHead>
                <TableHead>{t("settings.manage_assets.asset_link")}</TableHead>
                <TableHead>
                  {t("settings.manage_assets.bookmark_link")}
                </TableHead>
                <TableHead>{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="flex items-center gap-2">
                    {ASSET_TYPE_TO_ICON[asset.assetType]}
                    <span>
                      {humanFriendlyNameForAssertType(asset.assetType)}
                    </span>
                  </TableCell>
                  <TableCell>{formatBytes(asset.size)}</TableCell>
                  <TableCell>
                    <Link
                      href={getAssetUrl(asset.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1"
                      prefetch={false}
                    >
                      <ExternalLink className="size-4" />
                      <span>View Asset</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    {asset.bookmarkId ? (
                      <Link
                        href={`/dashboard/preview/${asset.bookmarkId}`}
                        className="flex items-center gap-1"
                        prefetch={false}
                      >
                        <ExternalLink className="size-4" />
                        <span>View Bookmark</span>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">No bookmark</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isAllowedToDetachAsset(asset.assetType) &&
                      asset.bookmarkId && (
                        <ActionConfirmingDialog
                          title={t("settings.manage_assets.delete_asset")}
                          description={t(
                            "settings.manage_assets.delete_asset_confirmation",
                          )}
                          actionButton={(setDialogOpen) => (
                            <ActionButton
                              loading={isDetaching}
                              variant="destructive"
                              onClick={() =>
                                detachAsset(
                                  {
                                    bookmarkId: asset.bookmarkId!,
                                    assetId: asset.id,
                                  },
                                  { onSettled: () => setDialogOpen(false) },
                                )
                              }
                            >
                              <Trash2 className="mr-2 size-4" />
                              {t("actions.delete")}
                            </ActionButton>
                          )}
                        >
                          <Button
                            variant="destructive"
                            size="sm"
                            title="Delete"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </ActionConfirmingDialog>
                      )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {hasNextPage && (
          <div className="flex justify-center">
            <ActionButton
              variant="secondary"
              onClick={() => fetchNextPage()}
              loading={isFetchingNextPage}
              ignoreDemoMode={true}
            >
              Load More
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  );
}
