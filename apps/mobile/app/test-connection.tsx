import React from "react";
import { Platform, ScrollView, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useTranslation } from "@/lib/i18n/hooks";
import useAppSettings from "@/lib/settings";
import { buildApiHeaders, cn } from "@/lib/utils";
import { z } from "zod";

export default function TestConnection() {
  const { settings, isLoading } = useAppSettings();
  const { t } = useTranslation();
  const [text, setText] = React.useState("");
  const [randomId, setRandomId] = React.useState(Math.random());
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
          appendText(t("connection_test.all_good"));
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

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="m-4 flex flex-1 flex-col gap-2"
    >
      <Button
        className="w-full"
        onPress={async () => {
          await Clipboard.setStringAsync(text);
        }}
      >
        <Text>{t("connection_test.copy_diagnostics")}</Text>
      </Button>
      <Button
        className="w-full"
        variant="secondary"
        onPress={() => {
          setText("");
          setRandomId(Math.random());
        }}
      >
        <Text>{t("connection_test.retry")}</Text>
      </Button>
      <View
        className={cn(
          "w-full rounded-md p-2",
          status === "running" && "bg-primary/50",
          status === "success" && "bg-green-500",
          status === "error" && "bg-red-500",
        )}
      >
        <Text
          className={cn(
            "w-full text-center",
            status === "running" && "text-primary-foreground",
            status === "success" && "text-white",
            status === "error" && "text-white",
          )}
        >
          {status === "running" && t("connection_test.running")}
          {status === "success" && t("connection_test.success")}
          {status === "error" && t("connection_test.failed")}
        </Text>
      </View>
      <ScrollView className="border-1 border-md h-64 flex-1 border-border bg-input p-2 leading-6">
        <Text
          style={{
            fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
          }}
        >
          {text}
        </Text>
      </ScrollView>
    </ScrollView>
  );
}
