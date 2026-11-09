import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";
import { useTranslation } from "@/lib/i18n/hooks";
import { Archive as ArchiveIcon } from "lucide-react-native";

export default function Archive() {
  const { t } = useTranslation();
  return (
    <UpdatingBookmarkList
      query={{ archived: true }}
      emptyState={{
        icon: ArchiveIcon,
        title: t("bookmarks.archive_empty_title"),
        subtitle: t("bookmarks.archive_empty_subtitle"),
      }}
    />
  );
}
