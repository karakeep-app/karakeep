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
import { useTranslation } from "@/lib/i18n/client";
import { LogOut, Moon, Paintbrush, Settings, Shield, Sun } from "lucide-react";
import { useSession } from "next-auth/react";
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

export default function SidebarProfileOptions() {
  const { t } = useTranslation();
  const toggleTheme = useToggleTheme();
  const { data: session } = useSession();
  const { data: whoami } = useWhoAmI();
  const router = useRouter();

  const avatarImage = whoami?.image ?? null;
  const avatarUrl = useMemo(() => avatarImage ?? null, [avatarImage]);

  if (!session) return redirect("/");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
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
        <Separator className="my-2" />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/cleanups">
            <Paintbrush className="mr-2 size-4" />
            {t("cleanups.cleanups")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={toggleTheme}>
          <DarkModeToggle />
        </DropdownMenuItem>
        <Separator className="my-2" />
        <DropdownMenuItem onClick={() => router.push("/logout")}>
          <LogOut className="mr-2 size-4" />
          <span>{t("actions.sign_out")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
