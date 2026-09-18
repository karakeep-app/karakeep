import type { TextInputProps } from "react-native";
import { forwardRef, useRef, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Redirect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Logo from "@/components/Logo";
import { TailwindResolver } from "@/components/TailwindResolver";
import { Button } from "@/components/ui/Button";
import { GroupedSection, RowSeparator } from "@/components/ui/GroupedList";
import { Text } from "@/components/ui/Text";
import { useTranslation } from "@/lib/i18n/hooks";
import useAppSettings from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

enum LoginType {
  Password,
  ApiKey,
}

const DEFAULT_SERVER_ADDRESS = "https://cloud.karakeep.app";

function useLoginErrorMessage() {
  const { t } = useTranslation();
  const connectionError = t("auth.connection_error");
  return (
    error: { data?: { code?: string } | null; message: string },
    unauthorizedMessage: string,
  ) => {
    if (error.data?.code === "UNAUTHORIZED") {
      return unauthorizedMessage;
    }

    if (error.message.toLowerCase().includes("fetch failed")) {
      return connectionError;
    }

    return error.message;
  };
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
  const { t } = useTranslation();
  const router = useRouter();
  const api = useTRPC();
  const [error, setError] = useState<string | undefined>();
  const [loginType, setLoginType] = useState<LoginType>(LoginType.Password);
  const getLoginErrorMessage = useLoginErrorMessage();

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
          setError(getLoginErrorMessage(e, t("auth.wrong_credentials")));
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
          setError(getLoginErrorMessage(e, t("auth.invalid_api_key")));
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
      setError(t("auth.server_address_required"));
      return;
    }

    if (
      !settings.address.startsWith("http://") &&
      !settings.address.startsWith("https://")
    ) {
      setError(t("auth.server_address_protocol"));
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
            {loginType === LoginType.Password ? (
              <>
                <RowSeparator />
                <FieldRow
                  label={t("auth.email")}
                  placeholder={t("auth.email_placeholder")}
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
                  label={t("auth.password")}
                  placeholder={t("auth.password_placeholder")}
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
                  label={t("auth.api_key")}
                  placeholder={t("auth.api_key_placeholder")}
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
            <Text>{isPending ? t("auth.signing_in") : t("auth.sign_in")}</Text>
          </Button>
        </View>

        <View className="items-center gap-3">
          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/server-address")}
              hitSlop={8}
              className="flex-row items-center gap-1 active:opacity-60"
            >
              <Text className="text-sm text-blue-600">{serverAddress}</Text>
            </Pressable>
            <Text className="text-sm text-muted-foreground">|</Text>
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
                {t("auth.test_connection")}
              </Text>
            </Pressable>
          </View>
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
                ? t("auth.use_api_key")
                : t("auth.use_password")}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onSignUp}
            hitSlop={8}
            className="active:opacity-60"
          >
            <Text className="text-sm text-muted-foreground">
              {t("auth.new_to_karakeep")}{" "}
              <Text className="text-sm font-medium text-primary">
                {t("auth.create_account")}
              </Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </>
  );
}
