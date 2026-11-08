"use client";

import { useState } from "react";
import Link from "next/link";
import { RowActionsMenu } from "@/components/settings/RowActions";
import {
  SettingsPage,
  SettingsSection,
} from "@/components/settings/SettingsPage";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { ASSET_TYPE_TO_ICON } from "@/lib/attachments";
import { useTranslation } from "@/lib/i18n/client";
import { formatBytes } from "@/lib/utils";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { ExternalLink, HardDrive, Trash2 } from "lucide-react";

import type { ZAssetType } from "@karakeep/shared/types/bookmarks";
import { useDetachBookmarkAsset } from "@karakeep/shared-react/hooks/assets";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";
import { isAllowedToDetachAsset } from "@karakeep/trpc/lib/attachments";

type SortBy = "size" | "newest";

interface StorageAsset {
  id: string;
  assetType: ZAssetType;
  size: number;
  contentType: string | null;
  fileName: string | null;
  bookmarkId: string | null;
  bookmarkTitle: string | null;
  bookmarkUrl: string | null;
}

function domainOf(url: string | null) {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function AssetThumbnail({ asset }: { asset: StorageAsset }) {
  const [failed, setFailed] = useState(false);
  const isImage =
    asset.contentType?.startsWith("image/") ||
    asset.assetType === "screenshot" ||
    asset.assetType === "bannerImage" ||
    asset.assetType === "assetScreenshot" ||
    asset.assetType === "avatar";

  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
      {isImage && !failed ? (
        // oxlint-disable-next-line nextjs/no-img-element -- assets are served by the app itself
        <img
          src={getAssetUrl(asset.id)}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        ASSET_TYPE_TO_ICON[asset.assetType]
      )}
    </span>
  );
}

function AssetRow({
  asset,
  isDetaching,
  onDetach,
}: {
  asset: StorageAsset;
  isDetaching: boolean;
  onDetach: (
    input: { bookmarkId: string; assetId: string },
    done: () => void,
  ) => void;
}) {
  const { t } = useTranslation();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const assetUrl = getAssetUrl(asset.id);
  const bookmarkUrl = asset.bookmarkId
    ? `/dashboard/preview/${asset.bookmarkId}`
    : undefined;
  const canDelete =
    isAllowedToDetachAsset(asset.assetType) && !!asset.bookmarkId;
  const title =
    asset.bookmarkTitle ||
    asset.fileName ||
    (asset.bookmarkId
      ? t("common.untitled")
      : t("settings.manage_assets.no_bookmark"));
  const domain = domainOf(asset.bookmarkUrl);
  const typeName = t(`preview.attachments.types.${asset.assetType}`);
  const size = formatBytes(asset.size, 1);

  return (
    <li className="flex h-16 items-center gap-3 sm:gap-4">
      <AssetThumbnail asset={asset} />
      <div className="min-w-0 flex-1">
        {bookmarkUrl ? (
          <Link
            href={bookmarkUrl}
            prefetch={false}
            className="block truncate text-sm font-medium underline-offset-4 hover:underline"
          >
            {title}
          </Link>
        ) : (
          <p className="truncate text-sm font-medium">{title}</p>
        )}
        <p className="truncate text-sm text-muted-foreground">
          {/* Phones give the title the room the size column would take. */}
          <span className="tabular-nums sm:hidden">{size} · </span>
          {domain ? `${typeName} · ${domain}` : typeName}
        </p>
      </div>
      <span className="hidden shrink-0 text-sm tabular-nums text-muted-foreground sm:inline">
        {size}
      </span>
      {canDelete && (
        <ActionConfirmingDialog
          open={deleteOpen}
          setOpen={setDeleteOpen}
          title={t("settings.manage_assets.delete_asset_title")}
          description={t("settings.manage_assets.delete_asset_confirmation")}
          actionButton={(setDialogOpen) => (
            <ActionButton
              loading={isDetaching}
              variant="destructive"
              onClick={() =>
                onDetach(
                  { bookmarkId: asset.bookmarkId!, assetId: asset.id },
                  () => setDialogOpen(false),
                )
              }
            >
              <Trash2 className="size-4" />
              {t("actions.delete")}
            </ActionButton>
          )}
        />
      )}
      <RowActionsMenu
        label={t("common.actions_for", { name: title })}
        items={[
          {
            label: t("settings.manage_assets.view_asset"),
            icon: <ExternalLink className="size-4" />,
            href: assetUrl,
            external: true,
          },
          ...(bookmarkUrl
            ? [
                {
                  label: t("settings.manage_assets.view_bookmark"),
                  icon: <ExternalLink className="size-4" />,
                  href: bookmarkUrl,
                },
              ]
            : []),
          ...(canDelete
            ? [
                {
                  label: t("settings.manage_assets.delete_asset"),
                  icon: <Trash2 className="size-4" />,
                  destructive: true,
                  onSelect: () => setDeleteOpen(true),
                },
              ]
            : []),
        ]}
      />
    </li>
  );
}

export default function AssetsSettingsPage() {
  const api = useTRPC();
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState<SortBy>("size");
  const { mutate: detachAsset, isPending: isDetaching } =
    useDetachBookmarkAsset({
      onSuccess: () => {
        toast({
          description: t("settings.manage_assets.asset_deleted"),
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
  } = useInfiniteQuery(
    api.assets.list.infiniteQueryOptions(
      {
        limit: 20,
        sortBy,
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        placeholderData: keepPreviousData,
      },
    ),
  );

  const assets = data?.pages.flatMap((page) => page.assets) ?? [];
  const totals = data?.pages[0];

  if (isAssetsLoading) {
    return <FullPageSpinner />;
  }

  return (
    <SettingsPage
      title={t("settings.manage_assets.manage_assets")}
      description={
        totals && totals.totalCount > 0
          ? t("settings.manage_assets.total", {
              count: totals.totalCount,
              size: formatBytes(totals.totalSize, 1),
            })
          : t("settings.manage_assets.page_description")
      }
      action={
        assets.length > 0 ? (
          <Select
            value={sortBy}
            onValueChange={(value) => setSortBy(value as SortBy)}
          >
            <SelectTrigger
              className="w-40"
              aria-label={t("settings.manage_assets.sort_label")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="size">
                {t("settings.manage_assets.sort_size")}
              </SelectItem>
              <SelectItem value="newest">
                {t("settings.manage_assets.sort_newest")}
              </SelectItem>
            </SelectContent>
          </Select>
        ) : undefined
      }
    >
      {assets.length === 0 ? (
        <EmptyState
          icon={HardDrive}
          title={t("settings.manage_assets.no_assets")}
          description={t("settings.manage_assets.no_assets_description")}
        />
      ) : (
        <SettingsSection>
          <ul className="-my-2 divide-y">
            {assets.map((asset) => (
              <AssetRow
                key={asset.id}
                asset={asset}
                isDetaching={isDetaching}
                onDetach={(input, done) =>
                  detachAsset(input, { onSettled: done })
                }
              />
            ))}
          </ul>
          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <ActionButton
                variant="outline"
                onClick={() => fetchNextPage()}
                loading={isFetchingNextPage}
                ignoreDemoMode={true}
              >
                {t("actions.load_more")}
              </ActionButton>
            </div>
          )}
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
