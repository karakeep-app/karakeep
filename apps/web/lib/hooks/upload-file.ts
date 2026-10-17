import { useMutation } from "@tanstack/react-query";

import {
  ZUploadError,
  zUploadErrorSchema,
  ZUploadResponse,
  zUploadResponseSchema,
} from "@karakeep/shared/types/uploads";

export default function useUpload({
  onSuccess,
  onError,
  purpose,
}: {
  purpose?: "attachment";
  onError?: (e: ZUploadError, req: File) => void;
  onSuccess?: (resp: ZUploadResponse, req: File) => Promise<void>;
}) {
  return useMutation({
    scope: purpose === "attachment" ? { id: "attachment-upload" } : undefined,
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      if (purpose) formData.append("purpose", purpose);
      const resp = await fetch("/api/assets", {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      return zUploadResponseSchema.parse(await resp.json());
    },
    onSuccess: onSuccess,
    onError: (error, req) => {
      const err = zUploadErrorSchema.parse(JSON.parse(error.message));
      if (onError) {
        onError(err, req);
      }
    },
  });
}
