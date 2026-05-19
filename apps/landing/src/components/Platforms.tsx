import { Code2, Globe, Terminal, Webhook } from "lucide-react";

import appStoreBadge from "/app-store-badge.png?url";
import chromeExtensionBadge from "/chrome-extension-badge.png?url";
import firefoxAddonBadge from "/firefox-addon.png?url";
import playStoreBadge from "/google-play-badge.webp?url";
import safariIcon from "/safari-extension.png?url";

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
  {
    name: "Safari Extension",
    url: "https://apps.apple.com/gb/app/karakeep-app/id6479258022?platform=mac",
    badge: safariIcon,
  },
];

const extras = [
  { icon: Terminal, label: "CLI" },
  { icon: Code2, label: "REST API" },
  { icon: Webhook, label: "Webhooks" },
  { icon: Globe, label: "Web App" },
];

export default function Platforms() {
  return (
    <section className="bg-gray-50 px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Apps & Extensions for Seamless Access
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
            Access your bookmarks from anywhere with native apps and browser
            extensions.
          </p>
        </div>

        {/* Badges */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
          {platforms.map((platform) => (
            <a
              key={platform.name}
              href={platform.url}
              target="_blank"
              rel="noreferrer"
              className="transition-transform hover:scale-105"
            >
              <img
                src={platform.badge}
                alt={platform.name}
                className="h-14 w-auto rounded-lg"
                loading="lazy"
              />
            </a>
          ))}
        </div>

        {/* Extra integrations */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          {extras.map((extra) => (
            <div
              key={extra.label}
              className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700"
            >
              <extra.icon className="size-4 text-gray-500" />
              {extra.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
