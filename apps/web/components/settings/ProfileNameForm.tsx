"use client";

import { useRouter } from "next/navigation";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  setServerFormErrors,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { useSession } from "@/lib/auth/client";
import { useTranslation } from "@/lib/i18n/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useUpdateUserProfile } from "@karakeep/shared-react/hooks/users";
import { zUpdateUserProfileSchema } from "@karakeep/shared/types/users";

import { SaveBar } from "./SaveBar";
import { SavedHint, useSavedField } from "./SavedHint";
import { SettingsRow } from "./SettingsPage";

export default function ProfileNameForm({ name }: { name: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { refetch: refetchSession } = useSession();
  const { savedField, markSaved } = useSavedField<"name">();

  const form = useForm<
    z.input<typeof zUpdateUserProfileSchema>,
    unknown,
    z.output<typeof zUpdateUserProfileSchema>
  >({
    resolver: zodResolver(zUpdateUserProfileSchema),
    defaultValues: { name },
  });

  const { mutate, isPending } = useUpdateUserProfile({
    onSuccess: (_res, req) => {
      markSaved("name");
      form.reset({ name: req.name });
      // The account menu reads the name from the session.
      refetchSession();
      router.refresh();
    },
    onError: (e) => {
      if (!setServerFormErrors(form, e, { rejectedField: "name" })) {
        toast({
          description: e.message || t("common.something_went_wrong"),
          variant: "destructive",
        });
      }
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((value) => mutate(value))}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="space-y-0">
              <SettingsRow
                label={<FormLabel>{t("common.name")}</FormLabel>}
                description={t("settings.info.name_description")}
                hint={
                  <SavedHint
                    show={
                      savedField === "name" &&
                      !form.formState.isDirty &&
                      !form.formState.errors.name
                    }
                  />
                }
              >
                <FormControl>
                  <Input autoComplete="name" {...field} />
                </FormControl>
                <FormMessage className="mt-2" />
              </SettingsRow>
            </FormItem>
          )}
        />
        {form.formState.isDirty && (
          <SaveBar
            saving={isPending}
            saveLabel={t("bookmark_editor.save_changes")}
            onDiscard={() => form.reset()}
          />
        )}
      </form>
    </Form>
  );
}
