"use client";

import { useTranslation } from "@/lib/i18n/client";
import { useSidebarCollapsed } from "@/lib/store/useSidebarCollapsed";
import { cn } from "@/lib/utils";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export default function SidebarShell({
  children,
  extraSections,
}: {
  children: React.ReactNode;
  extraSections?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const collapsed = useSidebarCollapsed((s) => s.collapsed);
  const toggle = useSidebarCollapsed((s) => s.toggle);

  return (
    <aside
      className={cn(
        "flex h-[calc(100vh-64px)] flex-col gap-5 border-r p-4 transition-[width] duration-150",
        collapsed ? "w-16 items-center px-2" : "w-60 xl:w-72",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        title={
          collapsed ? t("common.expand_sidebar") : t("common.collapse_sidebar")
        }
        aria-label={
          collapsed ? t("common.expand_sidebar") : t("common.collapse_sidebar")
        }
        className={cn(
          "flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
          collapsed ? "self-center" : "self-end",
        )}
      >
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>
      <div className="w-full flex-1">{children}</div>
      {!collapsed && extraSections}
    </aside>
  );
}
