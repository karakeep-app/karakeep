import ReactNativeBlobUtil from "react-native-blob-util";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  zUploadErrorSchema,
  zUploadResponseSchema,
} from "@karakeep/shared/types/uploads";

import type { Settings } from "./settings";
import { buildApiHeaders } from "./utils";

// Not every failure has an `{ error }` body: unhandled server errors are plain
// text, and auth/validation/rate-limit failures use other shapes.
function getUploadErrorMessage(status: number, body: string): string {
  try {
    const parsed = zUploadErrorSchema.safeParse(JSON.parse(body));
    if (parsed.success) {
      return parsed.data.error;
    }
  } catch {
    // Not JSON
  }
  return `Upload failed (HTTP ${status})`;
}

export function useUploadAsset(
  settings: Settings,
  options: {
    onSuccess?: (bookmark: ZBookmark & { alreadyExists: boolean }) => void;
    onError?: (e: string) => void;
  },
) {
  const api = useTRPC();
  const queryClient = useQueryClient();

  const { mutate: createBookmark, isPending: isCreatingBookmark } = useMutation(
    api.bookmarks.createBookmark.mutationOptions({
      onSuccess: (d) => {
        queryClient.invalidateQueries(api.bookmarks.getBookmarks.pathFilter());
        if (options.onSuccess) {
          options.onSuccess(d);
        }
      },
      onError: (e) => {
        if (options.onError) {
          options.onError(e.message);
        }
      },
    }),
  );

  const { mutate: uploadAsset, isPending: isUploading } = useMutation({
    mutationFn: async (file: { type: string; name: string; uri: string }) => {
      // There's a bug in the native FormData implementation (https://github.com/facebook/react-native/issues/44737)
      // that will only get fixed in react native 0.77. Using the BlobUtil implementation for now.
      const resp = await ReactNativeBlobUtil.fetch(
        "POST",
        `${settings.address}/api/assets`,
        {
          ...buildApiHeaders(settings.apiKey, settings.customHeaders),
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
      const status = resp.info().status;
      const body: string = await resp.text();
      if (status < 200 || status >= 300) {
        throw new Error(getUploadErrorMessage(status, body));
      }
      try {
        return zUploadResponseSchema.parse(JSON.parse(body));
      } catch {
        // e.g. a proxy or captive portal answering with an HTML page
        throw new Error(`Unexpected server response (HTTP ${status})`);
      }
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
      options.onError?.(e.message);
    },
  });

  return {
    uploadAsset,
    isPending: isUploading || isCreatingBookmark,
  };
}
