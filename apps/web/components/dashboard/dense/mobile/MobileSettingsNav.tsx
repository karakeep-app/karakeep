"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

import type { TSidebarItem } from "@/components/shared/sidebar/TSidebarItem";

/**
 * Replaces the stock `MobileSidebar` (a bare icon strip, no labels) as the
 * way to move between settings pages below `sm` — the other half of the
 * "Settings tab exits the mobile shell" gap the tab bar's doc comment
 * flagged: this restyles the existing settings nav dense, and
 * `MobileShell` (mounted in the settings layout right alongside this) puts
 * the bottom tab bar back so leaving a settings page doesn't mean leaving
 * the app's mobile chrome entirely.
 *
 * A horizontally-scrolling pill row rather than the design's vertical
 * toggle-row list from screen 2e: that list was four made-up preferences
 * (Watch clipboard for links has no browser API a web app can use in the
 * background; Swipe actions and a dense/roomy Density mode were never
 * built as features, so a toggle for either would control nothing) against
 * this app's real settings surface, which is eleven actual destination
 * pages, not four in-place toggles. Keeping this a nav strip rather than
 * inventing a vertical settings-home screen also means every settings page
 * keeps working exactly as before — nothing here duplicates or shadows
 * their own state.
 */
export function MobileSettingsNav({ items }: { items: TSidebarItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Settings"
      className="border-k-border bg-k-surface-2 flex gap-[7px] overflow-x-auto border-b px-[14px] py-[10px] sm:hidden"
    >
      {items.map((item) => {
        const active = pathname === item.path;
        return (
          <Link
            key={item.path}
            href={item.path}
            className={cn(
              "border-k-border flex flex-none items-center gap-[6px] whitespace-nowrap rounded-full border px-[12px] py-[6px] text-[12px]",
              active
                ? "border-k-accent-border text-k-accent bg-k-accent/10"
                : "text-k-fg-muted",
            )}
          >
            <span className="[&_svg]:size-[13px]">{item.icon}</span>
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
