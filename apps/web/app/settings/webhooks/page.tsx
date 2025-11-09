import type { Metadata } from "next";
import WebhookSettings from "@/components/settings/WebhookSettings";

export const metadata: Metadata = {
  title: "Webhooks | Karakeep",
};

export default function WebhookSettingsPage() {
  return <WebhookSettings />;
}
