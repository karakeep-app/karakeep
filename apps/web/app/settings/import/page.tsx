import type { Metadata } from "next";
import ImportExport from "@/components/settings/ImportExport";

export const metadata: Metadata = {
  title: "Import | Karakeep",
};

export default function ImportSettingsPage() {
  return <ImportExport />;
}
