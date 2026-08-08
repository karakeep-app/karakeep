"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ProfileOptions from "@/components/dashboard/header/ProfileOptions";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

import type { TSidebarItem } from "@/components/shared/sidebar/TSidebarItem";

/**
 * Settings' own sidebar, styled like DenseSidebar's expanded state — same
 * width, wordmark, nav-row shape, footer — but for the settings nav list
 * rather than dashboard filters, and without the rail/collapse state
 * (twelve settings sections don't compress into a useful icon-only rail the
 * way four dashboard filters do).
 *
 * `items` is already the exact list settings/layout.tsx builds for the
 * pre-fork Sidebar component — this just renders it in the fork's own
 * visual language instead of building a second, parallel nav-item list.
 */
export default function DenseSettingsSidebar({
  items,
  serverVersion,
}: {
  items: TSidebarItem[];
  serverVersion?: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="border-k-border bg-k-surface-2 flex h-full w-[190px] flex-none flex-col border-r p-[14px_10px]">
      <div className="flex flex-none items-center gap-1 px-[6px] pb-4">
        <Link
          href="/dashboard/bookmarks"
          className="text-k-fg text-[20px] font-semibold tracking-[-0.01em]"
        >
          Keepsake
        </Link>
      </div>

      <nav className="sidebar-scrollbar min-h-0 flex-1 overflow-y-auto">
        <ul className="flex flex-col gap-px text-[12.5px]">
          {items.map((item) => {
            const active = pathname === item.path;
            const isBack = item.path === "/dashboard/bookmarks";
            return (
              <li key={item.path}>
                <Link
                  href={item.path}
                  className={cn(
                    "flex items-center gap-[9px] rounded-[6px] px-2 py-[5px] transition-colors",
                    active
                      ? "bg-k-border-soft text-k-fg [&_svg]:text-k-accent font-medium"
                      : "text-k-fg-muted hover:bg-k-border-soft/60 [&_svg]:text-k-icon",
                    // The back-to-app row is navigation out of settings
                    // entirely, not one more settings section — set off
                    // with a divider so it doesn't read as part of the list.
                    isBack && "border-k-border mb-2 border-b pb-[9px]",
                  )}
                >
                  {isBack ? (
                    <ArrowLeft size={15} strokeWidth={1.75} />
                  ) : (
                    item.icon
                  )}
                  <span className="truncate">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-k-border mt-4 flex flex-none items-center gap-3 border-t pt-[10px]">
        <div className="text-k-fg-dim hover:text-k-fg-muted flex size-4 items-center justify-center">
          <ProfileOptions iconOnly dense />
        </div>
        <span className="font-k-mono text-k-version ml-auto text-[9.5px]">
          {serverVersion ?? "dev"}
        </span>
      </div>
    </aside>
  );
}
