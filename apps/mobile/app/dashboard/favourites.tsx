import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";
import { useTranslation } from "@/lib/i18n/hooks";
import { Star } from "lucide-react-native";

export default function Favourites() {
  const { t } = useTranslation();
  return (
    <UpdatingBookmarkList
      query={{
        favourited: true,
      }}
      emptyState={{
        icon: Star,
        title: t("bookmarks.favourites_empty_title"),
        subtitle: t("bookmarks.favourites_empty_subtitle"),
      }}
    />
  );
}
