import { Alert, Linking, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { TailwindResolver } from "@/components/TailwindResolver";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/trpc";
import { ClipboardList, Globe, Info, Tag, Trash2 } from "lucide-react-native";

import { useDeleteBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import RemindMeButton from "./RemindMeButton";

interface BottomActionsProps {
  bookmark: ZBookmark;
}

export default function BottomActions({ bookmark }: BottomActionsProps) {
  const { toast } = useToast();
  const router = useRouter();

  // Fetch reminder data for this bookmark
  const { data: reminder } = api.reminders.getBookmarkReminder.useQuery({
    bookmarkId: bookmark.id,
  });

  // Helper function to determine reminder type
  const getReminderType = () => {
    if (!reminder) return null;

    const now = new Date();
    const remindAt = new Date(reminder.remindAt);

    if (reminder.status === "dismissed") {
      return "dismissed";
    }

    if (reminder.status === "active") {
      if (remindAt <= now) {
        return "due";
      } else {
        return "upcoming";
      }
    }

    return null;
  };

  const reminderType = getReminderType();

  const { mutate: deleteBookmark, isPending: isDeletionPending } =
    useDeleteBookmark({
      onSuccess: () => {
        router.back();
        toast({
          message: "The bookmark has been deleted!",
          showProgress: false,
        });
      },
      onError: () => {
        toast({
          message: "Something went wrong",
          variant: "destructive",
          showProgress: false,
        });
      },
    });

  const deleteBookmarkAlert = () =>
    Alert.alert(
      "Delete bookmark?",
      "Are you sure you want to delete this bookmark?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          onPress: () => deleteBookmark({ bookmarkId: bookmark.id }),
          style: "destructive",
        },
      ],
    );

  const actions = [
    {
      id: "remind",
      icon: <RemindMeButton bookmark={bookmark} />,
      shouldRender: reminderType !== "upcoming",
      onClick: () => undefined, // RemindMeButton handles its own onClick
      disabled: false,
    },
    {
      id: "lists",
      icon: (
        <TailwindResolver
          className="text-foreground"
          comp={(styles) => <ClipboardList color={styles?.color?.toString()} />}
        />
      ),
      shouldRender: true,
      onClick: () =>
        router.push(`/dashboard/bookmarks/${bookmark.id}/manage_lists`),
      disabled: false,
    },
    {
      id: "tags",
      icon: (
        <TailwindResolver
          className="text-foreground"
          comp={(styles) => <Tag color={styles?.color?.toString()} />}
        />
      ),
      shouldRender: true,
      onClick: () =>
        router.push(`/dashboard/bookmarks/${bookmark.id}/manage_tags`),
      disabled: false,
    },
    {
      id: "open",
      icon: (
        <TailwindResolver
          className="text-foreground"
          comp={(styles) => <Info color={styles?.color?.toString()} />}
        />
      ),
      shouldRender: true,
      onClick: () => router.push(`/dashboard/bookmarks/${bookmark.id}/info`),
      disabled: false,
    },
    {
      id: "delete",
      icon: (
        <TailwindResolver
          className="text-foreground"
          comp={(styles) => <Trash2 color={styles?.color?.toString()} />}
        />
      ),
      shouldRender: true,
      onClick: deleteBookmarkAlert,
      disabled: isDeletionPending,
    },
    {
      id: "browser",
      icon: (
        <TailwindResolver
          className="text-foreground"
          comp={(styles) => <Globe color={styles?.color?.toString()} />}
        />
      ),
      shouldRender: bookmark.content.type == BookmarkTypes.LINK,
      onClick: () =>
        bookmark.content.type == BookmarkTypes.LINK &&
        Linking.openURL(bookmark.content.url),
      disabled: false,
    },
  ];

  return (
    <View>
      <View className="flex flex-row items-center justify-between px-10 pb-2 pt-4">
        {actions.map(
          (a) =>
            a.shouldRender && (
              <Pressable
                disabled={a.disabled}
                key={a.id}
                onPress={a.onClick}
                className="py-auto"
              >
                {a.icon}
              </Pressable>
            ),
        )}
      </View>
    </View>
  );
}
