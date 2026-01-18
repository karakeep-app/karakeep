"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { useInterfaceLang } from "@/lib/userLocalSettings/bookmarksLayout";
import { updateInterfaceLang } from "@/lib/userLocalSettings/userLocalSettings";
import { useUserSettings } from "@/lib/userSettings";
import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, Bookmark, Clock, Globe } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useUpdateUserSettings } from "@karakeep/shared-react/hooks/users";
import { langNameMappings } from "@karakeep/shared/langs";
import {
  ZUserSettings,
  zUserSettingsSchema,
} from "@karakeep/shared/types/users";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Form, FormField } from "../ui/form";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

const LanguageSelect = () => {
  const lang = useInterfaceLang();
  return (
    <Select
      value={lang}
      onValueChange={async (val) => {
        await updateInterfaceLang(val);
      }}
    >
      <SelectTrigger className="h-11">
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
  const { mutate } = useUpdateUserSettings({
    onSuccess: () => {
      toast({
        description: t("settings.info.user_settings.user_settings_updated"),
      });
    },
    onError: () => {
      toast({
        description: t("common.something_went_wrong"),
        variant: "destructive",
      });
    },
  });
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

  const form = useForm<z.infer<typeof zUserSettingsSchema>>({
    resolver: zodResolver(zUserSettingsSchema),
    defaultValues: data,
  });

  // When the actual user setting is loaded, reset the form to the current value
  useEffect(() => {
    form.reset(data);
  }, [data]);

  return (
    <Form {...form}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2  text-xl">
            <Globe className="h-5 w-5" />
            {t("settings.info.options")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t("settings.info.interface_lang")}
            </Label>
            <LanguageSelect />
          </div>

          <FormField
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4" />
                  Timezone
                </Label>
                <Select
                  disabled={!!clientConfig.demoMode || timezones === null}
                  value={field.value}
                  onValueChange={(value) => {
                    mutate({
                      timezone: value,
                    });
                  }}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue>
                      {timezones?.find(
                        (tz: { value: string; label: string }) =>
                          tz.value === field.value,
                      )?.label || field.value}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {timezones?.map((tz: { value: string; label: string }) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />

          <div className="grid grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="bookmarkClickAction"
              render={({ field }) => (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Bookmark className="h-4 w-4" />
                    {t(
                      "settings.info.user_settings.bookmark_click_action.title",
                    )}
                  </Label>
                  <Select
                    disabled={!!clientConfig.demoMode}
                    value={field.value}
                    onValueChange={(value) => {
                      mutate({
                        bookmarkClickAction:
                          value as ZUserSettings["bookmarkClickAction"],
                      });
                    }}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue>
                        {bookmarkClickActionTranslation[field.value]}
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
                </div>
              )}
            />

            <FormField
              control={form.control}
              name="archiveDisplayBehaviour"
              render={({ field }) => (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Archive className="h-4 w-4" />
                    {t(
                      "settings.info.user_settings.archive_display_behaviour.title",
                    )}
                  </Label>
                  <Select
                    disabled={!!clientConfig.demoMode}
                    value={field.value}
                    onValueChange={(value) => {
                      mutate({
                        archiveDisplayBehaviour:
                          value as ZUserSettings["archiveDisplayBehaviour"],
                      });
                    }}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue>
                        {archiveDisplayBehaviourTranslation[field.value]}
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
                </div>
              )}
            />
          </div>
        </CardContent>
      </Card>
    </Form>
  );
}
