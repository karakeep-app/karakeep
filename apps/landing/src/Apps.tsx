import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Apple, Chrome, Download, Smartphone } from "lucide-react";

import { DEMO_LINK, GITHUB_LINK } from "./constants";
import NavBar from "./Navbar";
import appStoreBadge from "/app-store-badge.png?url";
import chromeExtensionBadge from "/chrome-extension-badge.png?url";
import firefoxAddonBadge from "/firefox-addon.png?url";
import playStoreBadge from "/google-play-badge.webp?url";

const mobileApps = [
  {
    name: "iOS",
    platform: "iPhone & iPad",
    url: "https://apps.apple.com/us/app/karakeep-app/id6479258022",
    badge: appStoreBadge,
    icon: Apple,
    description:
      "Download Karakeep for iOS and enjoy seamless bookmark syncing on your iPhone and iPad.",
  },
  {
    name: "Android",
    platform: "Android Devices",
    url: "https://play.google.com/store/apps/details?id=app.hoarder.hoardermobile&pcampaignid=web_share",
    badge: playStoreBadge,
    icon: Smartphone,
    description:
      "Get Karakeep on your Android device and access your bookmarks anywhere, anytime.",
  },
];

const browserExtensions = [
  {
    name: "Chrome",
    platform: "Chrome, Edge, Brave & More",
    url: "https://chromewebstore.google.com/detail/karakeep/kgcjekpmcjjogibpjebkhaanilehneje",
    badge: chromeExtensionBadge,
    icon: Chrome,
    description:
      "Install the Karakeep extension for Chrome and Chromium-based browsers to quickly save bookmarks from any webpage.",
  },
  {
    name: "Firefox",
    platform: "Firefox Browser",
    url: "https://addons.mozilla.org/en-US/firefox/addon/karakeep/",
    badge: firefoxAddonBadge,
    icon: Download,
    description:
      "Add Karakeep to Firefox and bookmark content with just one click from your browser.",
  },
];

const currentYear = new Date().getFullYear();

function Hero() {
  return (
    <div className="mt-10 flex flex-grow flex-col items-center justify-center gap-6 sm:mt-20">
      <div className="mt-4 w-full space-y-6 text-center">
        <h1 className="text-center text-3xl font-bold sm:text-6xl">
          Apps &{" "}
          <span className="bg-gradient-to-r from-purple-600 to-red-600 bg-clip-text text-transparent">
            Extensions
          </span>
        </h1>
        <div className="mx-auto w-full gap-2 text-base md:w-3/6">
          <p className="text-center text-gray-600">
            Access Karakeep from anywhere with our mobile apps and browser
            extensions. Save, organize, and retrieve your bookmarks seamlessly
            across all your devices.
          </p>
        </div>
      </div>
    </div>
  );
}

function MobileApps() {
  return (
    <div className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-semibold">Mobile Apps</h2>
          <p className="mt-2 text-gray-600">
            Take your bookmarks with you on the go
          </p>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {mobileApps.map((app) => (
            <div
              key={app.name}
              className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-gradient-to-br from-purple-500 to-red-500 p-3">
                  <app.icon className="size-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">{app.name}</h3>
                  <p className="text-sm text-gray-500">{app.platform}</p>
                </div>
              </div>
              <p className="mb-6 text-gray-600">{app.description}</p>
              <a
                href={app.url}
                target="_blank"
                rel="noreferrer"
                className="inline-block"
              >
                <img
                  className="h-12 w-auto rounded-md transition-transform hover:scale-105"
                  alt={`Download ${app.name}`}
                  src={app.badge}
                />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BrowserExtensions() {
  return (
    <div className="bg-gray-100 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-semibold">Browser Extensions</h2>
          <p className="mt-2 text-gray-600">
            Save bookmarks instantly from your browser
          </p>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {browserExtensions.map((extension) => (
            <div
              key={extension.name}
              className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-gradient-to-br from-purple-500 to-red-500 p-3">
                  <extension.icon className="size-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">{extension.name}</h3>
                  <p className="text-sm text-gray-500">{extension.platform}</p>
                </div>
              </div>
              <p className="mb-6 text-gray-600">{extension.description}</p>
              <a
                href={extension.url}
                target="_blank"
                rel="noreferrer"
                className="inline-block"
              >
                <img
                  className="h-12 w-auto rounded-md transition-transform hover:scale-105"
                  alt={`Install ${extension.name} extension`}
                  src={extension.badge}
                />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CallToAction() {
  return (
    <div className="py-20">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="text-3xl font-semibold">Ready to Get Started?</h2>
        <p className="mt-4 text-gray-600">
          Try Karakeep today and experience the power of AI-powered bookmark
          management across all your devices.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <a
            href={DEMO_LINK}
            target="_blank"
            className={cn(
              "text flex w-28 gap-2",
              buttonVariants({ variant: "default", size: "lg" }),
            )}
            rel="noreferrer"
          >
            Try Demo
          </a>
          <a
            href={GITHUB_LINK}
            target="_blank"
            className={cn(
              "flex gap-2",
              buttonVariants({ variant: "outline", size: "lg" }),
            )}
            rel="noreferrer"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div className="flex items-center justify-between bg-gray-100 px-10 py-6 text-sm">
      <div>
        © 2024-{currentYear}{" "}
        <a href="https://localhostlabs.co.uk" target="_blank" rel="noreferrer">
          Localhost Labs Ltd
        </a>
      </div>
      <div className="flex items-center gap-6">
        <a
          href="https://docs.karakeep.app"
          target="_blank"
          className="flex justify-center gap-2 text-center"
          rel="noreferrer"
        >
          Docs
        </a>
        <a
          href={GITHUB_LINK}
          target="_blank"
          className="flex justify-center gap-2 text-center"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>
    </div>
  );
}

export default function Apps() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="container flex flex-col pb-10">
        <NavBar />
        <Hero />
      </div>
      <MobileApps />
      <BrowserExtensions />
      <CallToAction />
      <Footer />
    </div>
  );
}
