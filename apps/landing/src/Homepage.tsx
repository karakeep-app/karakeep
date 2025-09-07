import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowDownNarrowWide,
  Bookmark,
  BrainCircuit,
  CheckCheck,
  Github,
  Server,
  SunMoon,
  TextSearch,
  WalletCards,
} from "lucide-react";

import { DEMO_LINK, DOCS_LINK, GITHUB_LINK } from "./constants";
import NavBar from "./Navbar";
import appStoreBadge from "/app-store-badge.png?url";
import chromeExtensionBadge from "/chrome-extension-badge.png?url";
import firefoxAddonBadge from "/firefox-addon.png?url";
import playStoreBadge from "/google-play-badge.webp?url";
import screenshot from "/hero.webp?url";

const platforms = [
  {
    name: "iOS",
    url: "https://apps.apple.com/us/app/karakeep-app/id6479258022",
    badge: appStoreBadge,
  },
  {
    name: "Android",
    url: "https://play.google.com/store/apps/details?id=app.hoarder.hoardermobile&pcampaignid=web_share",
    badge: playStoreBadge,
  },
  {
    name: "Chrome Extension",
    url: "https://chromewebstore.google.com/detail/karakeep/kgcjekpmcjjogibpjebkhaanilehneje",
    badge: chromeExtensionBadge,
  },
  {
    name: "Firefox Addon",
    url: "https://addons.mozilla.org/en-US/firefox/addon/karakeep/",
    badge: firefoxAddonBadge,
  },
];

const featuresList = [
  {
    icon: Bookmark,
    title: "Bookmark",
    description: "Bookmark links, take simple notes and store images and pdfs.",
  },
  {
    icon: BrainCircuit,
    title: "AI Tagging",
    description:
      "Automatically tags your bookmarks using AI for faster retrieval.",
  },
  {
    icon: ArrowDownNarrowWide,
    title: "Auto Fetch",
    description:
      "Automatically fetches title, description and images for links.",
  },
  {
    icon: WalletCards,
    title: "Lists",
    description: "Sort your bookmarks into lists for better organization.",
  },
  {
    icon: TextSearch,
    title: "Search",
    description: "Search through all your bookmarks using full text search.",
  },
  {
    icon: Server,
    title: "Self Hosting",
    description: "Easy self hosting with docker for privacy and control.",
  },
  {
    icon: CheckCheck,
    title: "Bulk Actions",
    description: "Quickly manage your bookmarks with bulk actions.",
  },
  {
    icon: SunMoon,
    title: "Dark Mode",
    description: "Karakeep supports dark mode for better reading experience.",
  },
];

const currentYear = new Date().getFullYear();

function Hero() {
  return (
    <div className="mt-10 flex flex-grow flex-col items-center justify-center gap-6 sm:mt-20">
      <div className="mt-4 w-full space-y-6 text-center">
        <h1 className="text-center text-3xl font-bold sm:text-6xl">
          The{" "}
          <span className="bg-gradient-to-r from-purple-600 to-red-600 bg-clip-text text-transparent">
            Bookmark Everything
          </span>{" "}
          App
        </h1>
        <div className="mx-auto w-full gap-2 text-base md:w-3/6">
          <p className="text-center text-gray-600">
            Quickly save links, notes, and images and karakeep will
            automatically tag them for you using AI for faster retrieval. Built
            for the data hoarders out there!
          </p>
        </div>
      </div>
      <div className="flex h-10 gap-4">
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
          <Github /> GitHub
        </a>
      </div>
    </div>
  );
}

function Platforms() {
  return (
    <div className="bg-gray-100 py-20">
      <h2 className="text-center text-3xl font-semibold">
        Apps & Extensions for Seamless Access
      </h2>
      <p className="mt-2 text-center text-gray-600">
        Enjoy seamless access with our mobile apps and browser extensions.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-6 px-6">
        {platforms.map((platform) => (
          <div key={platform.name}>
            <a
              href={platform.url}
              target="_blank"
              className="flex items-center justify-center gap-2"
              rel="noreferrer"
            >
              <img
                className="h-12 w-auto rounded-md"
                alt={platform.name}
                src={platform.badge}
              />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function Features() {
  return (
    <div className="mx-auto block px-10 py-20 sm:w-4/5 sm:px-0">
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-4 sm:gap-14">
        {featuresList.map((feature) => (
          <div key={feature.title} className="flex flex-col gap-1 sm:gap-2">
            <div className="flex gap-2">
              <feature.icon size={20} />
              <h3 className="text-md font-semibold text-gray-800">
                {feature.title}
              </h3>
            </div>
            <p className="text-gray-600">{feature.description}</p>
          </div>
        ))}
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
          href={DOCS_LINK}
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

function Screenshots() {
  return (
    <div className="mx-auto mt-6 w-10/12">
      <img alt="screenshot" src={screenshot} />
    </div>
  );
}

export default function Homepage() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="container flex flex-col pb-10">
        <NavBar />
        <Hero />
      </div>
      <Screenshots />
      <Features />
      <Platforms />
      <Footer />
    </div>
  );
}
