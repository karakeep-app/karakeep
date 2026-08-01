import { useState } from "react";
import { Alert } from "react-native";
import { onlineManager, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

import { useToast } from "../ui/Toast";
import {
  getOfflineLibraryScope,
  OFFLINE_LIBRARY_SCHEMA_VERSION,
  removeOfflineArticle,
  saveOfflineArticle,
  useIsAvailableOffline,
} from "../../lib/offlineLibrary";
import useAppSettings from "../../lib/settings";

export function useOfflineAvailability(bookmarkId: string) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { settings } = useAppSettings();
  const { toast } = useToast();
  const scope = getOfflineLibraryScope(settings);
  const isAvailableOffline = useIsAvailableOffline(scope, bookmarkId);
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    // The content-bearing response is a superset of the metadata-only one, so
    // this is the only bookmark the offline record needs.
    const contentOptions = api.bookmarks.getBookmark.queryOptions(
      {
        bookmarkId,
        includeContent: true,
      },
      // An explicit "save"/"update" must not be answered from a stale cache.
      { staleTime: 0 },
    );

    try {
      const bookmark = onlineManager.isOnline()
        ? await queryClient.fetchQuery(contentOptions)
        : queryClient.getQueryData(contentOptions.queryKey);

      if (!bookmark) {
        throw new Error("Connect to the internet to save this article.");
      }

      saveOfflineArticle(scope, {
        schemaVersion: OFFLINE_LIBRARY_SCHEMA_VERSION,
        bookmarkId,
        savedAt: Date.now(),
        bookmark,
      });
      toast({
        message: isAvailableOffline
          ? "Offline copy updated"
          : "Available offline",
        variant: "success",
      });
    } catch (error) {
      toast({
        message:
          error instanceof Error
            ? error.message
            : "Could not save this article for offline reading.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const confirmRemove = () => {
    Alert.alert(
      "Remove offline copy?",
      "The article may remain temporarily cached, but it will no longer be kept for offline reading.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            removeOfflineArticle(scope, bookmarkId);
            toast({ message: "Offline copy removed" });
          },
        },
      ],
    );
  };

  return {
    confirmRemove,
    isAvailableOffline,
    isSaving,
    save,
  };
}
