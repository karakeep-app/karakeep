import type { Metadata } from "next";
import AISettings from "@/components/settings/AISettings";

export const metadata: Metadata = {
  title: "AI Settings | Karakeep",
};

export default function AISettingsPage() {
  return <AISettings />;
}
