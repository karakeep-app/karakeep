import { useState } from "react";
import { Alert } from "react-native";
import { onlineManager, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

import { useCommonActions, useTranslation } from "@/lib/i18n/hooks";
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
  const { t } = useTranslation();
  const actions = useCommonActions();
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
        throw new Error(t("bookmark_actions.offline_requires_connection"));
      }

      saveOfflineArticle(scope, {
        schemaVersion: OFFLINE_LIBRARY_SCHEMA_VERSION,
        bookmarkId,
        savedAt: Date.now(),
        bookmark,
      });
      toast({
        message: isAvailableOffline
          ? t("bookmark_actions.offline_saved_updated")
          : t("bookmark_actions.offline_saved_new"),
        variant: "success",
      });
    } catch (error) {
      toast({
        message:
          error instanceof Error
            ? error.message
            : t("bookmark_actions.offline_save_failed"),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const confirmRemove = () => {
    Alert.alert(
      t("bookmark_actions.offline_remove_title"),
      t("bookmark_actions.offline_remove_message"),
      [
        { text: actions.cancel, style: "cancel" },
        {
          text: actions.remove,
          style: "destructive",
          onPress: () => {
            removeOfflineArticle(scope, bookmarkId);
            toast({ message: t("bookmark_actions.offline_removed") });
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
