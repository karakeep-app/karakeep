import React from "react";
import { ActivityIndicator, Platform, ScrollView, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router, Stack } from "expo-router";
import { GroupedSection, RowSeparator } from "@/components/ui/GroupedList";
import { HeaderTextButton } from "@/components/ui/SheetHeader";
import { Text } from "@/components/ui/Text";
import { useTranslation } from "@/lib/i18n/hooks";
import { useToast } from "@/components/ui/Toast";
import { SettingsActionRow } from "@/components/settings/settings-list";
import useAppSettings from "@/lib/settings";
import { useColorScheme } from "@/lib/useColorScheme";
import { buildApiHeaders } from "@/lib/utils";
import { CircleAlert, CircleCheck } from "lucide-react-native";
import { z } from "zod";

export default function TestConnection() {
  const { settings, isLoading } = useAppSettings();
  const { t } = useTranslation();
  const { colors } = useColorScheme();
  const { toast } = useToast();
  const [text, setText] = React.useState("");
  const [randomId, setRandomId] = React.useState(() => Math.random());
  const [status, setStatus] = React.useState<"running" | "success" | "error">(
    "running",
  );

  const appendText = (text: string) => {
    setText((prev) => prev + (prev ? "\n\n" : "") + text);
  };

  React.useEffect(() => {
    if (isLoading) {
      return;
    }
    setStatus("running");
    appendText(t("connection_test.running"));
    function runTest() {
      const request = new XMLHttpRequest();
      request.onreadystatechange = () => {
        if (request.readyState !== 4) {
          return;
        }

        if (request.status === 0) {
          appendText(
            t("connection_test.network_failed") + request.responseText,
          );
          setStatus("error");
          return;
        }

        if (request.status !== 200) {
          appendText(t("connection_test.non_success_code") + request.status);
          appendText(t("connection_test.got_response"));
          appendText(request.responseText);
          setStatus("error");
          return;
        }
        try {
          const schema = z.object({
            status: z.string(),
          });
          const data = schema.parse(JSON.parse(request.responseText));
          if (data.status !== "ok") {
            appendText(
              `${t("connection_test.server_unhealthy")}${data.status}`,
            );
            setStatus("error");
            return;
          }
          appendText(t("connection_test.all_good_message"));
          setStatus("success");
        } catch (e) {
          appendText(`${t("connection_test.parse_failed")}${e}`);
          appendText(t("connection_test.got_response"));
          appendText(request.responseText);
          setStatus("error");
          return;
        }
      };

      appendText(t("connection_test.using_address") + settings.address);
      request.open("GET", `${settings.address}/api/health`);
      const headers = buildApiHeaders(settings.apiKey, settings.customHeaders);
      Object.entries(headers).forEach(([key, value]) => {
        request.setRequestHeader(key, value);
      });
      request.send();
    }
    runTest();
    // oxlint-disable-next-line exhaustive-deps
  }, [settings.address, randomId]);

  const server =
    settings.address?.replace(/^https?:\/\//, "") ??
    t("connection_test.your_server");

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-6 px-4 pt-2 pb-10"
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderTextButton
              label={t("actions.done")}
              emphasized
              onPress={() => router.back()}
            />
          ),
        }}
      />
      <GroupedSection>
        <View className="min-h-16 flex-row items-center gap-3 px-4 py-3">
          {status === "running" && <ActivityIndicator size="small" />}
          {status === "success" && <CircleCheck size={24} color="#34c759" />}
          {status === "error" && (
            <CircleAlert size={24} color={colors.destructive} />
          )}
          <View className="flex-1">
            <Text variant="heading">
              {status === "running" && t("connection_test.testing_heading")}
              {status === "success" && t("connection_test.connected_heading")}
              {status === "error" && t("connection_test.failed_heading")}
            </Text>
            <Text variant="footnote" color="tertiary" numberOfLines={1}>
              {server}
            </Text>
          </View>
        </View>
        <RowSeparator />
        <SettingsActionRow
          label={t("connection_test.test_again")}
          tone="primary"
          disabled={status === "running"}
          onPress={() => {
            setText("");
            setRandomId(Math.random());
          }}
        />
      </GroupedSection>

      <GroupedSection header={t("connection_test.diagnostics")}>
        <Text
          selectable
          variant="footnote"
          className="px-4 py-3"
          style={{
            fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
          }}
        >
          {text}
        </Text>
        <RowSeparator />
        <SettingsActionRow
          label={t("connection_test.copy_diagnostics_short")}
          tone="primary"
          onPress={async () => {
            await Clipboard.setStringAsync(text);
            toast({ message: t("actions.copied"), showProgress: false });
          }}
        />
      </GroupedSection>
    </ScrollView>
  );
}
