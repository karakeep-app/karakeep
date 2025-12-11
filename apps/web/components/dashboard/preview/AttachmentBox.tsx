import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import FilePickerButton from "@/components/ui/file-picker-button";
import { toast } from "@/components/ui/use-toast";
import { ASSET_TYPE_TO_ICON } from "@/lib/attachments";
import useUpload from "@/lib/hooks/upload-file";
import { useTranslation } from "@/lib/i18n/client";
import { ChevronsDownUp, Download, Pencil, Plus, Trash2 } from "lucide-react";

import {
  useAttachBookmarkAsset,
  useDetachBookmarkAsset,
  useReplaceBookmarkAsset,
} from "@karakeep/shared-react/hooks/assets";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";
import {
  humanFriendlyNameForAssertType,
  isAllowedToAttachAsset,
  isAllowedToDetachAsset,
} from "@karakeep/trpc/lib/attachments";

export default function AttachmentBox({
  bookmark,
  readOnly = false,
}: {
  bookmark: ZBookmark;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const { mutate: attachAsset, isPending: isAttaching } =
    useAttachBookmarkAsset({
      onSuccess: () => {
        toast({
          description: "Attachment has been attached!",
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
          description: "Attachment has been replaced!",
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
          description: "Attachment has been detached!",
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

  return (
    <Collapsible>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-sm text-gray-400">
        {t("common.attachments")}
        <ChevronsDownUp className="size-4" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-1 py-2 text-sm">
        {bookmark.assets.map((asset) => (
          <div key={asset.id} className="flex items-center justify-between">
            <Link
              target="_blank"
              href={getAssetUrl(asset.id)}
              className="flex items-center gap-1"
              prefetch={false}
            >
              {ASSET_TYPE_TO_ICON[asset.assetType]}
              <p>
                {asset.assetType === "userUploaded" && asset.fileName
                  ? asset.fileName
                  : humanFriendlyNameForAssertType(asset.assetType)}
              </p>
            </Link>
            <div className="flex gap-2">
              <Link
                title="Download"
                target="_blank"
                href={getAssetUrl(asset.id)}
                className="flex items-center gap-1"
                download={
                  asset.assetType === "userUploaded" && asset.fileName
                    ? asset.fileName
                    : humanFriendlyNameForAssertType(asset.assetType)
                }
                prefetch={false}
              >
                <Download className="size-4" />
              </Link>
              {!readOnly &&
                isAllowedToAttachAsset(asset.assetType) &&
                asset.assetType !== "userUploaded" && (
                  <FilePickerButton
                    title="Replace"
                    loading={isReplacing}
                    accept=".jgp,.JPG,.jpeg,.png,.webp"
                    multiple={false}
                    variant="none"
                    size="none"
                    className="flex items-center gap-2"
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
                    <Pencil className="size-4" />
                  </FilePickerButton>
                )}
              {!readOnly && isAllowedToDetachAsset(asset.assetType) && (
                <ActionConfirmingDialog
                  title="Delete Attachment?"
                  description={`Are you sure you want to delete the attachment of the bookmark?`}
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
                      <Trash2 className="mr-2 size-4" />
                      Delete
                    </ActionButton>
                  )}
                >
                  <Button variant="none" size="none" title="Delete">
                    <Trash2 className="size-4" />
                  </Button>
                </ActionConfirmingDialog>
              )}
            </div>
          </div>
        ))}
        {!readOnly &&
          !bookmark.assets.some((asset) => asset.assetType == "bannerImage") &&
          bookmark.content.type != BookmarkTypes.ASSET && (
            <FilePickerButton
              title="Attach a Banner"
              loading={isAttaching}
              accept=".jgp,.JPG,.jpeg,.png,.webp"
              multiple={false}
              variant="ghost"
              size="none"
              className="flex w-full items-center justify-center gap-2"
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
              <Plus className="size-4" />
              Attach a Banner
            </FilePickerButton>
          )}
        {!readOnly && (
          <FilePickerButton
            title="Upload File"
            loading={isAttaching}
            multiple={false}
            variant="ghost"
            size="none"
            className="flex w-full items-center justify-center gap-2"
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
            <Plus className="size-4" />
            Upload File
          </FilePickerButton>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
