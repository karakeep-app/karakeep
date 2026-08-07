"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ProfileOptions from "@/components/dashboard/header/ProfileOptions";
import { cn } from "@/lib/utils";
import {
  Archive,
  Hash,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Star,
  Upload,
} from "lucide-react";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import type { ZGetTagResponse } from "@karakeep/shared/types/tags";
import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";

import { QuickAddDialog } from "./QuickAddDialog";

const SIDEBAR_COLLAPSED_KEY = "k-dense-sidebar-collapsed";
// Prototype list dots: accent, then blue, then violet.
const LIST_DOT_COLORS = ["var(--k-accent)", "#8ab4f8", "#d3a8f0"];

function useSidebarCollapsed() {
  // Default to expanded on the server render; sync with the persisted
  // choice right after mount so we don't need access to localStorage
  // during SSR.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored !== null) {
      setCollapsed(stored === "1");
    }
  }, []);
  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };
  return { collapsed, toggle };
}

function NavRow({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "flex items-center gap-[9px] rounded-[6px] px-2 py-[5px] transition-colors",
          active
            ? "bg-k-border-soft text-k-fg [&_svg]:text-k-accent font-medium"
            : "text-k-fg-muted hover:bg-k-border-soft/60 [&_svg]:text-k-icon",
        )}
      >
        {icon}
        {label}
      </Link>
    </li>
  );
}

function RailIcon({
  href,
  icon,
  label,
  tone = "dim",
  onClick,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  tone?: "dim" | "accent";
  onClick?: () => void;
}) {
  const cls = cn(
    "flex items-center justify-center",
    tone === "accent" ? "text-k-accent" : "text-k-icon hover:text-k-fg-muted",
  );
  if (onClick) {
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={onClick}
        className={cls}
      >
        {icon}
      </button>
    );
  }
  return (
    <Link href={href!} title={label} aria-label={label} className={cls}>
      {icon}
    </Link>
  );
}

