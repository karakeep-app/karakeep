"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { List, Plus, Search, Settings, Star } from "lucide-react";

/**
 * The mobile shell's bottom tab bar — replaces the stock, inherited
 * `MobileSidebar` (a plain top-of-page icon strip) below the `sm` breakpoint.
 * Fixed to the viewport bottom so it behaves like a native app's tab bar
 * rather than scrolling away with the page.
 *
 * Four real destinations plus the centre capture action. The source design
 * drew five destinations (Search / Lists / + / Tags / Favourites) with a
 * capture-screen note that contradicted it — "Lists, tags and the grid view
 * collapse into one browse surface rather than three tabs" — so Tags folds
 * into Browse here, freeing the fifth slot for Settings, which the design
 * had no tab for at all.
 *
 * Colours come from the fork's runtime theme tokens (`--k-*`), not the
 * design's hardcoded hex — the source values happen to equal this fork's
 * *default* theme exactly (it was drawn against a running instance), but
 * the whole point of the runtime theme system is that accent and surface
 * tone are user choices, and the tab bar needs to follow them like every
 * other piece of chrome does.
 */
export function MobileTabBar({
  searchEnabled,
  onCapture,
}: {
  searchEnabled: boolean;
  onCapture: () => void;
}) {
  const pathname = usePathname();

  // Phase 1 (this component): Browse and Settings route to the closest
  // existing pages until their dedicated mobile screens land (browse in a
  // later phase; Settings already has a page, just not dense-styled below
  // `sm` yet). Search routes to the existing search page, or the queue if
  // no search backend is configured — search-as-home is a later phase too.
  const items: {
    key: string;
    href: string;
    label: string;
    icon: React.ReactNode;
    active: boolean;
  }[] = [
    {
      key: "search",
      href: searchEnabled ? "/dashboard/search" : "/dashboard/bookmarks",
      label: "search",
      icon: <Search size={21} strokeWidth={1.7} />,
      active: searchEnabled
        ? pathname.startsWith("/dashboard/search")
        : pathname === "/dashboard/bookmarks",
    },
    {
      key: "browse",
      href: "/dashboard/lists",
      label: "browse",
      icon: <List size={21} strokeWidth={1.7} />,
      active:
        pathname.startsWith("/dashboard/lists") ||
        pathname.startsWith("/dashboard/tags"),
    },
    {
      key: "favourites",
      href: "/dashboard/favourites",
      label: "favs",
      icon: <Star size={21} strokeWidth={1.7} />,
      active: pathname === "/dashboard/favourites",
    },
    {
      key: "settings",
      href: "/settings",
      label: "settings",
      icon: <Settings size={21} strokeWidth={1.7} />,
      active: pathname.startsWith("/settings"),
    },
  ];

  // Search / Browse / capture / Favourites / Settings — capture stays
  // dead-centre regardless of how the other four are labelled.
  const [first, second, ...rest] = items;

  return (
    <nav
      className="border-k-border bg-k-surface-2 fixed inset-x-0 bottom-0 z-30 flex items-center sm:hidden"
      style={{
        borderTopWidth: 1,
        padding: "8px 14px calc(6px + env(safe-area-inset-bottom))",
      }}
      aria-label="Primary"
    >
      <TabLink item={first} />
      <TabLink item={second} />
      <div className="flex flex-1 justify-center">
        <button
          type="button"
          aria-label="Add"
          onClick={onCapture}
          className="bg-k-accent text-k-accent-fg -mt-4 flex size-[46px] items-center justify-center rounded-[16px]"
        >
          <Plus size={24} strokeWidth={2.2} />
        </button>
      </div>
      {rest.map((item) => (
        <TabLink key={item.key} item={item} />
      ))}
    </nav>
  );
}

function TabLink({
  item,
}: {
  item: { href: string; label: string; icon: React.ReactNode; active: boolean };
}) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex flex-1 flex-col items-center gap-[3px]",
        item.active ? "text-k-accent" : "text-k-icon",
      )}
    >
      {item.icon}
      <span className="font-k-mono text-[9px]">{item.label}</span>
    </Link>
  );
}
