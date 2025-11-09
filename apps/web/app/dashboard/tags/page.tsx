import type { Metadata } from "next";
import AllTagsView from "@/components/dashboard/tags/AllTagsView";

export const metadata: Metadata = {
  title: "All Tags | Karakeep",
};

export default async function TagsPage() {
  return <AllTagsView />;
}
