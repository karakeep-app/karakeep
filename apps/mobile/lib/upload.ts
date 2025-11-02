import ReactNativeBlobUtil from "react-native-blob-util";
import { useMutation } from "@tanstack/react-query";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  zUploadErrorSchema,
  zUploadResponseSchema,
} from "@karakeep/shared/types/uploads";

import type { Settings } from "./settings";
import { api } from "./trpc";

export function useUploadAsset(
  settings: Settings,
  options: {
    onSuccess?: (bookmark: ZBookmark & { alreadyExists: boolean }) => void;
    onError?: (e: string) => void;
  },
) {
  const invalidateAllBookmarks =
    api.useUtils().bookmarks.getBookmarks.invalidate;

  const { mutate: createBookmark, isPending: isCreatingBookmark } =
    api.bookmarks.createBookmark.useMutation({
      onSuccess: (d) => {
        invalidateAllBookmarks();
        if (options.onSuccess) {
          options.onSuccess(d);
        }
      },
      onError: (e) => {
        if (options.onError) {
          options.onError(e.message);
        }
      },
    });

  const { mutate: uploadAsset, isPending: isUploading } = useMutation({
    mutationFn: async (file: { type: string; name: string; uri: string }) => {
      // There's a bug in the native FormData implementation (https://github.com/facebook/react-native/issues/44737)
      // that will only get fixed in react native 0.77. Using the BlobUtil implementation for now.
      const resp = await ReactNativeBlobUtil.fetch(
        "POST",
        `${settings.address}/api/assets`,
        {
          Authorization: `Bearer ${settings.apiKey}`,
          "Content-Type": "multipart/form-data",
        },
        [
          {
            name: "file",
            filename: file.name,
            type: file.type,
            data: ReactNativeBlobUtil.wrap(file.uri.replace("file://", "")),
          },
        ],
      );
      return zUploadResponseSchema.parse(await resp.json());
    },
    onSuccess: (resp) => {
      const assetId = resp.assetId;
      const assetType =
        resp.contentType === "application/pdf" ? "pdf" : "image";
      createBookmark({
        type: BookmarkTypes.ASSET,
        assetId,
        assetType,
        source: "mobile",
      });
    },
    onError: (e) => {
      if (options.onError) {
        const err = zUploadErrorSchema.parse(JSON.parse(e.message));
        options.onError(err.error);
      }
    },
  });

  return {
    uploadAsset,
    isPending: isUploading || isCreatingBookmark,
  };
}
