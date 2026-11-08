"use client";

import type { RefObject } from "react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/client";
import { useReaderSettings } from "@/lib/readerSettings";
import { cn } from "@/lib/utils";
import { PopoverAnchor } from "@radix-ui/react-popover";
import {
  Globe,
  Laptop,
  Minus,
  Plus,
  RotateCcw,
  Settings,
  Type,
  X,
} from "lucide-react";

import {
  formatFontSize,
  formatLineHeight,
  READER_DEFAULTS,
  READER_SETTING_CONSTRAINTS,
} from "@karakeep/shared/types/readers";

import { ICON_CONTROL_CLASS } from "./IconControl";

interface ReaderSettingsPopoverProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: "outline" | "ghost";
  /** The text these settings change, which the popover opens beside. */
  columnRef?: RefObject<HTMLElement | null>;
  /** For opening it from elsewhere, like a menu, by way of `open`. */
  hideTrigger?: boolean;
  /** How far down to open beside the column, without a trigger to go by. */
  anchorBottom?: () => number;
  /** Where the keyboard goes back to on Escape, without a trigger to go to. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

const COLUMN_GAP_PX = 16;

export default function ReaderSettingsPopover({
  open,
  onOpenChange,
  variant = "outline",
  columnRef,
  hideTrigger,
  anchorBottom,
  returnFocusTo,
}: ReaderSettingsPopoverProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closedWithEscape = useRef(false);
  // Level with the trigger, past the column's edge. Where there's no room for that
  // the popover slides back into view, and still only covers the top of the text.
  const besideColumn = useRef({
    // What the positioning watches: the column resizes with the font size.
    get contextElement() {
      return columnRef?.current ?? undefined;
    },
    getBoundingClientRect: () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const column = columnRef?.current?.getBoundingClientRect();
      return new DOMRect(
        (column?.right ?? trigger?.right ?? 0) + COLUMN_GAP_PX,
        anchorBottom?.() ?? trigger?.bottom ?? 0,
      );
    },
  });
  const {
    settings,
    serverSettings,
    localOverrides,
    sessionOverrides,
    hasSessionChanges,
    hasLocalOverrides,
    isSaving,
    updateSession,
    clearSession,
    saveToDevice,
    clearLocalOverride,
    saveToServer,
  } = useReaderSettings();

  // Helper to get the effective server value (server setting or default)
  const getServerValue = <K extends keyof typeof serverSettings>(key: K) => {
    return serverSettings[key] ?? READER_DEFAULTS[key];
  };

  // Helper to check if a setting has a local override
  const hasLocalOverride = (key: keyof typeof localOverrides) => {
    return localOverrides[key] !== undefined;
  };

  // Build tooltip message for the settings button
  const getSettingsTooltip = () => {
    if (hasSessionChanges && hasLocalOverrides) {
      return t("settings.info.reader_settings.tooltip_preview_and_local");
    }
    if (hasSessionChanges) {
      return t("settings.info.reader_settings.tooltip_preview");
    }
    if (hasLocalOverrides) {
      return t("settings.info.reader_settings.tooltip_local");
    }
    return t("settings.info.reader_settings.tooltip_default");
  };

  // Reads the same as the setting does on the settings page.
  const defaultFontLabel = t("settings.info.reader_settings.default_value", {
    value: t(`settings.info.reader_settings.${READER_DEFAULTS.fontFamily}`),
  });

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {columnRef && <PopoverAnchor virtualRef={besideColumn} />}
      {!hideTrigger && (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                ref={triggerRef}
                variant={variant}
                size="none"
                aria-label={getSettingsTooltip()}
                className={cn(ICON_CONTROL_CLASS, "relative")}
              >
                <Settings className="size-4" />
                {(hasSessionChanges || hasLocalOverrides) && (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary" />
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{getSettingsTooltip()}</p>
          </TooltipContent>
        </Tooltip>
      )}
      <PopoverContent
        side="bottom"
        align={columnRef ? "start" : "center"}
        collisionPadding={32}
        className="flex w-80 flex-col overflow-hidden p-0"
        onEscapeKeyDown={() => {
          closedWithEscape.current = true;
        }}
        onCloseAutoFocus={(e) => {
          if (closedWithEscape.current && returnFocusTo?.current) {
            e.preventDefault();
            returnFocusTo.current.focus();
          }
          closedWithEscape.current = false;
        }}
        style={{
          maxHeight: "var(--radix-popover-content-available-height)",
        }}
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4" />
              <h3 className="font-semibold">
                {t("settings.info.reader_settings.title")}
              </h3>
            </div>
            {hasSessionChanges && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {t("settings.info.reader_settings.preview")}
              </span>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  {t("settings.info.reader_settings.font_family")}
                </label>
                <div className="flex items-center gap-1">
                  {sessionOverrides.fontFamily !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      {t("settings.info.reader_settings.preview_inline")}
                    </span>
                  )}
                  {hasLocalOverride("fontFamily") &&
                    sessionOverrides.fontFamily === undefined && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-label={t(
                              "settings.info.reader_settings.clear_override_label",
                            )}
                            variant="ghost"
                            size="icon"
                            className="relative h-5 w-5 text-muted-foreground after:absolute after:-inset-1.5 hover:text-foreground max-sm:after:-inset-3"
                            onClick={() => clearLocalOverride("fontFamily")}
                          >
                            <X className="size-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {t(
                              "settings.info.reader_settings.clear_override_hint",
                              {
                                value: t(
                                  `settings.info.reader_settings.${getServerValue("fontFamily")}` as const,
                                ),
                              },
                            )}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                </div>
              </div>
              <Select
                value={
                  sessionOverrides.fontFamily ??
                  localOverrides.fontFamily ??
                  serverSettings.fontFamily ??
                  "not-set"
                }
                onValueChange={(value) =>
                  updateSession({
                    fontFamily: value as "serif" | "sans" | "mono",
                  })
                }
              >
                <SelectTrigger
                  className={
                    hasLocalOverride("fontFamily") &&
                    sessionOverrides.fontFamily === undefined
                      ? "border-primary/50"
                      : ""
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {serverSettings.fontFamily == null && (
                    <SelectItem value="not-set" disabled>
                      {defaultFontLabel}
                    </SelectItem>
                  )}
                  <SelectItem value="serif">
                    {t("settings.info.reader_settings.serif")}
                  </SelectItem>
                  <SelectItem value="sans">
                    {t("settings.info.reader_settings.sans")}
                  </SelectItem>
                  <SelectItem value="mono">
                    {t("settings.info.reader_settings.mono")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  {t("settings.info.reader_settings.font_size")}
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">
                    {formatFontSize(settings.fontSize)}
                    {sessionOverrides.fontSize !== undefined && (
                      <span className="ml-1 text-xs">
                        {t("settings.info.reader_settings.preview_inline")}
                      </span>
                    )}
                  </span>
                  {hasLocalOverride("fontSize") &&
                    sessionOverrides.fontSize === undefined && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-label={t(
                              "settings.info.reader_settings.clear_override_label",
                            )}
                            variant="ghost"
                            size="icon"
                            className="relative h-5 w-5 text-muted-foreground after:absolute after:-inset-1.5 hover:text-foreground max-sm:after:-inset-3"
                            onClick={() => clearLocalOverride("fontSize")}
                          >
                            <X className="size-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {t(
                              "settings.info.reader_settings.clear_override_hint",
                              {
                                value: formatFontSize(
                                  getServerValue("fontSize"),
                                ),
                              },
                            )}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  aria-label={t(
                    "settings.info.reader_settings.decrease_font_size",
                  )}
                  variant="outline"
                  size="icon"
                  className="size-8 bg-transparent dark:bg-transparent max-sm:size-11"
                  onClick={() =>
                    updateSession({
                      fontSize: Math.max(
                        READER_SETTING_CONSTRAINTS.fontSize.min,
                        settings.fontSize -
                          READER_SETTING_CONSTRAINTS.fontSize.step,
                      ),
                    })
                  }
                >
                  <Minus className="size-3" />
                </Button>
                <Slider
                  value={[settings.fontSize]}
                  onValueChange={([value]) =>
                    updateSession({ fontSize: value })
                  }
                  max={READER_SETTING_CONSTRAINTS.fontSize.max}
                  min={READER_SETTING_CONSTRAINTS.fontSize.min}
                  step={READER_SETTING_CONSTRAINTS.fontSize.step}
                  className={`flex-1 ${
                    hasLocalOverride("fontSize") &&
                    sessionOverrides.fontSize === undefined
                      ? "[&_[role=slider]]:border-primary/50"
                      : ""
                  }`}
                />
                <Button
                  aria-label={t(
                    "settings.info.reader_settings.increase_font_size",
                  )}
                  variant="outline"
                  size="icon"
                  className="size-8 bg-transparent dark:bg-transparent max-sm:size-11"
                  onClick={() =>
                    updateSession({
                      fontSize: Math.min(
                        READER_SETTING_CONSTRAINTS.fontSize.max,
                        settings.fontSize +
                          READER_SETTING_CONSTRAINTS.fontSize.step,
                      ),
                    })
                  }
                >
                  <Plus className="size-3" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  {t("settings.info.reader_settings.line_height")}
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">
                    {formatLineHeight(settings.lineHeight)}
                    {sessionOverrides.lineHeight !== undefined && (
                      <span className="ml-1 text-xs">
                        {t("settings.info.reader_settings.preview_inline")}
                      </span>
                    )}
                  </span>
                  {hasLocalOverride("lineHeight") &&
                    sessionOverrides.lineHeight === undefined && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-label={t(
                              "settings.info.reader_settings.clear_override_label",
                            )}
                            variant="ghost"
                            size="icon"
                            className="relative h-5 w-5 text-muted-foreground after:absolute after:-inset-1.5 hover:text-foreground max-sm:after:-inset-3"
                            onClick={() => clearLocalOverride("lineHeight")}
                          >
                            <X className="size-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {t(
                              "settings.info.reader_settings.clear_override_hint",
                              {
                                value: formatLineHeight(
                                  getServerValue("lineHeight"),
                                ),
                              },
                            )}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  aria-label={t(
                    "settings.info.reader_settings.decrease_line_height",
                  )}
                  variant="outline"
                  size="icon"
                  className="size-8 bg-transparent dark:bg-transparent max-sm:size-11"
                  onClick={() =>
                    updateSession({
                      lineHeight: Math.max(
                        READER_SETTING_CONSTRAINTS.lineHeight.min,
                        Math.round(
                          (settings.lineHeight -
                            READER_SETTING_CONSTRAINTS.lineHeight.step) *
                            10,
                        ) / 10,
                      ),
                    })
                  }
                >
                  <Minus className="size-3" />
                </Button>
                <Slider
                  value={[settings.lineHeight]}
                  onValueChange={([value]) =>
                    updateSession({ lineHeight: value })
                  }
                  max={READER_SETTING_CONSTRAINTS.lineHeight.max}
                  min={READER_SETTING_CONSTRAINTS.lineHeight.min}
                  step={READER_SETTING_CONSTRAINTS.lineHeight.step}
                  className={`flex-1 ${
                    hasLocalOverride("lineHeight") &&
                    sessionOverrides.lineHeight === undefined
                      ? "[&_[role=slider]]:border-primary/50"
                      : ""
                  }`}
                />
                <Button
                  aria-label={t(
                    "settings.info.reader_settings.increase_line_height",
                  )}
                  variant="outline"
                  size="icon"
                  className="size-8 bg-transparent dark:bg-transparent max-sm:size-11"
                  onClick={() =>
                    updateSession({
                      lineHeight: Math.min(
                        READER_SETTING_CONSTRAINTS.lineHeight.max,
                        Math.round(
                          (settings.lineHeight +
                            READER_SETTING_CONSTRAINTS.lineHeight.step) *
                            10,
                        ) / 10,
                      ),
                    })
                  }
                >
                  <Plus className="size-3" />
                </Button>
              </div>
            </div>

            {hasSessionChanges && (
              <>
                <Separator />

                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => clearSession()}
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t("settings.info.reader_settings.reset_preview")}
                  </Button>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={isSaving}
                      onClick={() => saveToDevice()}
                    >
                      <Laptop className="h-4 w-4" />
                      {t("settings.info.reader_settings.save_to_device")}
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1"
                      disabled={isSaving}
                      onClick={() => saveToServer()}
                    >
                      <Globe className="h-4 w-4" />
                      {t("settings.info.reader_settings.save_to_all_devices")}
                    </Button>
                  </div>

                  <p className="text-center text-xs text-muted-foreground">
                    {t("settings.info.reader_settings.save_hint")}
                  </p>
                </div>
              </>
            )}

            {!hasSessionChanges && (
              <p className="text-center text-xs text-muted-foreground">
                {hasLocalOverrides
                  ? t("settings.info.reader_settings.saved_with_device_hint")
                  : t("settings.info.reader_settings.saved_everywhere_hint")}
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
