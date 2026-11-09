import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Input } from "@/components/ui/Input";
import { SheetHeader, useDiscardGuard } from "@/components/ui/SheetHeader";
import { Text } from "@/components/ui/Text";
import { showOrganizeToast } from "@/components/ui/Toast";

import { useTranslation } from "@/lib/i18n/hooks";
import { useColorScheme } from "@/lib/useColorScheme";
import { Link as LinkIcon, NotepadText } from "lucide-react-native";

import { useCreateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

// People type links as "example.com/page" as often as with a scheme.
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i;

function parseHttpUrl(text: string) {
  try {
    const url = new URL(BARE_DOMAIN.test(text) ? `https://${text}` : text);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

const NoteEditorPage = () => {
  const dismiss = () => {
    router.back();
  };

  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const { colors } = useColorScheme();
  const { t } = useTranslation();

  const { mutate: createBookmark, isPending } = useCreateBookmark({
    onSuccess: (resp) => {
      showOrganizeToast(
        resp.alreadyExists
          ? t("bookmarks.already_saved")
          : t("bookmarks.saved_toast"),
        resp.id,
      );
      allowLeave();
      dismiss();
    },
    onError: (e) => {
      setError(
        e.data?.zodError
          ? t("bookmarks.save_invalid")
          : e.data?.code
            ? t("bookmarks.save_failed", { error: e.message })
            : t("bookmarks.save_unreachable"),
      );
    },
  });

  const trimmed = text.trim();
  const allowLeave = useDiscardGuard(!!trimmed);
  const parsedUrl = parseHttpUrl(trimmed);
  const isLink = parsedUrl !== null;

  const onSubmit = () => {
    if (!trimmed) {
      return;
    }
    if (parsedUrl) {
      createBookmark({
        type: BookmarkTypes.LINK,
        url: parsedUrl.toString(),
        source: "mobile",
      });
    } else {
      createBookmark({
        type: BookmarkTypes.TEXT,
        text: trimmed,
        source: "mobile",
      });
    }
  };

  const HintIcon = isLink ? LinkIcon : NotepadText;

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-2 px-4 pt-2"
    >
      <SheetHeader
        onCancel={dismiss}
        onSave={onSubmit}
        saveDisabled={!trimmed}
        isSaving={isPending}
      />
      <Input
        onChangeText={(value) => {
          setText(value);
          setError(undefined);
        }}
        multiline
        placeholder={t("bookmarks.new_placeholder")}
        autoFocus
        autoCapitalize="sentences"
        textAlignVertical="top"
      />
      {error ? (
        <Text variant="footnote" className="px-4 text-destructive">
          {error}
        </Text>
      ) : trimmed ? (
        <View className="flex-row items-center gap-1.5 px-4">
          <HintIcon size={13} color={colors.grey} />
          <Text variant="footnote" color="tertiary">
            {isLink
              ? t("bookmarks.saves_as_link")
              : t("bookmarks.saves_as_note")}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
};

export default NoteEditorPage;
