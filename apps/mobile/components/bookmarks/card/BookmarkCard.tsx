import { Text } from "@/components/ui/Text";
import useAppSettings from "@/lib/settings";
import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { createContext, useContext } from "react";
import { Pressable, View } from "react-native";

import { NotePreview } from "../NotePreview";

export interface BookmarkCardContext {
  bookmark: ZBookmark;
  title?: string;
  media?: React.ReactNode;
  compactMedia?: React.ReactNode;
  body?: React.ReactNode;
  compactBody?: React.ReactNode;
  footerExtras?: React.ReactNode;
  isOwner?: boolean;
  mediaOnPress?: () => void;
  bodyOnPress?: () => void;
  titleOnPress?: () => void;
}

const BookmarkCardContext = createContext<BookmarkCardContext | null>(null);

function NoteSection() {
  const { settings } = useAppSettings();
  const ctx = useContext(BookmarkCardContext);
  if (!ctx) {
    return null;
  }
  const { bookmark, isOwner } = ctx;

  const note = settings.showNotes ? bookmark.note?.trim() : undefined;

  return (
    note && (
      <NotePreview note={note} bookmarkId={bookmark.id} readOnly={!isOwner} />
    )
  );
}

function FooterExtras() {
  const ctx = useContext(BookmarkCardContext);
  if (!ctx) {
    return null;
  }
  const { footerExtras } = ctx;
  return footerExtras ?? <View />;
}

function PressableSlot({
  children,
  onPress,
}: {
  children: React.ReactNode;
  onPress?: () => void;
}) {
  if (!onPress) {
    return children;
  }

  return <Pressable onPress={onPress}>{children}</Pressable>;
}

function Media() {
  const ctx = useContext(BookmarkCardContext);
  if (!ctx) {
    return null;
  }
  if (!ctx.media) {
    return null;
  }

  const { media, mediaOnPress } = ctx;
  return <PressableSlot onPress={mediaOnPress}>{media}</PressableSlot>;
}

function CompactMedia() {
  const ctx = useContext(BookmarkCardContext);
  if (!ctx) {
    return null;
  }
  const media = ctx.compactMedia ?? ctx.media;
  if (!media) {
    return null;
  }

  return <PressableSlot onPress={ctx.mediaOnPress}>{media}</PressableSlot>;
}

function Body() {
  const ctx = useContext(BookmarkCardContext);
  if (!ctx) {
    return null;
  }
  if (!ctx.body) {
    return null;
  }

  const { body, bodyOnPress } = ctx;
  return <PressableSlot onPress={bodyOnPress}>{body}</PressableSlot>;
}

function CompactBody() {
  const ctx = useContext(BookmarkCardContext);
  if (!ctx) {
    return null;
  }
  const body = ctx.compactBody ?? ctx.body;
  if (!body) {
    return null;
  }

  return <PressableSlot onPress={ctx.bodyOnPress}>{body}</PressableSlot>;
}

function Title() {
  const ctx = useContext(BookmarkCardContext);
  if (!ctx) {
    return null;
  }
  if (!ctx.title) {
    return null;
  }

  const { title, titleOnPress } = ctx;

  return (
    <Text
      className="text-xl font-bold text-foreground"
      numberOfLines={2}
      onPress={titleOnPress}
    >
      {title}
    </Text>
  );
}

function Root({ children }: { children: React.ReactNode }) {
  return (
    <View
      className="overflow-hidden rounded-xl bg-card"
      style={{ borderCurve: "continuous" }}
    >
      {children}
    </View>
  );
}

const BookmarkCardContainer = {
  Provider: BookmarkCardContext.Provider,
  NoteSection,
  FooterExtras,
  Media,
  CompactMedia,
  Body,
  CompactBody,
  Title,
  Root,
};

export { BookmarkCardContainer };
