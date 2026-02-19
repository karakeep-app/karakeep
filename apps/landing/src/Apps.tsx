import NavBar from "./Navbar";
import appStoreBadge from "/app-store-badge.png?url";
import chromeExtensionBadge from "/chrome-extension-badge.png?url";
import firefoxAddonBadge from "/firefox-addon.png?url";
import playStoreBadge from "/google-play-badge.webp?url";

interface Listing {
  name: string;
  description: string;
  url: string;
  badge: string;
}

const mobileApps: Listing[] = [
  {
    name: "iOS App",
    description: "Save links and notes from your iPhone and iPad.",
    url: "https://apps.apple.com/us/app/karakeep-app/id6479258022",
    badge: appStoreBadge,
  },
  {
    name: "Android App",
    description: "Capture and organize content on Android devices.",
    url: "https://play.google.com/store/apps/details?id=app.hoarder.hoardermobile&pcampaignid=web_share",
    badge: playStoreBadge,
  },
];

const browserExtensions: Listing[] = [
  {
    name: "Chrome Extension",
    description: "One-click saving from Chrome.",
    url: "https://chromewebstore.google.com/detail/karakeep/kgcjekpmcjjogibpjebkhaanilehneje",
    badge: chromeExtensionBadge,
  },
  {
    name: "Firefox Add-on",
    description: "Save pages directly from Firefox.",
    url: "https://addons.mozilla.org/en-US/firefox/addon/karakeep/",
    badge: firefoxAddonBadge,
  },
];

function ListingSection({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: Listing[];
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 text-gray-600">{description}</p>
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {items.map((item) => (
          <a
            key={item.name}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col gap-4 rounded-xl border border-gray-200 p-4 transition-colors hover:border-gray-300"
          >
            <div>
              <h3 className="font-semibold text-gray-900">{item.name}</h3>
              <p className="mt-1 text-sm text-gray-600">{item.description}</p>
            </div>
            <div className="h-12 w-fit">
              <img
                className="h-full w-auto object-contain"
                alt={item.name}
                src={item.badge}
              />
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

export default function Apps() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto pb-16">
        <NavBar />
        <main className="px-4 py-8 sm:px-6 sm:py-14">
          <h1 className="text-4xl font-bold text-gray-900 sm:text-5xl">
            Apps & Extensions
          </h1>
          <p className="mt-3 max-w-2xl text-base text-gray-600 sm:text-lg">
            Use Karakeep anywhere with our mobile apps and browser extensions.
          </p>
          <div className="mt-10 space-y-6">
            <ListingSection
              title="Mobile Apps"
              description="Take your bookmarks with you on iOS and Android."
              items={mobileApps}
            />
            <ListingSection
              title="Browser Extensions"
              description="Save content from your browser in one click."
              items={browserExtensions}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
