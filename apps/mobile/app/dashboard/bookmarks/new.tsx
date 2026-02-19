import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";

import { useCreateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

const NoteEditorPage = () => {
  const dismiss = () => {
    router.back();
  };

  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const { toast } = useToast();

  const { mutate: createBookmark, isPending } = useCreateBookmark({
    onSuccess: (resp) => {
      if (resp.alreadyExists) {
        toast({
          message: "Bookmark already exists",
        });
      }
      setText("");
      dismiss();
    },
    onError: (e) => {
      let message;
      if (e.data?.zodError) {
        const zodError = e.data.zodError;
        message = JSON.stringify(zodError);
      } else {
        message = `Something went wrong: ${e.message}`;
      }
      setError(message);
    },
  });

  const onSubmit = () => {
    const data = text.trim();
    try {
      const url = new URL(data);
      if (url.protocol != "http:" && url.protocol != "https:") {
        throw new Error(`Unsupported URL protocol: ${url.protocol}`);
      }
      createBookmark({ type: BookmarkTypes.LINK, url: data, source: "mobile" });
    } catch {
      createBookmark({
        type: BookmarkTypes.TEXT,
        text: data,
        source: "mobile",
      });
    }
  };

  return (
    <View className="flex-1 gap-2 px-4 pt-4">
      {error && (
        <Text className="w-full text-center text-red-500">{error}</Text>
      )}
      <Input
        onChangeText={setText}
        className="bg-card"
        multiline
        placeholder="What's on your mind?"
        autoFocus
        autoCapitalize={"none"}
        textAlignVertical="top"
      />
      <Button onPress={onSubmit} disabled={isPending}>
        <Text>Save</Text>
      </Button>
    </View>
  );
};

export default NoteEditorPage;
