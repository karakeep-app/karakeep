"use client";

import { useMemo } from "react";
import Link from "next/link";
import { redirect, useRouter } from "next/navigation";
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
  Laptop,
  LogOut,
  Moon,
  Paintbrush,
  Puzzle,
  Settings,
  Shield,
  Sun,
  SunMoon,
  Twitter,
} from "lucide-react";
import { useTheme } from "next-themes";

import { useWhoAmI } from "@karakeep/shared-react/hooks/users";

import { AdminNoticeBadge } from "../../admin/AdminNotices";

const THEME_OPTIONS = [
  { value: "light", icon: Sun, label: "options.light_mode" },
  { value: "dark", icon: Moon, label: "options.dark_mode" },
  { value: "system", icon: Laptop, label: "options.system_mode" },
] as const;

function ThemeSelector() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
      <div className="flex items-center gap-2">
        <SunMoon className="size-4 text-muted-foreground" />
        {t("options.theme")}
      </div>
      <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
        {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
          <DropdownMenuItem
            key={value}
            role="menuitemradio"
            aria-checked={theme === value}
            aria-label={t(label)}
            title={t(label)}
            // Keep the menu open so the change can be previewed
            onSelect={(e) => {
              e.preventDefault();
              setTheme(value);
            }}
            className={cn(
              "rounded px-2 py-1 focus:bg-background/60",
              theme === value &&
                "bg-background shadow-sm focus:bg-background [&_svg]:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
          </DropdownMenuItem>
        ))}
      </div>
    </div>
  );
}

export default function SidebarProfileOptions() {
  const { t } = useTranslation();
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
        <Button
          className="border-new-gray-200 shrink-0 rounded-full border-4 bg-black p-0 text-white"
          variant="ghost"
          size="icon"
        >
          <UserAvatar
            image={avatarUrl}
            name={session.user.name}
            className="h-full w-full rounded-full"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="mr-2 min-w-64 p-2">
        <div className="flex gap-2">
          <div className="border-new-gray-200 flex aspect-square size-11 items-center justify-center overflow-hidden rounded-full border-4 bg-black p-0 text-white">
            <UserAvatar
              image={avatarUrl}
              name={session.user.name}
              className="h-full w-full"
            />
          </div>
          <div className="flex flex-col">
            <p>{session.user.name}</p>
            <p className="text-sm text-gray-400">{session.user.email}</p>
          </div>
        </div>
        <Separator className="my-2" />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="size-4" />
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
        <Separator className="my-2" />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/cleanups">
            <Paintbrush className="size-4" />
            {t("cleanups.cleanups")}
          </Link>
        </DropdownMenuItem>
        <ThemeSelector />
        {inBookmarkGrid && (
          <DropdownMenuItem onClick={() => setShortcutsDialogOpen(true)}>
            <Keyboard className="size-4" />
            {t("keyboard_shortcuts.title")}
          </DropdownMenuItem>
        )}
        <Separator className="my-2" />
        <DropdownMenuItem asChild>
          <a href="https://karakeep.com/apps" target="_blank" rel="noreferrer">
            <Puzzle className="size-4" />
            {t("options.apps_extensions")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="https://docs.karakeep.com" target="_blank" rel="noreferrer">
            <BookOpen className="size-4" />
            {t("options.documentation")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="https://x.com/karakeep_app" target="_blank" rel="noreferrer">
            <Twitter className="size-4" />
            {t("options.follow_us_on_x")}
          </a>
        </DropdownMenuItem>
        <Separator className="my-2" />
        <DropdownMenuItem onClick={() => router.push("/logout")}>
          <LogOut className="size-4" />
          <span>{t("actions.sign_out")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