export default function DenseSidebar({
  searchEnabled,
  initialLists,
  initialTags,
  serverVersion,
}: {
  searchEnabled: boolean;
  initialLists: ZBookmarkList[];
  initialTags: ZGetTagResponse[];
  serverVersion?: string;
}) {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarCollapsed();
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const { data: listsData } = useBookmarkLists(undefined, {
    initialData: { lists: initialLists },
    // The server-rendered payload can be served from Next's RSC cache, so
    // without this the app's global 60s staleTime would leave a freshly
    // created list missing from the sidebar for up to a minute.
    staleTime: 0,
    refetchOnMount: "always",
  });
  const topLevelLists = useMemo(
    () =>
      (listsData?.data ?? initialLists).filter(
        (l) => !l.parentId && l.userRole === "owner",
      ),
    [listsData, initialLists],
  );

  const navItems = [
    {
      href: "/dashboard/bookmarks",
      label: "Files",
      icon: <Inbox size={15} strokeWidth={1.75} />,
    },
    ...(searchEnabled
      ? [
          {
            href: "/dashboard/search",
            label: "Search",
            icon: <Search size={15} strokeWidth={1.75} />,
          },
        ]
      : []),
    {
      href: "/dashboard/favourites",
      label: "Favourites",
      icon: <Star size={15} strokeWidth={1.75} />,
    },
    {
      href: "/dashboard/archive",
      label: "Archive",
      icon: <Archive size={15} strokeWidth={1.75} />,
    },
  ];

  if (collapsed) {
    return (
      <aside className="border-k-border bg-k-surface-2 flex w-[40px] flex-none flex-col items-center gap-[18px] border-r py-[14px]">
        <Link
          href="/dashboard/bookmarks"
          className="text-k-fg flex items-center justify-center"
          aria-label="Karakeep"
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-[19px]">
            <path
              d="M4 3h16v18l-8-5-8 5V3Z"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <button
          type="button"
          aria-label="Show sidebar"
          aria-expanded={false}
          onClick={toggle}
          className="text-k-icon hover:text-k-fg-muted flex items-center justify-center"
        >
          <PanelLeftOpen size={17} strokeWidth={1.75} />
        </button>
        <nav className="flex flex-col items-center gap-[15px]">
          {navItems.map((item) => (
            <RailIcon
              key={item.href}
              href={item.href}
              icon={<span className="[&_svg]:size-[18px]">{item.icon}</span>}
              label={item.label}
              tone={pathname === item.href ? "accent" : "dim"}
            />
          ))}
          <RailIcon
            href="/dashboard/tags"
            icon={<Hash size={18} strokeWidth={1.75} />}
            label="Tags"
            tone={pathname.startsWith("/dashboard/tags") ? "accent" : "dim"}
          />
          <RailIcon
            icon={<Upload size={18} strokeWidth={1.75} />}
            label="Add"
            tone="accent"
            onClick={() => setQuickAddOpen(true)}
          />
        </nav>
        <div className="mt-auto flex flex-col items-center gap-[14px]">
          <Link
            href="/settings"
            aria-label="Settings"
            className="text-k-fg-dim hover:text-k-fg-muted flex size-[17px] items-center justify-center"
          >
            <Settings size={17} strokeWidth={1.75} />
          </Link>
          <div className="text-k-fg-dim hover:text-k-fg-muted flex size-[17px] items-center justify-center">
            <ProfileOptions iconOnly />
          </div>
          <span className="font-k-mono text-k-version-rail text-[8.5px]">
            {serverVersion ?? ""}
          </span>
        </div>
        <QuickAddDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} />
      </aside>
    );
  }

  return (
    <aside className="border-k-border bg-k-surface-2 flex w-[153px] flex-none flex-col gap-4 border-r p-[14px_10px]">
      {/* Brand row — wordmark + collapse toggle only. */}
      <div className="flex items-center gap-1 px-[6px]">
        <Link
          href="/dashboard/bookmarks"
          className="text-k-fg text-[20px] font-semibold tracking-[-0.01em]"
        >
          Karakeep
        </Link>
        <button
          type="button"
          aria-label="Hide sidebar"
          aria-expanded={true}
          onClick={toggle}
          className="text-k-icon hover:text-k-fg-muted ml-auto flex items-center justify-center"
        >
          <PanelLeftClose size={21} strokeWidth={1.75} />
        </button>
      </div>

      {/* Primary nav */}
      <ul className="flex flex-col gap-px text-[12.5px]">
        {navItems.map((item) => (
          <NavRow
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            active={pathname === item.href}
          />
        ))}
      </ul>

      {/* Lists */}
      {topLevelLists.length > 0 && (
        <div className="flex flex-col gap-px text-[12.5px]">
          <p className="font-k-mono text-k-fg-dim px-2 pb-[5px] text-[10px] font-medium uppercase tracking-[0.08em]">
            Lists
          </p>
          <ul className="flex flex-col gap-px">
            {topLevelLists.slice(0, 6).map((list, i) => {
              const href = `/dashboard/lists/${list.id}`;
              const active = pathname === href;
              return (
                <li key={list.id}>
                  <Link
                    href={href}
                    className={cn(
                      "flex items-center gap-[9px] rounded-[6px] px-2 py-[5px] transition-colors",
                      active
                        ? "bg-k-border-soft text-k-fg font-medium"
                        : "text-k-fg-muted hover:bg-k-border-soft/60",
                    )}
                  >
                    <span
                      className="size-[5px] flex-none rounded-full"
                      style={{
                        background: LIST_DOT_COLORS[i % LIST_DOT_COLORS.length],
                      }}
                    />
                    <span className="truncate">{list.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Tags */}
      {initialTags.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-k-mono text-k-fg-dim px-2 text-[10.5px] font-medium uppercase tracking-[0.08em]">
            Tags
          </p>
          <div className="flex flex-wrap gap-[5px] px-2">
            {initialTags.slice(0, 8).map((tag) => (
              <Link
                key={tag.id}
                href={`/dashboard/tags/${tag.id}`}
                className="border-k-border text-k-fg-muted hover:border-k-accent-border hover:text-k-fg rounded-full border px-[7px] py-[2px] text-[11px]"
              >
                {tag.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-k-border mt-auto flex items-center gap-3 border-t pt-[10px]">
        <Link
          href="/settings"
          aria-label="Settings"
          className="text-k-fg-dim hover:text-k-fg-muted flex size-4 items-center justify-center"
        >
          <Settings size={16} strokeWidth={1.75} />
        </Link>
        <div className="text-k-fg-dim hover:text-k-fg-muted flex size-4 items-center justify-center">
          <ProfileOptions iconOnly />
        </div>
        <span className="font-k-mono text-k-version ml-auto text-[9.5px]">
          {serverVersion ?? ""}
        </span>
      </div>
      <QuickAddDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </aside>
  );
}
