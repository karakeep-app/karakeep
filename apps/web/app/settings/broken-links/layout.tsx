import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Broken Links | Karakeep",
};

export default function BrokenLinksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
