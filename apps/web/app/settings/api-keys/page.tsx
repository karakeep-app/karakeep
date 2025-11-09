import type { Metadata } from "next";
import ApiKeySettings from "@/components/settings/ApiKeySettings";

export const metadata: Metadata = {
  title: "API Keys | Karakeep",
};

export default async function ApiKeysPage() {
  return (
    <div className="rounded-md border bg-background p-4">
      <ApiKeySettings />
    </div>
  );
}
