import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import "@karakeep/tailwind-config/globals.css";

import type { Viewport } from "next";
import React from "react";
import { Toaster } from "@/components/ui/toaster";
import Providers from "@/lib/providers";
import { getUserLocalSettings } from "@/lib/userLocalSettings/userLocalSettings";
import { getServerAuthSession } from "@/server/auth";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { clientConfig } from "@karakeep/shared/config";

const inter = Inter({
  subsets: ["latin"],
  fallback: ["sans-serif"],
});

export const metadata: Metadata = {
  title: "Karakeep",
  applicationName: "Karakeep",
  description:
    "The Bookmark Everything app. Hoard links, notes, and images and they will get automatically tagged AI.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Karakeep",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerAuthSession();
  const userSettings = await getUserLocalSettings();
  const isRTL = userSettings.lang === "ar";
  return (
    <html className="" lang={userSettings.lang} dir={isRTL ? "rtl" : "ltr"}>
      <body className={inter.className}>
        <NuqsAdapter>
          <Providers
            session={session}
            clientConfig={clientConfig}
            userLocalSettings={await getUserLocalSettings()}
          >
            {children}
            <ReactQueryDevtools initialIsOpen={false} />
          </Providers>
          <Toaster />
        </NuqsAdapter>
      </body>
    </html>
  );
}
