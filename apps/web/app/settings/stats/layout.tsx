import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Statistics | Karakeep",
};

export default function StatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
