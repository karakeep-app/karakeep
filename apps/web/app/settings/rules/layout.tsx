import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rules | Karakeep",
};

export default function RulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
