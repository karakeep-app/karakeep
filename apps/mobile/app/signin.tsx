import type { TextInputProps } from "react-native";
import { forwardRef, useRef, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Redirect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Logo from "@/components/Logo";
import { TailwindResolver } from "@/components/TailwindResolver";
import { Button } from "@/components/ui/Button";
import ChevronRight from "@/components/ui/ChevronRight";
import { GroupedSection, RowSeparator } from "@/components/ui/GroupedList";
import { Text } from "@/components/ui/Text";
import useAppSettings from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

enum LoginType {
  Password,
  ApiKey,
}

const DEFAULT_SERVER_ADDRESS = "https://cloud.karakeep.app";
const CONNECTION_ERROR_MESSAGE =
  "Couldn’t connect to this Karakeep server. Check the server address and your internet connection, then try again.";

function getLoginErrorMessage(
  error: { data?: { code?: string } | null; message: string },
  unauthorizedMessage: string,
) {
  if (error.data?.code === "UNAUTHORIZED") {
    return unauthorizedMessage;
  }

  if (error.message.toLowerCase().includes("fetch failed")) {
    return CONNECTION_ERROR_MESSAGE;
  }

  return error.message;
}

// The logo artboard is 598x166; derive the width so it never letterboxes.
const LOGO_HEIGHT = 52;
const LOGO_WIDTH = Math.round((LOGO_HEIGHT * 598) / 166);

/**
 * A grouped-list row pairing a leading label with an inline text field.
 */
const LABEL_WIDTH = 104;

const FieldRow = forwardRef<TextInput, { label: string } & TextInputProps>(
  ({ label, ...props }, ref) => (
    <View className="flex-row items-center px-4">
      <Text className="py-3.5" style={{ width: LABEL_WIDTH }}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        className="flex-1 py-3.5 text-[17px] leading-6 text-foreground placeholder:text-muted-foreground/50"
        {...props}
      />
    </View>
  ),
);
FieldRow.displayName = "FieldRow";

export default function Signin() {
  const { settings, setSettings } = useAppSettings();
  const router = useRouter();
  const api = useTRPC();
  const [error, setError] = useState<string | undefined>();
  const [loginType, setLoginType] = useState<LoginType>(LoginType.Password);

  const emailRef = useRef<string>("");
  const passwordRef = useRef<string>("");
  const apiKeyRef = useRef<string>("");
  const passwordInputRef = useRef<TextInput>(null);

  const { mutate: login, isPending: userNamePasswordRequestIsPending } =
    useMutation(
      api.apiKeys.exchange.mutationOptions({
        onSuccess: (resp) => {
          setSettings({ ...settings, apiKey: resp.key, apiKeyId: resp.id });
        },
        onError: (e) => {
          setError(getLoginErrorMessage(e, "Wrong username or password"));
        },
      }),
    );

  const { mutate: validateApiKey, isPending: apiKeyValueRequestIsPending } =
    useMutation(
      api.apiKeys.validate.mutationOptions({
        onSuccess: () => {
          const apiKey = apiKeyRef.current;
          setSettings({ ...settings, apiKey: apiKey });
        },
        onError: (e) => {
          setError(getLoginErrorMessage(e, "Invalid API key"));
        },
      }),
    );

  if (settings.apiKey) {
    return <Redirect href="dashboard" />;
  }

  const isPending =
    userNamePasswordRequestIsPending || apiKeyValueRequestIsPending;
  const serverAddress = settings.address ?? DEFAULT_SERVER_ADDRESS;

  const onSignUp = async () => {
    const signupUrl = `${serverAddress}/signup?redirectUrl=${encodeURIComponent("karakeep://signin")}&skipSessionRedirect=1`;

    await WebBrowser.openAuthSessionAsync(signupUrl, "karakeep://signin");
  };

  const onSignin = () => {
    if (!settings.address) {
      setError("Server address is required");
      return;
    }

    if (
      !settings.address.startsWith("http://") &&
      !settings.address.startsWith("https://")
    ) {
      setError("Server address must start with http:// or https://");
      return;
    }

    setError(undefined);

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
    <>
      <KeyboardAwareScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          gap: 24,
          paddingHorizontal: 20,
          // Slight upward bias so the block doesn't sit dead centre.
          paddingTop: 24,
          paddingBottom: 88,
        }}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View className="items-center pb-6">
          <TailwindResolver
            className="color-foreground"
            comp={(styles) => (
              <Logo
                height={LOGO_HEIGHT}
                width={LOGO_WIDTH}
                fill={styles?.color?.toString()}
              />
            )}
          />
        </View>

        <View className="gap-3">
          <GroupedSection>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/server-address")}
              className="flex-row items-center px-4 active:opacity-70"
            >
              <Text className="py-3.5" style={{ width: LABEL_WIDTH }}>
                Server
              </Text>
              <Text className="flex-1 py-3.5" numberOfLines={1}>
                {serverAddress}
              </Text>
              <ChevronRight size={16} />
            </Pressable>

            {loginType === LoginType.Password ? (
              <>
                <RowSeparator />
                <FieldRow
                  label="Email"
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                  defaultValue={""}
                  onChangeText={(text) => (emailRef.current = text)}
                />
                <RowSeparator />
                <FieldRow
                  ref={passwordInputRef}
                  label="Password"
                  placeholder="Enter your password"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={onSignin}
                  defaultValue={""}
                  onChangeText={(text) => (passwordRef.current = text)}
                />
              </>
            ) : (
              <>
                <RowSeparator />
                <FieldRow
                  label="API Key"
                  placeholder="Paste your key"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={onSignin}
                  defaultValue={""}
                  onChangeText={(text) => (apiKeyRef.current = text)}
                />
              </>
            )}
          </GroupedSection>

          {error && (
            <View
              className="rounded-xl bg-destructive/10 px-4 py-3"
              style={{ borderCurve: "continuous" }}
            >
              <Text className="text-center text-sm text-destructive">
                {error}
              </Text>
            </View>
          )}

          <Button
            size="lg"
            className="w-full"
            androidRootClassName="w-full"
            onPress={onSignin}
            disabled={isPending}
          >
            {isPending && <ActivityIndicator size="small" color="white" />}
            <Text>{isPending ? "Signing in…" : "Sign In"}</Text>
          </Button>
        </View>

        <View className="items-center gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/test-connection")}
            disabled={!settings.address}
            hitSlop={8}
            className={cn(
              "active:opacity-60",
              !settings.address && "opacity-40",
            )}
          >
            <Text className="text-sm text-muted-foreground">
              Test connection
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setLoginType(
                loginType === LoginType.Password
                  ? LoginType.ApiKey
                  : LoginType.Password,
              );
              setError(undefined);
            }}
            hitSlop={8}
            className="active:opacity-60"
          >
            <Text className="text-sm text-muted-foreground">
              {loginType === LoginType.Password
                ? "Use an API key instead"
                : "Use your password instead"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onSignUp}
            hitSlop={8}
            className="active:opacity-60"
          >
            <Text className="text-sm text-muted-foreground">
              New to Karakeep?{" "}
              <Text className="text-sm font-medium text-primary">
                Create account
              </Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </>
  );
}
