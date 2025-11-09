import type { Metadata } from "next";
import BackgroundJobs from "@/components/admin/BackgroundJobs";

export const metadata: Metadata = {
  title: "Background Jobs | Karakeep",
};

export default function BackgroundJobsPage() {
  return <BackgroundJobs />;
}
