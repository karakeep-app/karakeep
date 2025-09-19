import AllTagsView from "@/components/dashboard/tags/AllTagsView";
import { api } from "@/server/api/client";

export default async function TagsPage() {
  const allTags = (await api.tags.list()).tags;

  return <AllTagsView initialData={allTags} />;
}
