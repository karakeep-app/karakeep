"use client";

import type { z } from "zod";
import { ActionButton } from "@/components/ui/action-button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "@/components/ui/sonner";
import { changePassword } from "@/lib/auth/client";
import { useTranslation } from "@/lib/i18n/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import {
  PASSWORD_MIN_LENGTH,
  zChangePasswordSchema,
} from "@karakeep/shared/types/users";

import { humanAuthErrors } from "../signin/authFormErrors";
import { SavedHint, useSavedField } from "./SavedHint";
import {
  SettingsFormFooter,
  SettingsRow,
  SettingsRows,
  SettingsSection,
} from "./SettingsPage";

export function ChangePassword() {
  const { t } = useTranslation();
  const form = useForm<z.infer<typeof zChangePasswordSchema>>({
    // The API schema lets this one through empty, and the server would then
    // report it as wrong rather than missing.
    resolver: zodResolver(
      zChangePasswordSchema.refine((data) => data.currentPassword.length > 0, {
        message: t("form_errors.required"),
        path: ["currentPassword"],
      }),
      humanAuthErrors,
    ),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      newPasswordConfirm: "",
    },
  });

  const { savedField, markSaved } = useSavedField<"password">();

  const mutator = useMutation({
    mutationFn: async (input: {
      currentPassword: string;
      newPassword: string;
    }) => {
      const result = await changePassword(input);
      if (!result.ok) {
        throw new Error(result.code);
      }
    },
    onSuccess: () => {
      markSaved("password");
      form.reset();
    },
    onError: (e) => {
      if (e.message === "INVALID_PASSWORD") {
        form.setError(
          "currentPassword",
          { message: t("settings.info.current_password_incorrect") },
          { shouldFocus: true },
        );
      } else {
        toast({
          description: t("common.something_went_wrong"),
          variant: "destructive",
        });
      }
    },
  });

  async function onSubmit(value: z.infer<typeof zChangePasswordSchema>) {
    mutator.mutate({
      currentPassword: value.currentPassword,
      newPassword: value.newPassword,
    });
  }

  return (
    <SettingsSection id="security" title={t("settings.info.security")}>
      <Form {...form}>
        <form
          // POST so a submit before hydration doesn't put the password in the URL.
          method="post"
          noValidate
          className="space-y-2"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <SettingsRows>
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <SettingsRow
                    label={
                      <FormLabel htmlFor="current-password">
                        {t("settings.info.current_password")}
                      </FormLabel>
                    }
                  >
                    <FormControl>
                      <PasswordInput
                        id="current-password"
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="mt-2" />
                  </SettingsRow>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newPassword"
              render={({ field, fieldState }) => (
                <FormItem className="space-y-0">
                  <SettingsRow
                    label={
                      <FormLabel htmlFor="new-password">
                        {t("settings.info.new_password")}
                      </FormLabel>
                    }
                    // The error says the same thing when it's the length.
                    description={
                      fieldState.error
                        ? undefined
                        : t("settings.info.password_hint", {
                            count: PASSWORD_MIN_LENGTH,
                          })
                    }
                  >
                    <FormControl>
                      <PasswordInput
                        id="new-password"
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="mt-2" />
                  </SettingsRow>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newPasswordConfirm"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <SettingsRow
                    label={
                      <FormLabel htmlFor="confirm-password">
                        {t("settings.info.confirm_new_password")}
                      </FormLabel>
                    }
                  >
                    <FormControl>
                      <PasswordInput
                        id="confirm-password"
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="mt-2" />
                  </SettingsRow>
                </FormItem>
              )}
            />
          </SettingsRows>

          <SettingsFormFooter>
            <SavedHint
              show={savedField === "password" && !form.formState.isDirty}
            />
            <ActionButton type="submit" loading={mutator.isPending}>
              {t("settings.info.change_password")}
            </ActionButton>
          </SettingsFormFooter>
        </form>
      </Form>
    </SettingsSection>
  );
}
