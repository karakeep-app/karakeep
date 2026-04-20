import { DOCS_LINK, GITHUB_LINK } from "../constants";
import Logo from "/icons/karakeep-full.svg?url";

const currentYear = new Date().getFullYear();

const footerLinks = {
  Product: [
    { label: "Pricing", href: "/pricing", internal: true },
    { label: "Apps & Extensions", href: "/apps", internal: true },
    { label: "Try Demo", href: "https://try.karakeep.app" },
    { label: "Karakeep Cloud", href: "https://cloud.karakeep.app" },
  ],
  Resources: [
    { label: "Documentation", href: DOCS_LINK },
    { label: "GitHub", href: GITHUB_LINK },
    { label: "Self-hosting Guide", href: `${DOCS_LINK}/installation/docker` },
    { label: "API Reference", href: `${DOCS_LINK}/api/karakeep-api` },
  ],
  Legal: [
    { label: "Terms of Service", href: "/terms", internal: true },
    { label: "Privacy Policy", href: "/privacy", internal: true },
  ],
};

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white px-4 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <img src={Logo} alt="Karakeep" className="w-32" loading="lazy" />
            <p className="mt-3 text-sm text-gray-500">
              The Bookmark Everything App. Save, organize, and rediscover your
              content.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([heading, links]) => (
            <div key={heading}>
              <h3 className="mb-3 text-sm font-semibold text-gray-900">
                {heading}
              </h3>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      {...("internal" in link && link.internal
                        ? {}
                        : { target: "_blank", rel: "noreferrer" })}
                      className="text-sm text-gray-500 transition-colors hover:text-gray-900"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-gray-200 pt-6 text-center text-sm text-gray-500">
          &copy; 2024-{currentYear}{" "}
          <a
            href="https://localhostlabs.co.uk"
            target="_blank"
            rel="noreferrer"
            className="hover:text-gray-900"
          >
            Localhost Labs Ltd
          </a>
        </div>
      </div>
    </footer>
  );
}
