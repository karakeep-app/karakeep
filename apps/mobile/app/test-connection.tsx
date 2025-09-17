import React from "react";
import { Platform, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Button } from "@/components/ui/Button";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import useAppSettings from "@/lib/settings";
import { cn } from "@/lib/utils";
import { z } from "zod";

export default function TestConnection() {
  const { settings, isLoading } = useAppSettings();
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
    appendText("Running connection test ...");
    function runTest() {
      const request = new XMLHttpRequest();
      request.onreadystatechange = () => {
        if (request.readyState !== 4) {
          return;
        }

        if (request.status === 0) {
          appendText("Network connection failed: " + request.responseText);
          setStatus("error");
          return;
        }

        if (request.status !== 200) {
          appendText("Recieve non success error code: " + request.status);
          appendText("Got the following response:");
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
            appendText(`Server is not healthy: ${data.status}`);
            setStatus("error");
            return;
          }
          appendText("ALL GOOD");
          setStatus("success");
        } catch (e) {
          appendText(`Failed to parse response as JSON: ${e}`);
          appendText("Got the following response:");
          appendText(request.responseText);
          setStatus("error");
          return;
        }
      };

      appendText("Using address: " + settings.address);
      request.open("GET", `${settings.address}/api/health`);
      request.send();
    }
    runTest();
  }, [settings.address, randomId]);

  return (
    <CustomSafeAreaView>
      <View className="m-4 flex flex-col gap-2 p-2">
        <Button
          className="w-full"
          onPress={async () => {
            await Clipboard.setStringAsync(text);
          }}
        >
          <Text>Copy Diagnostics Result</Text>
        </Button>
        <Button
          className="w-full"
          variant="secondary"
          onPress={() => {
            setText("");
            setRandomId(Math.random());
          }}
        >
          <Text>Retry</Text>
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
            {status === "running" && "Running connection test ..."}
            {status === "success" && "Connection test successful"}
            {status === "error" && "Connection test failed"}
          </Text>
        </View>
        <Input
          className="h-fit leading-6"
          style={{
            fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
          }}
          multiline={true}
          scrollEnabled={true}
          value={text}
          onChangeText={setText}
          editable={false}
        />
      </View>
    </CustomSafeAreaView>
  );
}
