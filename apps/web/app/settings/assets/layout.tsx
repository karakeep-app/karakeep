import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manage Assets | Karakeep",
};

export default function AssetsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
