import { Cleanups } from "@/components/dashboard/cleanups/Cleanups";
import { api } from "@/server/api/client";

export default async function CleanupsPage() {
  const allTags = (await api.tags.list()).tags;

  return <Cleanups initialData={allTags} />;
}
