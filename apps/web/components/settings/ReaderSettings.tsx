"use client";

import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { useReaderSettings } from "@/lib/readerSettings";
import { AlertTriangle, BookOpen, Laptop, RotateCcw } from "lucide-react";

import { useUpdateUserSettings } from "@karakeep/shared-react/hooks/users";
import {
  READER_DEFAULTS,
  READER_FONT_FAMILIES,
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
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Slider } from "../ui/slider";
import { toast } from "../ui/use-toast";

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
  } = useReaderSettings();
  const { mutate: updateServerSettings } = useUpdateUserSettings();

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
    if (key === "fontSize") return `${value}px`;
    if (key === "lineHeight") return (value as number).toFixed(1);
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

  // Direct update to server (settings page doesn't use preview mode)
  const updateServerSetting = (updates: {
    fontSize?: number;
    lineHeight?: number;
    fontFamily?: "serif" | "sans" | "mono";
  }) => {
    updateServerSettings({
      readerFontSize: updates.fontSize,
      readerLineHeight: updates.lineHeight,
      readerFontFamily: updates.fontFamily,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <BookOpen className="h-5 w-5" />
          {t("settings.info.reader_settings.title")}
        </CardTitle>
        <CardDescription>
          {t("settings.info.reader_settings.description")}
        </CardDescription>
      </CardHeader>
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
              {serverSettings.fontSize ?? `${READER_DEFAULTS.fontSize}`}px
              {serverSettings.fontSize === null &&
                ` (${t("common.default").toLowerCase()})`}
            </span>
          </div>
          <Slider
            disabled={!!clientConfig.demoMode}
            value={[serverSettings.fontSize ?? READER_DEFAULTS.fontSize]}
            onValueCommit={([value]) =>
              updateServerSetting({ fontSize: value })
            }
            max={24}
            min={12}
            step={1}
          />
        </div>

        {/* Line Height */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">
              {t("settings.info.reader_settings.line_height")}
            </Label>
            <span className="text-sm text-muted-foreground">
              {(
                serverSettings.lineHeight ?? READER_DEFAULTS.lineHeight
              ).toFixed(1)}
              {serverSettings.lineHeight === null &&
                ` (${t("common.default").toLowerCase()})`}
            </span>
          </div>
          <Slider
            disabled={!!clientConfig.demoMode}
            value={[serverSettings.lineHeight ?? READER_DEFAULTS.lineHeight]}
            onValueCommit={([value]) =>
              updateServerSetting({ lineHeight: value })
            }
            max={2.5}
            min={1.2}
            step={0.1}
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
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
            }}
          >
            {t("settings.info.reader_settings.preview_text")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
