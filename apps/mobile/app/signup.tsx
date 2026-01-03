import { useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
import { z } from "zod";

import { zSignUpSchema } from "@karakeep/shared/types/users";

export default function Signup() {
  const { settings, setSettings } = useAppSettings();
  const router = useRouter();

  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof z.infer<typeof zSignUpSchema>, string>>
  >({});

  const nameRef = useRef<string>("");
  const emailRef = useRef<string>("");
  const passwordRef = useRef<string>("");
  const confirmPasswordRef = useRef<string>("");

  const { mutate: createUser, isPending: isCreatingUser } =
    api.users.create.useMutation({
      onSuccess: async () => {
        // After successful signup, automatically login
        await loginMutation({
          email: emailRef.current.trim(),
          password: passwordRef.current,
          keyName: `Mobile App: (${(Math.random() + 1).toString(36).substring(5)})`,
        });
      },
      onError: (e) => {
        setError(e.message);
      },
    });

  const { mutateAsync: loginMutation, isPending: isLoggingIn } =
    api.apiKeys.exchange.useMutation({
      onSuccess: (resp) => {
        setSettings({ ...settings, apiKey: resp.key, apiKeyId: resp.id });
        // Navigation will happen automatically via redirect
      },
      onError: (e) => {
        setError(
          `Account created but login failed: ${e.message}. Please sign in manually.`,
        );
        // Redirect to signin on login error
        setTimeout(() => {
          router.replace("/signin");
        }, 2000);
      },
    });

  // If already logged in, redirect to dashboard
  if (settings.apiKey) {
    return <Redirect href="dashboard" />;
  }

  const validateForm = (): boolean => {
    setError(undefined);
    setFieldErrors({});

    const formData = {
      name: nameRef.current.trim(),
      email: emailRef.current.trim(),
      password: passwordRef.current,
      confirmPassword: confirmPasswordRef.current,
    };

    try {
      zSignUpSchema.parse(formData);
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors: Partial<
          Record<keyof z.infer<typeof zSignUpSchema>, string>
        > = {};
        err.errors.forEach((error) => {
          const field = error.path[0] as keyof z.infer<typeof zSignUpSchema>;
          errors[field] = error.message;
        });
        setFieldErrors(errors);
        setError("Please fix the errors below");
      }
      return false;
    }
  };

  const onSignup = () => {
    if (!validateForm()) {
      return;
    }

    createUser({
      name: nameRef.current.trim(),
      email: emailRef.current.trim(),
      password: passwordRef.current,
      confirmPassword: confirmPasswordRef.current,
    });
  };

  const isPending = isCreatingUser || isLoggingIn;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex flex-1 flex-col justify-center gap-4 px-4 py-8">
            <View className="items-center">
              <TailwindResolver
                className="color-foreground"
                comp={(styles) => (
                  <Logo
                    height={120}
                    width={200}
                    fill={styles?.color?.toString()}
                  />
                )}
              />
            </View>

            <View className="gap-2">
              <Text className="text-center text-2xl font-bold">
                Create Your Account
              </Text>
              <Text className="text-center text-gray-500">
                Join Karakeep to start organizing your bookmarks
              </Text>
            </View>

            {error && (
              <View className="rounded-md bg-red-50 p-3 dark:bg-red-900/20">
                <Text className="text-center text-sm text-red-600 dark:text-red-400">
                  {error}
                </Text>
              </View>
            )}

            <View className="gap-3">
              <View className="gap-2">
                <Text className="font-bold">Full Name</Text>
                <Input
                  className="w-full"
                  inputClasses="bg-card"
                  placeholder="Enter your full name"
                  autoCapitalize="words"
                  defaultValue=""
                  onChangeText={(text) => {
                    nameRef.current = text;
                    if (fieldErrors.name) {
                      setFieldErrors({ ...fieldErrors, name: undefined });
                    }
                  }}
                  editable={!isPending}
                />
                {fieldErrors.name && (
                  <Text className="text-sm text-red-600 dark:text-red-400">
                    {fieldErrors.name}
                  </Text>
                )}
              </View>

              <View className="gap-2">
                <Text className="font-bold">Email</Text>
                <Input
                  className="w-full"
                  inputClasses="bg-card"
                  placeholder="Enter your email"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  defaultValue=""
                  onChangeText={(text) => {
                    emailRef.current = text;
                    if (fieldErrors.email) {
                      setFieldErrors({ ...fieldErrors, email: undefined });
                    }
                  }}
                  editable={!isPending}
                />
                {fieldErrors.email && (
                  <Text className="text-sm text-red-600 dark:text-red-400">
                    {fieldErrors.email}
                  </Text>
                )}
              </View>

              <View className="gap-2">
                <Text className="font-bold">Password</Text>
                <Input
                  className="w-full"
                  inputClasses="bg-card"
                  placeholder="Create a password (min. 8 characters)"
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                  defaultValue=""
                  onChangeText={(text) => {
                    passwordRef.current = text;
                    if (fieldErrors.password) {
                      setFieldErrors({ ...fieldErrors, password: undefined });
                    }
                  }}
                  editable={!isPending}
                />
                {fieldErrors.password && (
                  <Text className="text-sm text-red-600 dark:text-red-400">
                    {fieldErrors.password}
                  </Text>
                )}
              </View>

              <View className="gap-2">
                <Text className="font-bold">Confirm Password</Text>
                <Input
                  className="w-full"
                  inputClasses="bg-card"
                  placeholder="Confirm your password"
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                  defaultValue=""
                  onChangeText={(text) => {
                    confirmPasswordRef.current = text;
                    if (fieldErrors.confirmPassword) {
                      setFieldErrors({
                        ...fieldErrors,
                        confirmPassword: undefined,
                      });
                    }
                  }}
                  editable={!isPending}
                />
                {fieldErrors.confirmPassword && (
                  <Text className="text-sm text-red-600 dark:text-red-400">
                    {fieldErrors.confirmPassword}
                  </Text>
                )}
              </View>
            </View>

            <Button
              size="lg"
              onPress={onSignup}
              disabled={isPending}
              className="mt-2"
            >
              <Text className="text-white">
                {isPending ? "Creating Account..." : "Create Account"}
              </Text>
            </Button>

            <View className="mt-4">
              <Text className="text-center text-sm text-gray-500">
                Already have an account?{" "}
                <Text
                  className="font-medium text-blue-600 dark:text-blue-400"
                  onPress={() => router.back()}
                >
                  Sign in
                </Text>
              </Text>
            </View>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
