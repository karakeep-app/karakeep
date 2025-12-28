"use client";

import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { useReaderSettings } from "@/lib/readerSettings";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  Laptop,
  RotateCcw,
} from "lucide-react";

import {
  formatFontSize,
  formatLineHeight,
  READER_DEFAULTS,
  READER_FONT_FAMILIES,
  READER_SETTING_CONSTRAINTS,
} from "@karakeep/shared/types/readers";

import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Slider } from "../ui/slider";

export default function ReaderSettings() {
  const { t } = useTranslation();
  const clientConfig = useClientConfig();
  const {
    settings,
    serverSettings,
    localOverrides,
    hasLocalOverrides,
    clearServerDefaults,
    clearLocalOverrides,
    updateServerSetting,
  } = useReaderSettings();

  // Local state for collapsible
  const [isOpen, setIsOpen] = useState(false);

  // Local state for slider dragging (null = not dragging, use server value)
  const [draggingFontSize, setDraggingFontSize] = useState<number | null>(null);
  const [draggingLineHeight, setDraggingLineHeight] = useState<number | null>(
    null,
  );

  const hasServerSettings =
    serverSettings.fontSize !== null ||
    serverSettings.lineHeight !== null ||
    serverSettings.fontFamily !== null;

  const handleClearDefaults = () => {
    clearServerDefaults();
    toast({ description: t("settings.info.reader_settings.defaults_cleared") });
  };

  const handleClearLocalOverrides = () => {
    clearLocalOverrides();
    toast({
      description: t("settings.info.reader_settings.local_overrides_cleared"),
    });
  };

  // Format local override for display
  const formatLocalOverride = (
    key: "fontSize" | "lineHeight" | "fontFamily",
  ) => {
    const value = localOverrides[key];
    if (value === undefined) return null;
    if (key === "fontSize") return formatFontSize(value as number);
    if (key === "lineHeight") return formatLineHeight(value as number);
    if (key === "fontFamily") {
      switch (value) {
        case "serif":
          return t("settings.info.reader_settings.serif");
        case "sans":
          return t("settings.info.reader_settings.sans");
        case "mono":
          return t("settings.info.reader_settings.mono");
      }
    }
    return String(value);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CardHeader>
          <CollapsibleTrigger className="flex w-full items-center justify-between [&[data-state=open]>svg]:rotate-180">
            <div className="flex flex-col items-start gap-1 text-left">
              <CardTitle className="flex items-center gap-2 text-xl">
                <BookOpen className="h-5 w-5" />
                {t("settings.info.reader_settings.title")}
              </CardTitle>
              <CardDescription>
                {t("settings.info.reader_settings.description")}
              </CardDescription>
            </div>
            <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-200" />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Local Overrides Warning */}
            {hasLocalOverrides && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="flex flex-col gap-3">
                  <div>
                    <p className="font-medium">
                      {t("settings.info.reader_settings.local_overrides_title")}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t(
                        "settings.info.reader_settings.local_overrides_description",
                      )}
                    </p>
                    <ul className="mt-2 text-sm text-muted-foreground">
                      {localOverrides.fontFamily !== undefined && (
                        <li>
                          {t("settings.info.reader_settings.font_family")}:{" "}
                          {formatLocalOverride("fontFamily")}
                        </li>
                      )}
                      {localOverrides.fontSize !== undefined && (
                        <li>
                          {t("settings.info.reader_settings.font_size")}:{" "}
                          {formatLocalOverride("fontSize")}
                        </li>
                      )}
                      {localOverrides.lineHeight !== undefined && (
                        <li>
                          {t("settings.info.reader_settings.line_height")}:{" "}
                          {formatLocalOverride("lineHeight")}
                        </li>
                      )}
                    </ul>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearLocalOverrides}
                    className="w-fit"
                  >
                    <Laptop className="mr-2 h-4 w-4" />
                    {t("settings.info.reader_settings.clear_local_overrides")}
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Font Family */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("settings.info.reader_settings.font_family")}
              </Label>
              <Select
                disabled={!!clientConfig.demoMode}
                value={serverSettings.fontFamily ?? "not-set"}
                onValueChange={(value) => {
                  if (value !== "not-set") {
                    updateServerSetting({
                      fontFamily: value as "serif" | "sans" | "mono",
                    });
                  }
                }}
              >
                <SelectTrigger className="h-11">
                  <SelectValue
                    placeholder={t("settings.info.reader_settings.not_set")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not-set" disabled>
                    {t("settings.info.reader_settings.not_set")} (
                    {t("common.default")}: {READER_DEFAULTS.fontFamily})
                  </SelectItem>
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
              {serverSettings.fontFamily === null && (
                <p className="text-xs text-muted-foreground">
                  {t("settings.info.reader_settings.using_default")}:{" "}
                  {READER_DEFAULTS.fontFamily}
                </p>
              )}
            </div>

            {/* Font Size */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  {t("settings.info.reader_settings.font_size")}
                </Label>
                <span className="text-sm text-muted-foreground">
                  {formatFontSize(draggingFontSize ?? settings.fontSize)}
                  {serverSettings.fontSize === null &&
                    draggingFontSize === null &&
                    ` (${t("common.default").toLowerCase()})`}
                </span>
              </div>
              <Slider
                disabled={!!clientConfig.demoMode}
                value={[draggingFontSize ?? settings.fontSize]}
                onValueChange={([value]) => setDraggingFontSize(value)}
                onValueCommit={([value]) => {
                  updateServerSetting({ fontSize: value });
                  setDraggingFontSize(null);
                }}
                max={READER_SETTING_CONSTRAINTS.fontSize.max}
                min={READER_SETTING_CONSTRAINTS.fontSize.min}
                step={READER_SETTING_CONSTRAINTS.fontSize.step}
              />
            </div>

            {/* Line Height */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  {t("settings.info.reader_settings.line_height")}
                </Label>
                <span className="text-sm text-muted-foreground">
                  {formatLineHeight(draggingLineHeight ?? settings.lineHeight)}
                  {serverSettings.lineHeight === null &&
                    draggingLineHeight === null &&
                    ` (${t("common.default").toLowerCase()})`}
                </span>
              </div>
              <Slider
                disabled={!!clientConfig.demoMode}
                value={[draggingLineHeight ?? settings.lineHeight]}
                onValueChange={([value]) => setDraggingLineHeight(value)}
                onValueCommit={([value]) => {
                  updateServerSetting({ lineHeight: value });
                  setDraggingLineHeight(null);
                }}
                max={READER_SETTING_CONSTRAINTS.lineHeight.max}
                min={READER_SETTING_CONSTRAINTS.lineHeight.min}
                step={READER_SETTING_CONSTRAINTS.lineHeight.step}
              />
            </div>

            {/* Clear Defaults Button */}
            {hasServerSettings && (
              <Button
                variant="outline"
                onClick={handleClearDefaults}
                className="w-full"
                disabled={!!clientConfig.demoMode}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {t("settings.info.reader_settings.clear_defaults")}
              </Button>
            )}

            {/* Preview */}
            <div className="rounded-lg border p-4">
              <p className="mb-2 text-sm font-medium text-muted-foreground">
                {t("settings.info.reader_settings.preview")}
              </p>
              <p
                style={{
                  fontFamily: READER_FONT_FAMILIES[settings.fontFamily],
                  fontSize: `${draggingFontSize ?? settings.fontSize}px`,
                  lineHeight: draggingLineHeight ?? settings.lineHeight,
                }}
              >
                {t("settings.info.reader_settings.preview_text")}
                <br />
                {t("settings.info.reader_settings.preview_text")}
                <br />
                {t("settings.info.reader_settings.preview_text")}
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
