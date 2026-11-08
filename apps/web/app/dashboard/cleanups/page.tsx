import { redirect } from "next/navigation";

// Cleanups moved next to Broken Links in settings. This keeps existing links
// and bookmarks to the old path working.
export default function Cleanups() {
  redirect("/settings/cleanups");
}
