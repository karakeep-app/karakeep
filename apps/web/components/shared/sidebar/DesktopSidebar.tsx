"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ButtonWithTooltip } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const STORAGE_KEY = "karakeep-sidebar";

export default function DesktopSidebar({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const dragStart = useRef<{ pointerX: number; width: number } | null>(null);

  useLayoutEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(STORAGE_KEY) ?? "null",
      ) as {
        collapsed?: boolean;
        width?: number;
      } | null;
      setCollapsed(stored?.collapsed === true);
      if (typeof stored?.width === "number" && Number.isFinite(stored.width)) {
        setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, stored.width)));
      }
    } catch {
      // Ignore invalid or unavailable local preferences.
    } finally {
      setPreferencesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ collapsed, width }));
    } catch {
      // The sidebar still works when local storage is unavailable.
    }
  }, [collapsed, preferencesLoaded, width]);

  const resize = (nextWidth: number) => {
    setWidth(Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, nextWidth))));
  };

  const stopDragging = () => {
    dragStart.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!dragStart.current) return;
      resize(
        dragStart.current.width + event.clientX - dragStart.current.pointerX,
      );
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    window.addEventListener("blur", stopDragging);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
      window.removeEventListener("blur", stopDragging);
      stopDragging();
    };
  }, []);

  return (
    <div
      className={cn("relative hidden flex-none sm:flex", collapsed && "w-0")}
      style={collapsed ? undefined : { width }}
    >
      <div className={cn("w-full overflow-hidden", collapsed && "hidden")}>
        {children}
      </div>
      <ButtonWithTooltip
        tooltip={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
        aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
        variant="outline"
        size="icon"
        className={cn(
          "absolute top-3 z-20 size-8 bg-background shadow-sm",
          collapsed ? "left-2" : "right-2",
        )}
        onClick={() => setCollapsed((value) => !value)}
      >
        {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
      </ButtonWithTooltip>
      {!collapsed && (
        <div
          role="separator"
          aria-label={t("sidebar.resize")}
          aria-orientation="vertical"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          aria-valuenow={width}
          tabIndex={0}
          className="absolute inset-y-0 right-0 z-10 w-1 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-primary/40 focus:bg-primary/40 focus:outline-none"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragStart.current = { pointerX: event.clientX, width };
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
          onLostPointerCapture={stopDragging}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            resize(width + (event.key === "ArrowRight" ? 16 : -16));
          }}
        />
      )}
    </div>
  );
}
