"use client";

import { useEffect, useState } from "react";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { useInterfaceLang } from "@/lib/userLocalSettings/bookmarksLayout";
import { updateInterfaceLang } from "@/lib/userLocalSettings/userLocalSettings";
import { useUserSettings } from "@/lib/userSettings";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { langNameMappings } from "@karakeep/shared/langs";
import { ZUserSettings } from "@karakeep/shared/types/users";

import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { SavedHint, useAutosavedSettings } from "./SavedHint";
import { SettingsRow, SettingsRows, SettingsSection } from "./SettingsPage";

type SavableField =
  | "theme"
  | "language"
  | "timezone"
  | "bookmarkClickAction"
  | "archiveDisplayBehaviour";

const THEME_OPTIONS = [
  { value: "light", icon: Sun, label: "options.light_mode" },
  { value: "dark", icon: Moon, label: "options.dark_mode" },
  { value: "system", icon: Laptop, label: "options.system_mode" },
] as const;

const ThemeSelect = ({ onSaved }: { onSaved: () => void }) => {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  // The theme lives in local storage, which the server render can't know.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <Select
      value={mounted ? theme : undefined}
      onValueChange={(value) => {
        setTheme(value);
        onSaved();
      }}
    >
      <SelectTrigger id="appearance">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
          <SelectItem key={value} value={value}>
            <span className="flex items-center gap-2">
              <Icon className="size-4 text-muted-foreground" />
              {t(label)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const LanguageSelect = ({
  onSaved,
  onFailed,
}: {
  onSaved: () => void;
  onFailed: () => void;
}) => {
  const lang = useInterfaceLang();
  return (
    <Select
      value={lang}
      onValueChange={async (val) => {
        try {
          await updateInterfaceLang(val);
          onSaved();
        } catch {
          onFailed();
        }
      }}
    >
      <SelectTrigger id="interface-language">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(langNameMappings).map(([lang, name]) => (
          <SelectItem key={lang} value={lang}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default function UserOptions() {
  const { t } = useTranslation();
  const clientConfig = useClientConfig();
  const data = useUserSettings();
  const { savedField, failedField, markSaved, markFailed, save } =
    useAutosavedSettings<SavableField>();
  const hint = (field: SavableField) => (
    <SavedHint show={savedField === field} failed={failedField === field} />
  );
  const [timezones, setTimezones] = useState<
    { label: string; value: string }[] | null
  >(null);

  const bookmarkClickActionTranslation: Record<
    ZUserSettings["bookmarkClickAction"],
    string
  > = {
    open_original_link: t(
      "settings.info.user_settings.bookmark_click_action.open_external_url",
    ),
    expand_bookmark_preview: t(
      "settings.info.user_settings.bookmark_click_action.open_bookmark_details",
    ),
  };

  const archiveDisplayBehaviourTranslation: Record<
    ZUserSettings["archiveDisplayBehaviour"],
    string
  > = {
    show: t("settings.info.user_settings.archive_display_behaviour.show"),
    hide: t("settings.info.user_settings.archive_display_behaviour.hide"),
  };

  // Get all supported timezones and format them nicely
  useEffect(() => {
    try {
      const browserTimezones = Intl.supportedValuesOf("timeZone");
      setTimezones(
        browserTimezones
          .map((tz) => {
            // Create a more readable label by replacing underscores with spaces
            // and showing the current time offset
            const now = new Date();
            const formatter = new Intl.DateTimeFormat("en", {
              timeZone: tz,
              timeZoneName: "short",
            });
            const parts = formatter.formatToParts(now);
            const timeZoneName =
              parts.find((part) => part.type === "timeZoneName")?.value || "";

            // Format the timezone name for display
            const displayName = tz.replace(/_/g, " ").replace("/", " / ");
            const label = timeZoneName
              ? `${displayName} (${timeZoneName})`
              : displayName;

            return { value: tz, label };
          })
          .sort((a, b) => a.label.localeCompare(b.label)),
      );
    } catch {
      setTimezones(null);
    }
  }, []);

  return (
    <SettingsSection>
      <SettingsRows>
        <SettingsRow
          label={
            <Label htmlFor="appearance">
              {t("settings.preferences.appearance")}
            </Label>
          }
          description={t("settings.preferences.appearance_description")}
          hint={hint("theme")}
        >
          <ThemeSelect onSaved={() => markSaved("theme")} />
        </SettingsRow>

        <SettingsRow
          label={
            <Label htmlFor="bookmark-click-action">
              {t("settings.info.user_settings.bookmark_click_action.title")}
            </Label>
          }
          description={t("settings.preferences.bookmark_click_description")}
          hint={hint("bookmarkClickAction")}
        >
          <Select
            disabled={!!clientConfig.demoMode}
            value={data.bookmarkClickAction}
            onValueChange={(value) => {
              save("bookmarkClickAction", {
                bookmarkClickAction:
                  value as ZUserSettings["bookmarkClickAction"],
              });
            }}
          >
            <SelectTrigger id="bookmark-click-action">
              <SelectValue>
                {bookmarkClickActionTranslation[data.bookmarkClickAction]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(bookmarkClickActionTranslation).map(
                ([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          label={
            <Label htmlFor="archive-display-behaviour">
              {t("settings.info.user_settings.archive_display_behaviour.title")}
            </Label>
          }
          description={t("settings.preferences.archived_description")}
          hint={hint("archiveDisplayBehaviour")}
        >
          <Select
            disabled={!!clientConfig.demoMode}
            value={data.archiveDisplayBehaviour}
            onValueChange={(value) => {
              save("archiveDisplayBehaviour", {
                archiveDisplayBehaviour:
                  value as ZUserSettings["archiveDisplayBehaviour"],
              });
            }}
          >
            <SelectTrigger id="archive-display-behaviour">
              <SelectValue>
                {
                  archiveDisplayBehaviourTranslation[
                    data.archiveDisplayBehaviour
                  ]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(archiveDisplayBehaviourTranslation).map(
                ([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          label={
            <Label htmlFor="interface-language">
              {t("settings.info.interface_lang")}
            </Label>
          }
          description={t("settings.preferences.language_description")}
          hint={hint("language")}
        >
          <LanguageSelect
            onSaved={() => markSaved("language")}
            onFailed={() => markFailed("language")}
          />
        </SettingsRow>

        <SettingsRow
          label={
            <Label htmlFor="timezone">
              {t("settings.preferences.timezone")}
            </Label>
          }
          description={t("settings.preferences.timezone_description")}
          hint={hint("timezone")}
        >
          <Select
            disabled={!!clientConfig.demoMode || timezones === null}
            value={data.timezone}
            onValueChange={(value) => {
              save("timezone", { timezone: value });
            }}
          >
            <SelectTrigger id="timezone">
              <SelectValue>
                {timezones?.find((tz) => tz.value === data.timezone)?.label ||
                  data.timezone}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {timezones?.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsRows>
    </SettingsSection>
  );
}
