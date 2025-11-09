import type { Metadata } from "next";
import FeedSettings from "@/components/settings/FeedSettings";

export const metadata: Metadata = {
  title: "Feed Settings | Karakeep",
};

export default function FeedSettingsPage() {
  return <FeedSettings />;
}
