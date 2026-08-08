"use client";

import { useMemo } from "react";
import Link from "next/link";
import { redirect, useRouter } from "next/navigation";
import { useToggleTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useSession } from "@/lib/auth/client";
import { useTranslation } from "@/lib/i18n/client";
import { useInBookmarkGridStore } from "@/lib/store/useInBookmarkGridStore";
import { useKeyboardNavigationStore } from "@/lib/store/useKeyboardNavigationStore";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Keyboard,
  LogOut,
  Moon,
  Paintbrush,
  Puzzle,
  Settings,
  Shield,
  Sun,
  Twitter,
  UserCircle,
} from "lucide-react";
import { useTheme } from "next-themes";

import { useWhoAmI } from "@karakeep/shared-react/hooks/users";

import { AdminNoticeBadge } from "../../admin/AdminNotices";

function DarkModeToggle() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  if (theme == "dark") {
    return (
      <>
        <Sun className="mr-2 size-4" />
        <span>{t("options.light_mode")}</span>
      </>
    );
  } else {
    return (
      <>
        <Moon className="mr-2 size-4" />
        <span>{t("options.dark_mode")}</span>
      </>
    );
  }
}

export default function SidebarProfileOptions({
  iconOnly = false,
  dense = false,
}: {
  /** Render a plain, unstyled profile glyph as the trigger instead of the
   * avatar bubble — used by the dense sidebar footer, which specs a bare
   * 16px icon rather than an avatar chip. */
  iconOnly?: boolean;
  /** Retheme the dropdown content to the dense fork's tokens. The trigger
   *  itself doesn't need this — `iconOnly` already renders it as a bare
   *  glyph that just inherits the dense sidebar's text color — but the
   *  dropdown panel has its own hardcoded avatar ring/background and email
   *  color that the fork's global CSS-variable remap doesn't reach. False
   *  by default so Header.tsx's non-dense usage is unaffected. */
  dense?: boolean;
}) {
  const { t } = useTranslation();
  const toggleTheme = useToggleTheme();
  const { data: session } = useSession();
  const { data: whoami } = useWhoAmI();
  const router = useRouter();
  const inBookmarkGrid = useInBookmarkGridStore(
    (state) => state.inBookmarkGrid,
  );
  const setShortcutsDialogOpen = useKeyboardNavigationStore(
    (state) => state.setShortcutsDialogOpen,
  );

  const avatarImage = whoami?.image ?? null;
  const avatarUrl = useMemo(() => avatarImage ?? null, [avatarImage]);

  if (!session) return redirect("/");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {iconOnly ? (
          <button
            type="button"
            aria-label={t("settings.user_settings")}
            className="flex size-full items-center justify-center text-current"
          >
            <UserCircle className="size-full" strokeWidth={1.75} />
          </button>
        ) : (
          <Button
            className="border-new-gray-200 aspect-square rounded-full border-4 bg-black p-0 text-white"
            variant="ghost"
          >
            <UserAvatar
              image={avatarUrl}
              name={session.user.name}
              className="h-full w-full rounded-full"
            />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={cn(
          "mr-2 min-w-64 p-2",
          dense && "border-k-border bg-k-surface-1 text-k-fg",
        )}
      >
        <div className="flex gap-2">
          <div
            className={cn(
              "flex aspect-square size-11 items-center justify-center overflow-hidden rounded-full border-4 bg-black p-0 text-white",
              dense ? "border-k-border bg-k-surface-2" : "border-new-gray-200",
            )}
          >
            <UserAvatar
              image={avatarUrl}
              name={session.user.name}
              className="h-full w-full"
              fallbackClassName="bg-muted text-muted-foreground"
            />
          </div>
          <div className="flex flex-col">
            <p>{session.user.name}</p>
            <p
              className={cn(
                "text-sm",
                dense ? "text-k-fg-dim" : "text-gray-400",
              )}
            >
              {session.user.email}
            </p>
          </div>
        </div>
        <Separator className={cn("my-2", dense && "bg-k-border")} />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="mr-2 size-4" />
            {t("settings.user_settings")}
          </Link>
        </DropdownMenuItem>
        {session.user.role == "admin" && (
          <DropdownMenuItem asChild>
            <Link href="/admin" className="flex justify-between">
              <div className="items-cente flex gap-2">
                <Shield className="size-4" />
                {t("admin.admin_settings")}
              </div>
              <AdminNoticeBadge />
            </Link>
          </DropdownMenuItem>
        )}
        <Separator className={cn("my-2", dense && "bg-k-border")} />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/cleanups">
            <Paintbrush className="mr-2 size-4" />
            {t("cleanups.cleanups")}
          </Link>
        </DropdownMenuItem>
        {/* ForceDenseTheme forces dark for as long as any dashboard page is
            mounted and only restores the user's real preference on
            unmount (see its own comment) — it doesn't fight further
            changes after that initial mount. Offering this toggle here
            would flip next-themes to light while `.k-dense`'s own
            CSS-variable palette stays fully dark, desyncing the two and
            leaving `dark:` utility classes elsewhere in the app switched
            off against an otherwise dark screen. */}
        {!dense && (
          <DropdownMenuItem onClick={toggleTheme}>
            <DarkModeToggle />
          </DropdownMenuItem>
        )}
        {inBookmarkGrid && (
          <DropdownMenuItem onClick={() => setShortcutsDialogOpen(true)}>
            <Keyboard className="mr-2 size-4" />
            {t("keyboard_shortcuts.title")}
          </DropdownMenuItem>
        )}
        <Separator className={cn("my-2", dense && "bg-k-border")} />
        <DropdownMenuItem asChild>
          <a href="https://karakeep.app/apps" target="_blank" rel="noreferrer">
            <Puzzle className="mr-2 size-4" />
            {t("options.apps_extensions")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="https://docs.karakeep.app" target="_blank" rel="noreferrer">
            <BookOpen className="mr-2 size-4" />
            {t("options.documentation")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="https://x.com/karakeep_app" target="_blank" rel="noreferrer">
            <Twitter className="mr-2 size-4" />
            {t("options.follow_us_on_x")}
          </a>
        </DropdownMenuItem>
        <Separator className={cn("my-2", dense && "bg-k-border")} />
        <DropdownMenuItem onClick={() => router.push("/logout")}>
          <LogOut className="mr-2 size-4" />
          <span>{t("actions.sign_out")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
