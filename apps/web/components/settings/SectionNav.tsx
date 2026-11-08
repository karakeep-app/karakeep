"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { haptic } from "@/lib/haptic";
import { ChevronLeft, ChevronRight, Home } from "lucide-react";

export interface SectionNavItem {
  name: string;
  icon: React.ReactElement;
  path: string;
}

export interface SectionNavGroup {
  /** Small heading above the group. Omitted when a section has a single group. */
  label?: string;
  items: SectionNavItem[];
}

const barLinkClass =
  "flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * The phone navigation bar of settings and admin. It's rendered with the page
 * content so it can stay stuck under the app header: back-to-app is always one
 * tap away, and subpages also get a way back to the index of the section.
 */
export function SectionMobileBar({
  indexPath,
  indexLabel,
  backToAppLabel,
}: {
  indexPath: string;
  indexLabel: string;
  backToAppLabel: string;
}) {
  const pathname = usePathname();
  const isIndex = pathname === indexPath;

  return (
    <nav
      aria-label={indexLabel}
      className="sticky top-16 z-40 -mx-4 -mt-4 mb-4 flex h-12 items-center justify-between border-b bg-panel px-1.5 sm:hidden"
    >
      {!isIndex && (
        <Link
          href={indexPath}
          onClick={haptic}
          className={`${barLinkClass} text-foreground hover:bg-accent/50`}
        >
          <ChevronLeft className="size-4" />
          {indexLabel}
        </Link>
      )}
      <Link
        href="/dashboard/bookmarks"
        onClick={haptic}
        className={`${barLinkClass} text-muted-foreground hover:bg-accent/50 hover:text-foreground`}
      >
        <Home className="size-4" />
        {backToAppLabel}
      </Link>
    </nav>
  );
}

/**
 * What `/settings` and `/admin` show on phones: every destination as a row of a
 * grouped list. Wider screens always have the sidebar, so they go straight to
 * the first page instead.
 */
export function SectionIndex({
  title,
  groups,
  desktopPath,
}: {
  title: string;
  groups: SectionNavGroup[];
  desktopPath: string;
}) {
  const router = useRouter();

  useEffect(() => {
    // Also on crossing the breakpoint, such as rotating a phone to landscape:
    // the index hides itself there and would leave an empty panel.
    const query = window.matchMedia("(min-width: 640px)");
    const goToDesktopPage = () => {
      if (query.matches) {
        router.replace(desktopPath);
      }
    };
    goToDesktopPage();
    query.addEventListener("change", goToDesktopPage);
    return () => query.removeEventListener("change", goToDesktopPage);
  }, [router, desktopPath]);

  return (
    <div className="space-y-5 sm:hidden">
      <PageHeader title={title} />
      {groups.map((group, index) => (
        <section key={group.label ?? index} className="space-y-2">
          {group.label && (
            <h2 className="px-1 text-xs font-medium text-muted-foreground">
              {group.label}
            </h2>
          )}
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {group.items.map((item) => (
              <li key={item.path}>
                <Link
                  href={item.path}
                  onClick={haptic}
                  className="flex min-h-12 items-center gap-3 px-3 text-sm outline-none transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
                >
                  <span className="flex text-muted-foreground [&>svg]:size-4">
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
