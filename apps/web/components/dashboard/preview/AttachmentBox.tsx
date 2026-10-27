import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { ButtonWithTooltip, buttonVariants } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import FilePickerButton from "@/components/ui/file-picker-button";
import { toast } from "@/components/ui/sonner";
import LoadingSpinner from "@/components/ui/spinner";
import { ASSET_TYPE_TO_ICON } from "@/lib/attachments";
import useUpload from "@/lib/hooks/upload-file";
import { useTranslation } from "@/lib/i18n/client";
import { cn, formatBytes } from "@/lib/utils";
import {
  ChevronRight,
  Download,
  ImagePlus,
  Paperclip,
  RefreshCw,
  Trash2,
} from "lucide-react";

import {
  useAttachBookmarkAsset,
  useDetachBookmarkAsset,
  useReplaceBookmarkAsset,
} from "@karakeep/shared-react/hooks/assets";
import {
  BookmarkTypes,
  ZAssetType,
  ZBookmark,
} from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";
import {
  isAllowedToAttachAsset,
  isAllowedToDetachAsset,
} from "@karakeep/trpc/lib/attachments";

import {
  DESTRUCTIVE_ICON_CONTROL_CLASS,
  ICON_CONTROL_CLASS,
  IconTooltip,
} from "./IconControl";

function attachmentName(
  t: TFunction,
  asset: { assetType: ZAssetType; fileName?: string | null },
) {
  return asset.assetType === "userUploaded" && asset.fileName
    ? asset.fileName
    : t(`preview.attachments.types.${asset.assetType}`);
}

const SPINNER = <LoadingSpinner className="size-4" />;

/**
 * Holds a column for an action this attachment doesn't have, so that a column's
 * action is in the same place on every row and a click can't land on another.
 */
function EmptyActionSlot() {
  return (
    <span
      aria-hidden
      className="size-8 shrink-0 max-sm:size-11 [@media(pointer:coarse)]:size-11"
    />
  );
}

const OPEN_STORAGE_KEY = "karakeep.preview.attachmentsOpen";

/** Collapsed until opened, and stays as it was last left. */
function useRememberedOpen() {
  const [isOpen, setIsOpen] = useState(false);
  // After mount, as the server can't see what's stored.
  useEffect(() => {
    try {
      setIsOpen(localStorage.getItem(OPEN_STORAGE_KEY) === "true");
    } catch {
      // Storage can be blocked, and then this just isn't remembered.
    }
  }, []);
  const remember = (open: boolean) => {
    setIsOpen(open);
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, String(open));
    } catch {
      // As above.
    }
  };
  return [isOpen, remember] as const;
}

