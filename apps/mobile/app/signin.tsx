import { useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
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
import { Bug } from "lucide-react-native";

enum LoginType {
  Password,
  ApiKey,
}

export default function Signin() {
  const { settings, setSettings } = useAppSettings();
  const router = useRouter();

  const [error, setError] = useState<string | undefined>();
  const [loginType, setLoginType] = useState<LoginType>(LoginType.Password);
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
        setSettings({ ...settings, apiKey: formState.apiKey });
      },
      onError: (e) => {
        if (e.data?.code === "UNAUTHORIZED") {
          setError("Invalid API key");
        } else {
          setError(`${e.message}`);
        }
      },
    });

  const [formState, setFormState] = useState<{
    serverAddress: string;
    email: string;
    password: string;
    apiKey: string;
  }>({
    serverAddress: "",
    email: "",
    password: "",
    apiKey: "",
  });

  if (settings.apiKey) {
    return <Redirect href="dashboard" />;
  }

  const onSignin = () => {
    if (!formState.serverAddress) {
      setError("Server address is required");
      return;
    }

    if (
      !formState.serverAddress.startsWith("http://") &&
      !formState.serverAddress.startsWith("https://")
    ) {
      setError("Server address must start with http:// or https://");
      return;
    }

    if (loginType === LoginType.Password) {
      const randStr = (Math.random() + 1).toString(36).substring(5);
      login({
        email: formState.email,
        password: formState.password,
        keyName: `Mobile App: (${randStr})`,
      });
    } else if (loginType === LoginType.ApiKey) {
      validateApiKey({ apiKey: formState.apiKey });
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
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
            <Input
              className="w-full"
              inputClasses="bg-card"
              placeholder="Server Address"
              value={formState.serverAddress}
              autoCapitalize="none"
              keyboardType="url"
              onChangeText={(e) => {
                setFormState((s) => ({ ...s, serverAddress: e }));
                setSettings({ ...settings, address: e.replace(/\/$/, "") });
              }}
            />
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
                  value={formState.email}
                  onChangeText={(e) =>
                    setFormState((s) => ({ ...s, email: e.trim() }))
                  }
                />
              </View>
              <View className="gap-2">
                <Text className="font-bold">Password</Text>
                <Input
                  className="w-full"
                  inputClasses="bg-card"
                  placeholder="Password"
                  secureTextEntry
                  value={formState.password}
                  autoCapitalize="none"
                  textContentType="password"
                  onChangeText={(e) =>
                    setFormState((s) => ({ ...s, password: e }))
                  }
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
                value={formState.apiKey}
                autoCapitalize="none"
                textContentType="password"
                onChangeText={(e) => setFormState((s) => ({ ...s, apiKey: e }))}
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
