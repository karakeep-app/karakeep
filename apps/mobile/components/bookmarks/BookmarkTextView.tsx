import { useState } from "react";
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  TextInput,
  View,
  Platform,
} from "react-native";
import { Stack } from "expo-router";
import BookmarkTextMarkdown from "@/components/bookmarks/BookmarkTextMarkdown";
import { HeaderTextButton } from "@/components/ui/SheetHeader";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useCommonActions, useTranslation } from "@/lib/i18n/hooks";
import { READABLE_CONTENT_MAX_WIDTH } from "@/lib/responsive";
import { useColorScheme } from "@/lib/useColorScheme";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

// Shared by the view and edit states, so the text doesn't move when you tap it.
const TEXT_PADDING = 20;
const TEXT_BOTTOM_PADDING = 120;

interface BookmarkTextViewProps {
  bookmark: ZBookmark;
}

export default function BookmarkTextView({ bookmark }: BookmarkTextViewProps) {
  if (bookmark.content.type !== BookmarkTypes.TEXT) {
    throw new Error("Wrong content type rendered");
  }
  const { toast } = useToast();
  const { t } = useTranslation();
  const actions = useCommonActions();
  const { colors } = useColorScheme();

  const [isEditing, setIsEditing] = useState(false);
  const initialText = bookmark.content.text;
  const [content, setContent] = useState(initialText);

  const { mutate, isPending } = useUpdateBookmark({
    onError: () => {
      toast({
        message: t("bookmarks.save_changes_failed"),
        variant: "destructive",
      });
    },
    onSuccess: () => {
      setIsEditing(false);
    },
  });

  const handleSave = () => {
    mutate({
      bookmarkId: bookmark.id,
      text: content,
    });
    Keyboard.dismiss();
  };

  const discard = () => {
    setContent(initialText);
    setIsEditing(false);
    Keyboard.dismiss();
  };

  const handleDiscard = () => {
    if (content === initialText) {
      discard();
      return;
    }
    Alert.alert(
      t("bookmarks.discard_changes_title"),
      t("bookmarks.discard_note_message"),
      [
        { text: t("bookmarks.keep_editing"), style: "cancel" },
        {
          text: t("bookmarks.discard"),
          style: "destructive",
          onPress: discard,
        },
      ],
    );
  };

  if (isEditing) {
    return (
      <View
        className="w-full flex-1 self-center"
        style={{ maxWidth: READABLE_CONTENT_MAX_WIDTH }}
      >
        <Stack.Screen
          options={{
            headerBackVisible: false,
            headerLeft: () => (
              <HeaderTextButton
                label={actions.cancel}
                onPress={handleDiscard}
                disabled={isPending}
              />
            ),
            headerRight: () => (
              <HeaderTextButton
                label={
                  isPending ? t("bookmarks.saving_ellipsis") : actions.save
                }
                onPress={handleSave}
                emphasized
                disabled={isPending}
              />
            ),
          }}
        />
        <TextInput
          value={content}
          onChangeText={setContent}
          multiline
          autoFocus
          editable={!isPending}
          placeholder={t("bookmarks.write_note_placeholder")}
          placeholderTextColor={colors.grey}
          selectionColor={Platform.OS === "ios" ? colors.primary : undefined}
          scrollEnabled
          style={{
            flex: 1,
            fontSize: 17,
            lineHeight: 24,
            color: colors.foreground,
            textAlignVertical: "top",
            padding: TEXT_PADDING,
            paddingTop: TEXT_PADDING,
          }}
        />
      </View>
    );
  }

  return (
    <View
      className="w-full flex-1 self-center"
      style={{ maxWidth: READABLE_CONTENT_MAX_WIDTH }}
    >
      <Stack.Screen
        options={{
          headerBackVisible: true,
          headerLeft: undefined,
          headerRight: () => (
            <HeaderTextButton
              label={actions.edit}
              onPress={() => setIsEditing(true)}
            />
          ),
        }}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          padding: TEXT_PADDING,
          paddingBottom: TEXT_BOTTOM_PADDING,
        }}
      >
        {bookmark.title?.trim() ? (
          <Text variant="title3" className="mb-3 font-semibold leading-7">
            {bookmark.title}
          </Text>
        ) : null}
        <Pressable
          accessibilityHint={t("bookmarks.edit_note_hint")}
          className="flex-1"
          onPress={() => setIsEditing(true)}
        >
          {content.trim() === "" ? (
            <Text color="tertiary">{t("bookmarks.tap_to_write_note")}</Text>
          ) : (
            <BookmarkTextMarkdown text={content} />
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}
