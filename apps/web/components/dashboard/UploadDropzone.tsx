"use client";

import React, { useCallback, useState } from "react";
import useUpload from "@/lib/hooks/upload-file";
import { cn } from "@/lib/utils";
import { TRPCClientError } from "@trpc/client";
import DropZone from "react-dropzone";

import { useCreateBookmarkWithPostHook } from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import LoadingSpinner from "../ui/spinner";
import { toast } from "../ui/use-toast";
import BookmarkAlreadyExistsToast from "../utils/BookmarkAlreadyExistsToast";

export function useUploadAsset() {
  const { mutateAsync: createBookmark } = useCreateBookmarkWithPostHook({
    onSuccess: (resp) => {
      if (resp.alreadyExists) {
        toast({
          description: <BookmarkAlreadyExistsToast bookmarkId={resp.id} />,
          variant: "default",
        });
      } else {
        toast({ description: "Bookmark uploaded" });
      }
    },
    onError: () => {
      toast({ description: "Something went wrong", variant: "destructive" });
    },
  });

  const { mutateAsync: runUploadAsset } = useUpload({
    onSuccess: async (resp) => {
      const assetType =
        resp.contentType === "application/pdf" ? "pdf" : "image";
      await createBookmark({
        ...resp,
        type: BookmarkTypes.ASSET,
        assetType,
        source: "web",
      });
    },
    onError: (err, req) => {
      toast({
        description: `${req.name}: ${err.error}`,
        variant: "destructive",
      });
    },
  });

  return useCallback(
    async (file: File) => {
      // Handle markdown files as text bookmarks
      if (file.type === "text/markdown" || file.name.endsWith(".md")) {
        try {
          const content = await file.text();
          await createBookmark({
            type: BookmarkTypes.TEXT,
            text: content,
            title: file.name.replace(/\.md$/i, ""), // Remove .md extension from title
            source: "web",
          });
        } catch {
          toast({
            description: `${file.name}: Failed to read markdown file`,
            variant: "destructive",
          });
        }
      } else {
        return runUploadAsset(file);
      }
    },
    [runUploadAsset],
  );
}

function useUploadAssets({
  onFileUpload,
  onFileError,
  onAllUploaded,
}: {
  onFileUpload: () => void;
  onFileError: (name: string, e: Error) => void;
  onAllUploaded: () => void;
}) {
  const runUpload = useUploadAsset();

  return async (files: File[]) => {
    if (files.length == 0) {
      return;
    }
    for (const file of files) {
      try {
        await runUpload(file);
        onFileUpload();
      } catch (e) {
        if (e instanceof TRPCClientError || e instanceof Error) {
          onFileError(file.name, e);
        }
      }
    }
    onAllUploaded();
  };
}

export default function UploadDropzone({
  children,
}: {
  children: React.ReactNode;
}) {
  const [numUploading, setNumUploading] = useState(0);
  const [numUploaded, setNumUploaded] = useState(0);
  const uploadAssets = useUploadAssets({
    onFileUpload: () => {
      setNumUploaded((c) => c + 1);
    },
    onFileError: () => {
      setNumUploaded((c) => c + 1);
    },
    onAllUploaded: () => {
      setNumUploading(0);
      setNumUploaded(0);
      return;
    },
  });

  const [isDragging, setDragging] = useState(false);
  const onDrop = (acceptedFiles: File[]) => {
    uploadAssets(acceptedFiles);
    setNumUploading(acceptedFiles.length);
    setDragging(false);
  };

  return (
    <DropZone
      noClick
      onDrop={onDrop}
      onDragEnter={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
    >
      {({ getRootProps, getInputProps }) => (
        <div {...getRootProps()}>
          <input {...getInputProps()} hidden />
          <div
            className={cn(
              "fixed inset-0 z-50 flex h-full w-full items-center justify-center bg-gray-200 opacity-90",
              isDragging || numUploading > 0 ? undefined : "hidden",
            )}
          >
            {numUploading > 0 ? (
              <div className="flex items-center justify-center gap-2">
                <p className="text-2xl font-bold text-gray-700">
                  Uploading {numUploaded} / {numUploading}
                </p>
                <LoadingSpinner />
              </div>
            ) : (
              <p className="text-2xl font-bold text-gray-700">
                Drop Your Image / PDF / Markdown file
              </p>
            )}
          </div>
          {children}
        </div>
      )}
    </DropZone>
  );
}
