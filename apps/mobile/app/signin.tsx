import { useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import Logo from "@/components/Logo";
import { TailwindResolver } from "@/components/TailwindResolver";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import useAppSettings from "@/lib/settings";
import { api } from "@/lib/trpc";
import { Bug, Check, Edit3 } from "lucide-react-native";

enum LoginType {
  Password,
  ApiKey,
}

export default function Signin() {
  const { settings, setSettings } = useAppSettings();
  const router = useRouter();

  const [error, setError] = useState<string | undefined>();
  const [loginType, setLoginType] = useState<LoginType>(LoginType.Password);
  const [isEditingServerAddress, setIsEditingServerAddress] = useState(false);
  const [tempServerAddress, setTempServerAddress] = useState(
    "https://cloud.karakeep.app",
  );

  const emailRef = useRef<string>("");
  const passwordRef = useRef<string>("");
  const apiKeyRef = useRef<string>("");

  const toggleLoginType = () => {
    setLoginType((prev) => {
      if (prev === LoginType.Password) {
        return LoginType.ApiKey;
      } else {
        return LoginType.Password;
      }
    });
  };

  const { mutate: login, isPending: userNamePasswordRequestIsPending } =
    api.apiKeys.exchange.useMutation({
      onSuccess: (resp) => {
        setSettings({ ...settings, apiKey: resp.key, apiKeyId: resp.id });
      },
      onError: (e) => {
        if (e.data?.code === "UNAUTHORIZED") {
          setError("Wrong username or password");
        } else {
          setError(`${e.message}`);
        }
      },
    });

  const { mutate: validateApiKey, isPending: apiKeyValueRequestIsPending } =
    api.apiKeys.validate.useMutation({
      onSuccess: () => {
        const apiKey = apiKeyRef.current;
        setSettings({ ...settings, apiKey: apiKey });
      },
      onError: (e) => {
        if (e.data?.code === "UNAUTHORIZED") {
          setError("Invalid API key");
        } else {
          setError(`${e.message}`);
        }
      },
    });

  if (settings.apiKey) {
    return <Redirect href="dashboard" />;
  }

  const onSignin = () => {
    if (!tempServerAddress) {
      setError("Server address is required");
      return;
    }

    if (
      !tempServerAddress.startsWith("http://") &&
      !tempServerAddress.startsWith("https://")
    ) {
      setError("Server address must start with http:// or https://");
      return;
    }

    if (loginType === LoginType.Password) {
      const email = emailRef.current;
      const password = passwordRef.current;

      const randStr = (Math.random() + 1).toString(36).substring(5);
      login({
        email: email.trim(),
        password: password,
        keyName: `Mobile App: (${randStr})`,
      });
    } else if (loginType === LoginType.ApiKey) {
      const apiKey = apiKeyRef.current;
      validateApiKey({ apiKey: apiKey });
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex h-full flex-col justify-center gap-2 px-4">
          <View className="items-center">
            <TailwindResolver
              className="color-foreground"
              comp={(styles) => (
                <Logo
                  height={150}
                  width={250}
                  fill={styles?.color?.toString()}
                />
              )}
            />
          </View>
          {error && (
            <Text className="w-full text-center text-red-500">{error}</Text>
          )}
          <View className="gap-2">
            <Text className="font-bold">Server Address</Text>
            {!isEditingServerAddress ? (
              <View className="flex-row items-center gap-2">
                <View className="flex-1 rounded-md border border-border bg-card px-3 py-2">
                  <Text>{tempServerAddress}</Text>
                </View>
                <Button
                  size="icon"
                  variant="secondary"
                  onPress={() => {
                    setIsEditingServerAddress(true);
                  }}
                >
                  <TailwindResolver
                    comp={(styles) => (
                      <Edit3 size={16} color={styles?.color?.toString()} />
                    )}
                    className="color-foreground"
                  />
                </Button>
              </View>
            ) : (
              <View className="flex-row items-center gap-2">
                <Input
                  className="flex-1"
                  inputClasses="bg-card"
                  placeholder="Server Address"
                  value={tempServerAddress}
                  autoCapitalize="none"
                  keyboardType="url"
                  onChangeText={setTempServerAddress}
                  autoFocus
                />
                <Button
                  size="icon"
                  variant="primary"
                  onPress={() => {
                    if (tempServerAddress.trim()) {
                      setSettings({
                        ...settings,
                        address: tempServerAddress.trim().replace(/\/$/, ""),
                      });
                    }
                    setIsEditingServerAddress(false);
                  }}
                >
                  <TailwindResolver
                    comp={(styles) => (
                      <Check size={16} color={styles?.color?.toString()} />
                    )}
                    className="text-white"
                  />
                </Button>
              </View>
            )}
          </View>
          {loginType === LoginType.Password && (
            <>
              <View className="gap-2">
                <Text className="font-bold">Email</Text>
                <Input
                  className="w-full"
                  inputClasses="bg-card"
                  placeholder="Email"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  defaultValue={""}
                  onChangeText={(text) => (emailRef.current = text)}
                />
              </View>
              <View className="gap-2">
                <Text className="font-bold">Password</Text>
                <Input
                  className="w-full"
                  inputClasses="bg-card"
                  placeholder="Password"
                  secureTextEntry
                  defaultValue={""}
                  autoCapitalize="none"
                  textContentType="password"
                  onChangeText={(text) => (passwordRef.current = text)}
                />
              </View>
            </>
          )}

          {loginType === LoginType.ApiKey && (
            <View className="gap-2">
              <Text className="font-bold">API Key</Text>
              <Input
                className="w-full"
                inputClasses="bg-card"
                placeholder="API Key"
                secureTextEntry
                defaultValue={""}
                autoCapitalize="none"
                textContentType="password"
                onChangeText={(text) => (apiKeyRef.current = text)}
              />
            </View>
          )}

          <View className="flex flex-row items-center justify-between gap-2">
            <Button
              size="lg"
              androidRootClassName="flex-1"
              onPress={onSignin}
              disabled={
                userNamePasswordRequestIsPending || apiKeyValueRequestIsPending
              }
            >
              <Text>Sign In</Text>
            </Button>
            <Button
              size="icon"
              onPress={() => router.push("/test-connection")}
              disabled={!settings.address}
            >
              <TailwindResolver
                comp={(styles) => (
                  <Bug size={20} color={styles?.color?.toString()} />
                )}
                className="text-white"
              />
            </Button>
          </View>
          <Pressable onPress={toggleLoginType}>
            <Text className="mt-2 text-center text-gray-500">
              {loginType === LoginType.Password
                ? "Use API key instead?"
                : "Use password instead?"}
            </Text>
          </Pressable>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
