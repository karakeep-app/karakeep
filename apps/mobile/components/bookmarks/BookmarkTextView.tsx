import { useState } from "react";
import {
  Keyboard,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import BookmarkTextMarkdown from "@/components/bookmarks/BookmarkTextMarkdown";
import { Button } from "@/components/ui/Button";
import ScrollIndicator from "@/components/ui/ScrollIndicator";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useColorScheme } from "nativewind";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

interface BookmarkTextViewProps {
  bookmark: ZBookmark;
}

export default function BookmarkTextView({ bookmark }: BookmarkTextViewProps) {
  if (bookmark.content.type !== BookmarkTypes.TEXT) {
    throw new Error("Wrong content type rendered");
  }
  const { toast } = useToast();
  const { colorScheme } = useColorScheme();

  const [isEditing, setIsEditing] = useState(false);
  const initialText = bookmark.content.text;
  const [content, setContent] = useState(initialText);

  // Scroll indicator state
  const [scrollY, setScrollY] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollY(event.nativeEvent.contentOffset.y);
  };

  const { mutate, isPending } = useUpdateBookmark({
    onError: () => {
      toast({
        message: "Something went wrong",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      setIsEditing(false);
      toast({
        message: "Text updated successfully",
        showProgress: false,
      });
    },
  });

  const handleSave = () => {
    mutate({
      bookmarkId: bookmark.id,
      text: content,
    });
  };

  const handleDiscard = () => {
    setContent(initialText);
    setIsEditing(false);
    Keyboard.dismiss();
  };

  if (isEditing) {
    return (
      <View className="flex-1 p-4">
        <View className="flex-row justify-end gap-2 px-4 py-2">
          <Button
            size="sm"
            onPress={handleDiscard}
            disabled={isPending}
            variant="plain"
          >
            <Text>Cancel</Text>
          </Button>
          <Button size="sm" onPress={handleSave} disabled={isPending}>
            <Text>{isPending ? "Saving..." : "Save"}</Text>
          </Button>
        </View>

        <TextInput
          value={content}
          onChangeText={setContent}
          multiline
          autoFocus
          editable={!isPending}
          placeholder="Enter your text here..."
          placeholderTextColor={colorScheme === "dark" ? "#666" : "#999"}
          style={{
            flex: 1,
            fontSize: 16,
            lineHeight: 24,
            color: colorScheme === "dark" ? "#fff" : "#000",
            textAlignVertical: "top",
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colorScheme === "dark" ? "#333" : "#ddd",
            backgroundColor: colorScheme === "dark" ? "#111" : "#fff",
          }}
        />
      </View>
    );
  }

  return (
    <View
      className="m-4 flex-1 rounded-lg border border-border bg-card p-2"
      onLayout={(event) => {
        setContainerHeight(event.nativeEvent.layout.height);
      }}
    >
      <ScrollView
        className="flex-1"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={(width, height) => {
          setContentHeight(height);
        }}
      >
        <Pressable onPress={() => setIsEditing(true)}>
          <View className="min-h-[200px] rounded-xl p-4">
            <BookmarkTextMarkdown text={content} />
            {content.trim() === "" && (
              <Text className="italic text-muted-foreground">
                Tap to add text...
              </Text>
            )}
          </View>
        </Pressable>
      </ScrollView>
      <ScrollIndicator
        scrollY={scrollY}
        contentHeight={contentHeight}
        containerHeight={containerHeight}
      />
    </View>
  );
}
