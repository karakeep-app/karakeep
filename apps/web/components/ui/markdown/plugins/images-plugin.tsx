import { useEffect } from "react";
import useUpload from "@/lib/hooks/upload-file";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  DROP_COMMAND,
  PASTE_COMMAND,
} from "lexical";

import { useAttachBookmarkAsset } from "@karakeep/shared-react/hooks/assets";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";
import { zUploadErrorSchema } from "@karakeep/shared/types/uploads";

import { $createImageNode, $isImageNode, ImageNode } from "../nodes/image-node";

function extractImageFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) {
    return [];
  }
  return Array.from(dataTransfer.files).filter((file) =>
    file.type.startsWith("image/"),
  );
}

function extractPastedImageFiles(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData) {
    return [];
  }
  return Array.from(clipboardData.items)
    .filter((item) => item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

function sanitizeFileNameFragment(value: string): string {
  const trimmed = value.trim().replace(/[^\w.-]+/g, "_");
  return trimmed.length > 0 ? trimmed : "pasted-image";
}

// Some pasted rich content (e.g. copying a page from another site) embeds
// its images directly as base64 data URIs rather than as file attachments.
// Those never go through the normal upload flow, so left alone they'd
// inline arbitrarily large blobs straight into the note's markdown. We
// convert them into a real uploaded asset instead, same as any other
// pasted/dropped image.
async function dataUriToFile(dataUri: string, altText: string): Promise<File> {
  const response = await fetch(dataUri);
  const blob = await response.blob();
  const extension = blob.type.split("/")[1]?.split("+")[0] ?? "png";
  const name = sanitizeFileNameFragment(altText || "pasted-image");
  return new File([blob], `${name}.${extension}`, { type: blob.type });
}

export default function ImagesPlugin({
  bookmarkId,
  disabled,
}: {
  bookmarkId: string;
  disabled?: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const { mutateAsync: uploadAsset } = useUpload({});
  const { mutateAsync: attachAsset } = useAttachBookmarkAsset();

  useEffect(() => {
    if (disabled) {
      return;
    }
    const handleFiles = (files: File[]) => {
      for (const file of files) {
        let nodeKey: string | null = null;
        editor.update(() => {
          const placeholder = $createImageNode({
            src: null,
            altText: file.name,
            uploading: true,
          });
          nodeKey = placeholder.getKey();
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            $getRoot().selectEnd();
          }
          $insertNodes([placeholder]);
        });

        void (async () => {
          try {
            const uploaded = await uploadAsset(file);
            const placeholderStillPresent = editor
              .getEditorState()
              .read(() =>
                $isImageNode(nodeKey ? $getNodeByKey(nodeKey) : null),
              );
            if (!placeholderStillPresent) {
              // The user deleted the placeholder while the upload was in
              // flight. Leave the asset unattached rather than attaching it
              // to the bookmark with nothing in the saved text referencing
              // it, which would make it an untrackable orphan.
              return;
            }
            await attachAsset({
              bookmarkId,
              asset: { id: uploaded.assetId, assetType: "noteImage" },
            });
            editor.update(() => {
              const node = nodeKey ? $getNodeByKey(nodeKey) : null;
              if ($isImageNode(node)) {
                node.setSrc(getAssetUrl(uploaded.assetId));
                node.setUploading(false);
              }
            });
          } catch (e) {
            let message = "Upload failed";
            if (e instanceof Error) {
              message = e.message;
              try {
                const parsed = zUploadErrorSchema.safeParse(
                  JSON.parse(e.message),
                );
                if (parsed.success) {
                  message = parsed.data.error;
                }
              } catch {
                // e.message wasn't a JSON-encoded upload error; use it as-is.
              }
            }
            editor.update(() => {
              const node = nodeKey ? $getNodeByKey(nodeKey) : null;
              if ($isImageNode(node)) {
                node.replace(
                  $createTextNode(
                    `⚠ Failed to upload "${file.name}": ${message}`,
                  ),
                );
              }
            });
          }
        })();
      }
    };

    return mergeRegister(
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          if (!(event instanceof ClipboardEvent)) {
            return false;
          }
          const files = extractPastedImageFiles(event.clipboardData);
          if (files.length === 0) {
            return false;
          }
          event.preventDefault();
          handleFiles(files);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        DROP_COMMAND,
        (event) => {
          const files = extractImageFiles(event.dataTransfer);
          if (files.length === 0) {
            return false;
          }
          event.preventDefault();
          event.stopPropagation();
          handleFiles(files);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerNodeTransform(ImageNode, (node) => {
        if (node.isUploading() || node.getErrorMessage()) {
          return;
        }
        const src = node.getSrc();
        if (!src || !src.startsWith("data:")) {
          return;
        }
        const nodeKey = node.getKey();
        const altText = node.getAltText();
        node.setUploading(true);
        void (async () => {
          try {
            const file = await dataUriToFile(src, altText);
            const uploaded = await uploadAsset(file);
            const placeholderStillPresent = editor
              .getEditorState()
              .read(() => $isImageNode($getNodeByKey(nodeKey)));
            if (!placeholderStillPresent) {
              // The user deleted the image while the upload was in flight.
              // Leave the asset unattached rather than attaching it to the
              // bookmark with nothing in the saved text referencing it.
              return;
            }
            await attachAsset({
              bookmarkId,
              asset: { id: uploaded.assetId, assetType: "noteImage" },
            });
            editor.update(() => {
              const uploadedNode = $getNodeByKey(nodeKey);
              if ($isImageNode(uploadedNode)) {
                uploadedNode.setSrc(getAssetUrl(uploaded.assetId));
                uploadedNode.setUploading(false);
              }
            });
          } catch (e) {
            let message = "Upload failed";
            if (e instanceof Error) {
              message = e.message;
              try {
                const parsed = zUploadErrorSchema.safeParse(
                  JSON.parse(e.message),
                );
                if (parsed.success) {
                  message = parsed.data.error;
                }
              } catch {
                // e.message wasn't a JSON-encoded upload error; use it as-is.
              }
            }
            editor.update(() => {
              const failedNode = $getNodeByKey(nodeKey);
              if ($isImageNode(failedNode)) {
                failedNode.replace(
                  $createTextNode(
                    `⚠ Failed to upload "${altText || "image"}": ${message}`,
                  ),
                );
              }
            });
          }
        })();
      }),
    );
  }, [editor, bookmarkId, disabled, uploadAsset, attachAsset]);

  return null;
}
