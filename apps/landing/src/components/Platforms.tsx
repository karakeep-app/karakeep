import { ArrowUpRight } from "lucide-react";

import { APP_STORE_LINK, PLAY_STORE_LINK } from "../constants";

import appleIcon from "/apple-icon.svg?url";
import chromeIcon from "/chrome-icon.svg?url";
import firefoxIcon from "/firefox-icon.svg?url";
import googlePlayIcon from "/google-play-icon.svg?url";
import safariIcon from "/safari-icon.svg?url";

const platforms = [
  {
    name: "iOS",
    url: APP_STORE_LINK,
    icon: appleIcon,
  },
  {
    name: "Android",
    url: PLAY_STORE_LINK,
    icon: googlePlayIcon,
  },
  {
    name: "Chrome",
    url: "https://chromewebstore.google.com/detail/karakeep/kgcjekpmcjjogibpjebkhaanilehneje",
    icon: chromeIcon,
  },
  {
    name: "Firefox",
    url: "https://addons.mozilla.org/en-US/firefox/addon/karakeep/",
    icon: firefoxIcon,
  },
  {
    name: "Safari",
    url: "https://apps.apple.com/gb/app/karakeep-app/id6479258022?platform=mac",
    icon: safariIcon,
  },
];

export default function Platforms() {
  return (
    <section className="border-y border-neutral-100 bg-white px-4 py-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm">
        <p className="w-full text-center text-neutral-500 sm:w-auto">
          Save here. Read anywhere.
        </p>
        {platforms.map((platform) => (
          <a
            key={platform.name}
            href={platform.url}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-2 text-neutral-600 transition-colors hover:text-neutral-900"
          >
            <img
              src={platform.icon}
              alt=""
              className="size-4 opacity-60 grayscale transition group-hover:opacity-100 group-hover:grayscale-0"
              loading="lazy"
            />
            {platform.name}
          </a>
        ))}
        <a
          href="/apps/"
          className="flex items-center gap-1 font-medium text-neutral-900 transition-colors hover:text-neutral-600"
        >
          All apps
          <ArrowUpRight className="size-3.5" />
        </a>
      </div>
    </section>
  );
}