export default function AttachmentBox({
  bookmark,
  readOnly = false,
}: {
  bookmark: ZBookmark;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useRememberedOpen();
  const { mutate: attachAsset, isPending: isAttaching } =
    useAttachBookmarkAsset({
      onSuccess: () => {
        toast({
          description: t("toasts.attachments.attached"),
        });
      },
      onError: (e) => {
        toast({
          description: e.message,
          variant: "destructive",
        });
      },
    });

  const { mutate: replaceAsset, isPending: isReplacing } =
    useReplaceBookmarkAsset({
      onSuccess: () => {
        toast({
          description: t("toasts.attachments.replaced"),
        });
      },
      onError: (e) => {
        toast({
          description: e.message,
          variant: "destructive",
        });
      },
    });

  const { mutate: detachAsset, isPending: isDetaching } =
    useDetachBookmarkAsset({
      onSuccess: () => {
        toast({
          description: t("toasts.attachments.deleted"),
        });
      },
      onError: (e) => {
        toast({
          description: e.message,
          variant: "destructive",
        });
      },
    });

  const { mutate: uploadAsset } = useUpload({
    onError: (e) => {
      toast({
        description: e.error,
        variant: "destructive",
      });
    },
  });

  bookmark.assets.sort((a, b) => a.assetType.localeCompare(b.assetType));

  const hasAssets = bookmark.assets.length > 0;

  return (
    // With nothing to hide there's no toggle, just the line saying so.
    <Collapsible open={isOpen || !hasAssets} onOpenChange={setIsOpen}>
      <div className="flex w-full items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        {hasAssets ? (
          // A wider target for the pointer. The chevron is the keyboard's one.
          <CollapsibleTrigger
            tabIndex={-1}
            className="flex min-h-8 min-w-0 flex-1 items-center gap-2 text-left outline-none hover:text-foreground max-sm:min-h-11 [@media(pointer:coarse)]:min-h-11"
          >
            {t("common.attachments")}
            <span className="font-normal tabular-nums">
              {bookmark.assets.length}
            </span>
          </CollapsibleTrigger>
        ) : (
          t("common.attachments")
        )}
        <div className="flex items-center gap-0.5">
          {!readOnly && (
            <>
              {!bookmark.assets.some(
                (asset) => asset.assetType == "bannerImage",
              ) &&
                bookmark.content.type != BookmarkTypes.ASSET && (
                  <IconTooltip label={t("preview.attachments.add_banner")}>
                    <span className="inline-flex">
                      <FilePickerButton
                        aria-label={t("preview.attachments.add_banner")}
                        loading={isAttaching}
                        spinner={SPINNER}
                        accept=".jpg,.JPG,.jpeg,.png,.webp"
                        multiple={false}
                        variant="ghost"
                        size="none"
                        className={ICON_CONTROL_CLASS}
                        onFileSelect={(file) =>
                          uploadAsset(file, {
                            onSuccess: (resp) => {
                              attachAsset({
                                bookmarkId: bookmark.id,
                                asset: {
                                  id: resp.assetId,
                                  assetType: "bannerImage",
                                },
                              });
                            },
                          })
                        }
                      >
                        <ImagePlus className="size-4" />
                      </FilePickerButton>
                    </span>
                  </IconTooltip>
                )}
              <IconTooltip label={t("preview.attachments.upload_file")}>
                <span className="inline-flex">
                  <FilePickerButton
                    aria-label={t("preview.attachments.upload_file")}
                    loading={isAttaching}
                    spinner={SPINNER}
                    multiple={false}
                    variant="ghost"
                    size="none"
                    className={ICON_CONTROL_CLASS}
                    onFileSelect={(file) =>
                      uploadAsset(file, {
                        onSuccess: (resp) => {
                          attachAsset({
                            bookmarkId: bookmark.id,
                            asset: {
                              id: resp.assetId,
                              assetType: "userUploaded",
                            },
                          });
                        },
                      })
                    }
                  >
                    <Paperclip className="size-4" />
                  </FilePickerButton>
                </span>
              </IconTooltip>
            </>
          )}
          {hasAssets && (
            <IconTooltip
              label={t(
                isOpen ? "preview.collapse_section" : "preview.expand_section",
              )}
            >
              <CollapsibleTrigger
                aria-label={t(
                  isOpen
                    ? "preview.collapse_section"
                    : "preview.expand_section",
                )}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "none" }),
                  ICON_CONTROL_CLASS,
                  // Lines the icon up with the other sections' chevrons.
                  "-mr-2 max-sm:-mr-3.5 [@media(pointer:coarse)]:-mr-3.5",
                )}
              >
                <ChevronRight
                  className={cn(
                    "size-4 transition-transform",
                    isOpen && "rotate-90",
                  )}
                />
              </CollapsibleTrigger>
            </IconTooltip>
          )}
        </div>
      </div>
      <CollapsibleContent className="flex flex-col py-2 text-sm">
        {bookmark.assets.map((asset) => (
          <div
            key={asset.id}
            className="flex items-center justify-between gap-2"
          >
            <Link
              target="_blank"
              href={getAssetUrl(asset.id)}
              className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              prefetch={false}
            >
              <span className="shrink-0">
                {ASSET_TYPE_TO_ICON[asset.assetType]}
              </span>
              <p className="truncate" title={attachmentName(t, asset)}>
                {attachmentName(t, asset)}
              </p>
            </Link>
            <div className="flex shrink-0 items-center gap-0.5">
              {asset.size != null && (
                <span className="mr-1 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {formatBytes(asset.size)}
                </span>
              )}
              <IconTooltip label={t("actions.download")}>
                <Link
                  aria-label={t("actions.download")}
                  target="_blank"
                  href={getAssetUrl(asset.id)}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "none" }),
                    ICON_CONTROL_CLASS,
                  )}
                  download={attachmentName(t, asset)}
                  prefetch={false}
                >
                  <Download className="size-4" />
                </Link>
              </IconTooltip>
              {!readOnly &&
                (isAllowedToAttachAsset(asset.assetType) &&
                asset.assetType !== "userUploaded" ? (
                  <IconTooltip label={t("preview.attachments.replace")}>
                    <span className="inline-flex">
                      <FilePickerButton
                        aria-label={t("preview.attachments.replace")}
                        loading={isReplacing}
                        spinner={SPINNER}
                        accept=".jpg,.JPG,.jpeg,.png,.webp"
                        multiple={false}
                        variant="ghost"
                        size="none"
                        className={ICON_CONTROL_CLASS}
                        onFileSelect={(file) =>
                          uploadAsset(file, {
                            onSuccess: (resp) => {
                              replaceAsset({
                                bookmarkId: bookmark.id,
                                oldAssetId: asset.id,
                                newAssetId: resp.assetId,
                              });
                            },
                          })
                        }
                      >
                        <RefreshCw className="size-4" />
                      </FilePickerButton>
                    </span>
                  </IconTooltip>
                ) : (
                  <EmptyActionSlot />
                ))}
              {!readOnly &&
                (isAllowedToDetachAsset(asset.assetType) ? (
                  <ActionConfirmingDialog
                    title={t("preview.attachments.delete_title")}
                    description={t("preview.attachments.delete_description")}
                    actionButton={(setDialogOpen) => (
                      <ActionButton
                        loading={isDetaching}
                        variant="destructive"
                        onClick={() =>
                          detachAsset(
                            { bookmarkId: bookmark.id, assetId: asset.id },
                            { onSettled: () => setDialogOpen(false) },
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                        {t("actions.delete")}
                      </ActionButton>
                    )}
                  >
                    <ButtonWithTooltip
                      tooltip={t("actions.delete")}
                      delayDuration={0}
                      aria-label={t("actions.delete")}
                      variant="ghost"
                      size="none"
                      className={cn(
                        ICON_CONTROL_CLASS,
                        DESTRUCTIVE_ICON_CONTROL_CLASS,
                      )}
                    >
                      <Trash2 className="size-4" />
                    </ButtonWithTooltip>
                  </ActionConfirmingDialog>
                ) : (
                  <EmptyActionSlot />
                ))}
            </div>
          </div>
        ))}
        {!hasAssets && readOnly && (
          <p className="py-1 text-xs text-muted-foreground">
            {t("preview.attachments.none")}
          </p>
        )}
        {!hasAssets && !readOnly && (
          <p className="py-1 text-xs text-muted-foreground">
            {t("preview.attachments.none_yet")}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
