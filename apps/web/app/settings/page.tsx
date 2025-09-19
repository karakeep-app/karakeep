import { redirect } from "next/navigation";

export default function SettingsHomepage() {
  redirect("/settings/info");
  return null;
}
