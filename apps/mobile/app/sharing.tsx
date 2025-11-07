import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import useAppSettings from "@/lib/settings";
import { api } from "@/lib/trpc";
import { useUploadAsset } from "@/lib/upload";
import { z } from "zod";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

type Mode =
  | { type: "idle" }
  | { type: "success"; bookmarkId: string }
  | { type: "alreadyExists"; bookmarkId: string }
  | { type: "error" };

function SaveBookmark({ setMode }: { setMode: (mode: Mode) => void }) {
  const onSaved = (d: ZBookmark & { alreadyExists: boolean }) => {
    invalidateAllBookmarks();
    setMode({
      type: d.alreadyExists ? "alreadyExists" : "success",
      bookmarkId: d.id,
    });
  };

  const { hasShareIntent, shareIntent, resetShareIntent } =
    useShareIntentContext();
  const { settings, isLoading } = useAppSettings();
  const { uploadAsset } = useUploadAsset(settings, {
    onSuccess: onSaved,
    onError: () => {
      setMode({ type: "error" });
    },
  });

  const invalidateAllBookmarks =
    api.useUtils().bookmarks.getBookmarks.invalidate;

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (!isPending && shareIntent.webUrl) {
      mutate({
        type: BookmarkTypes.LINK,
        url: shareIntent.webUrl,
        source: "mobile",
      });
    } else if (!isPending && shareIntent?.text) {
      const val = z.string().url();
      if (val.safeParse(shareIntent.text).success) {
        // This is a URL, else treated as text
        mutate({
          type: BookmarkTypes.LINK,
          url: shareIntent.text,
          source: "mobile",
        });
      } else {
        mutate({
          type: BookmarkTypes.TEXT,
          text: shareIntent.text,
          source: "mobile",
        });
      }
    } else if (!isPending && shareIntent?.files) {
      uploadAsset({
        type: shareIntent.files[0].mimeType,
        name: shareIntent.files[0].fileName ?? "",
        uri: shareIntent.files[0].path,
      });
    }
    if (hasShareIntent) {
      resetShareIntent();
    }
  }, [isLoading]);

  const { mutate, isPending } = api.bookmarks.createBookmark.useMutation({
    onSuccess: onSaved,
    onError: () => {
      setMode({ type: "error" });
    },
  });

  return (
    <View className="flex flex-row gap-3">
      <Text variant="largeTitle">Hoarding</Text>
      <ActivityIndicator />
    </View>
  );
}

export default function Sharing() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ type: "idle" });

  const autoCloseTimeoutId = useRef<number | null>(null);

  let comp;
  switch (mode.type) {
    case "idle": {
      comp = <SaveBookmark setMode={setMode} />;
      break;
    }
    case "alreadyExists":
    case "success": {
      comp = (
        <View className="items-center gap-4">
          <Text variant="largeTitle">
            {mode.type === "alreadyExists" ? "Already Hoarded!" : "Hoarded!"}
          </Text>
          <Button
            onPress={() => {
              router.replace(`/dashboard/bookmarks/${mode.bookmarkId}/info`);
              if (autoCloseTimeoutId.current) {
                clearTimeout(autoCloseTimeoutId.current);
              }
            }}
          >
            <Text>Manage</Text>
          </Button>
          <Pressable onPress={() => router.replace("dashboard")}>
            <Text className="text-muted-foreground">Dismiss</Text>
          </Pressable>
        </View>
      );
      break;
    }
    case "error": {
      comp = <Text variant="largeTitle">Error!</Text>;
      break;
    }
  }

  // Auto dismiss the modal after saving.
  useEffect(() => {
    if (mode.type === "idle") {
      return;
    }

    autoCloseTimeoutId.current = setTimeout(() => {
      router.replace("dashboard");
    }, 2000);

    return () => clearTimeout(autoCloseTimeoutId.current!);
  }, [mode.type]);

  return (
    <View className="flex-1 items-center justify-center gap-4">{comp}</View>
  );
}
