"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { useReaderSettings } from "@/lib/readerSettings";
import { AlertTriangle, Laptop, RotateCcw } from "lucide-react";

import type { ReaderSettings as ZReaderSettings } from "@karakeep/shared/types/readers";
import {
  formatFontSize,
  formatLineHeight,
  READER_DEFAULTS,
  READER_FONT_FAMILIES,
  READER_SETTING_CONSTRAINTS,
} from "@karakeep/shared/types/readers";

import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { StepperSlider } from "../ui/slider";
import { SavedHint, useSavedField } from "./SavedHint";
import { SettingsRow, SettingsRows, SettingsSection } from "./SettingsPage";

type ReaderField = "fontFamily" | "fontSize" | "lineHeight";

export default function ReadingSettings() {
  const { t } = useTranslation();
  const clientConfig = useClientConfig();
  const {
    settings,
    serverSettings,
    localOverrides,
    hasLocalOverrides,
    isSaving,
    clearServerDefaults,
    clearLocalOverrides,
    updateServerSetting,
  } = useReaderSettings();

  // Local state for slider dragging (null = not dragging, use server value)
  const [draggingFontSize, setDraggingFontSize] = useState<number | null>(null);
  const [draggingLineHeight, setDraggingLineHeight] = useState<number | null>(
    null,
  );

  const { savedField, failedField, markSaved, markFailed } =
    useSavedField<ReaderField>();
  const hint = (field: ReaderField) => (
    <SavedHint show={savedField === field} failed={failedField === field} />
  );
  // The field and value being autosaved, to confirm once the save has landed.
  const savingRef = useRef<{
    field: ReaderField;
    value: string | number;
  } | null>(null);
  const saveField = <K extends ReaderField>(
    field: K,
    value: ZReaderSettings[K],
  ) => {
    savingRef.current = { field, value };
    updateServerSetting({ [field]: value });
  };

  useEffect(() => {
    const saving = savingRef.current;
    if (isSaving || !saving) {
      return;
    }
    savingRef.current = null;
    // A failed save rolls back, and shouldn't claim to be saved.
    const landed = serverSettings[saving.field];
    const matches =
      typeof landed === "number" && typeof saving.value === "number"
        ? Math.abs(landed - saving.value) < 1e-6
        : landed === saving.value;
    if (matches) {
      markSaved(saving.field);
    } else {
      markFailed(saving.field);
    }
  }, [isSaving, serverSettings, markSaved, markFailed]);

  const hasServerSettings =
    serverSettings.fontSize != null ||
    serverSettings.lineHeight != null ||
    serverSettings.fontFamily != null;

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

  const defaultFontLabel = t("settings.info.reader_settings.default_value", {
    value: t(`settings.info.reader_settings.${READER_DEFAULTS.fontFamily}`),
  });

  return (
    <>
      {/* Device overrides beat the defaults set below, so call them out. */}
      {hasLocalOverrides && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription className="flex flex-col gap-3">
            <div>
              <p className="font-medium">
                {t("settings.info.reader_settings.local_overrides_title")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("settings.info.reader_settings.local_overrides_description")}
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
              <Laptop className="size-4" />
              {t("settings.info.reader_settings.clear_local_overrides")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <SettingsSection
        description={t("settings.info.reader_settings.applies_everywhere")}
      >
        <SettingsRows>
          <SettingsRow
            label={
              <Label htmlFor="reader-font-family">
                {t("settings.info.reader_settings.font_family")}
              </Label>
            }
            hint={hint("fontFamily")}
          >
            <Select
              disabled={!!clientConfig.demoMode}
              value={serverSettings.fontFamily ?? "not-set"}
              onValueChange={(value) => {
                if (value !== "not-set") {
                  saveField("fontFamily", value as "serif" | "sans" | "mono");
                }
              }}
            >
              <SelectTrigger id="reader-font-family">
                <SelectValue placeholder={defaultFontLabel} />
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
          </SettingsRow>

          <SettingsRow
            label={t("settings.info.reader_settings.font_size")}
            hint={hint("fontSize")}
          >
            <StepperSlider
              label={t("settings.info.reader_settings.font_size")}
              decreaseLabel={t(
                "settings.info.reader_settings.decrease_font_size",
              )}
              increaseLabel={t(
                "settings.info.reader_settings.increase_font_size",
              )}
              disabled={!!clientConfig.demoMode}
              value={draggingFontSize ?? settings.fontSize}
              displayValue={formatFontSize(
                draggingFontSize ?? settings.fontSize,
              )}
              onValueChange={setDraggingFontSize}
              onValueCommit={(value) => {
                saveField("fontSize", value);
                setDraggingFontSize(null);
              }}
              max={READER_SETTING_CONSTRAINTS.fontSize.max}
              min={READER_SETTING_CONSTRAINTS.fontSize.min}
              step={READER_SETTING_CONSTRAINTS.fontSize.step}
            />
          </SettingsRow>

          <SettingsRow
            label={t("settings.info.reader_settings.line_height")}
            hint={hint("lineHeight")}
          >
            <StepperSlider
              label={t("settings.info.reader_settings.line_height")}
              decreaseLabel={t(
                "settings.info.reader_settings.decrease_line_height",
              )}
              increaseLabel={t(
                "settings.info.reader_settings.increase_line_height",
              )}
              disabled={!!clientConfig.demoMode}
              value={draggingLineHeight ?? settings.lineHeight}
              displayValue={formatLineHeight(
                draggingLineHeight ?? settings.lineHeight,
              )}
              onValueChange={setDraggingLineHeight}
              onValueCommit={(value) => {
                saveField("lineHeight", value);
                setDraggingLineHeight(null);
              }}
              max={READER_SETTING_CONSTRAINTS.lineHeight.max}
              min={READER_SETTING_CONSTRAINTS.lineHeight.min}
              step={READER_SETTING_CONSTRAINTS.lineHeight.step}
            />
          </SettingsRow>
        </SettingsRows>

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
          </p>
        </div>

        {hasServerSettings && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={handleClearDefaults}
              disabled={!!clientConfig.demoMode}
            >
              <RotateCcw className="size-4" />
              {t("settings.info.reader_settings.clear_defaults")}
            </Button>
          </div>
        )}
      </SettingsSection>
    </>
  );
}
