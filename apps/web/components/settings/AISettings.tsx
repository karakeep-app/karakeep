"use client";

import { useEffect } from "react";
import { ActionButton } from "@/components/ui/action-button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { useUserSettings } from "@/lib/userSettings";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Save, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useUpdateUserSettings } from "@karakeep/shared-react/hooks/users";
import {
  buildImagePrompt,
  buildSummaryPrompt,
  buildTextPrompt,
} from "@karakeep/shared/prompts";
import {
  zNewPromptSchema,
  ZPrompt,
  zUpdatePromptSchema,
} from "@karakeep/shared/types/prompts";
import { zUserSettingsSchema } from "@karakeep/shared/types/users";

const inferenceLanguageFormSchema = z.object({
  inferenceLanguage: zUserSettingsSchema.shape.inferenceLanguage,
});

function InferenceLanguageForm() {
  const { t } = useTranslation();
  const clientConfig = useClientConfig();
  const userSettings = useUserSettings();
  const { mutate, isPending } = useUpdateUserSettings({
    onSuccess: () => {
      toast({
        description: t("settings.info.user_settings.user_settings_updated"),
      });
    },
    onError: () => {
      toast({
        description: t("common.something_went_wrong"),
        variant: "destructive",
      });
    },
  });

  const form = useForm<z.infer<typeof inferenceLanguageFormSchema>>({
    resolver: zodResolver(inferenceLanguageFormSchema),
    defaultValues: {
      inferenceLanguage: userSettings.inferenceLanguage,
    },
  });

  useEffect(() => {
    form.reset({ inferenceLanguage: userSettings.inferenceLanguage });
  }, [form, userSettings.inferenceLanguage]);

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
        onSubmit={form.handleSubmit(({ inferenceLanguage }) => {
          if (inferenceLanguage === userSettings.inferenceLanguage) {
            return;
          }
          mutate({ inferenceLanguage });
        })}
      >
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">
            {t("settings.ai.inference_language.label")}
          </p>
          <FormField
            control={form.control}
            name="inferenceLanguage"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={clientConfig.inference.inferredTagLang}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <p className="text-xs text-muted-foreground">
            {t("settings.ai.inference_language.description", {
              defaultLang: clientConfig.inference.inferredTagLang,
            })}
          </p>
        </div>
        <ActionButton type="submit" loading={isPending} className="sm:w-auto">
          <Save className="mr-2 size-4" />
          {t("actions.save")}
        </ActionButton>
      </form>
    </Form>
  );
}

export function PromptEditor() {
  const { t } = useTranslation();
  const apiUtils = api.useUtils();

  const form = useForm<z.infer<typeof zNewPromptSchema>>({
    resolver: zodResolver(zNewPromptSchema),
    defaultValues: {
      text: "",
      appliesTo: "all_tagging",
    },
  });

  const { mutateAsync: createPrompt, isPending: isCreating } =
    api.prompts.create.useMutation({
      onSuccess: () => {
        toast({
          description: "Prompt has been created!",
        });
        apiUtils.prompts.list.invalidate();
      },
    });

  return (
    <Form {...form}>
      <form
        className="flex gap-2"
        onSubmit={form.handleSubmit(async (value) => {
          await createPrompt(value);
          form.resetField("text");
        })}
      >
        <FormField
          control={form.control}
          name="text"
          render={({ field }) => {
            return (
              <FormItem className="flex-1">
                <FormControl>
                  <Input
                    placeholder="Add a custom prompt"
                    type="text"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <FormField
          control={form.control}
          name="appliesTo"
          render={({ field }) => {
            return (
              <FormItem className="flex-0">
                <FormControl>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Applies To" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all_tagging">
                          {t("settings.ai.all_tagging")}
                        </SelectItem>
                        <SelectItem value="text">
                          {t("settings.ai.text_tagging")}
                        </SelectItem>
                        <SelectItem value="images">
                          {t("settings.ai.image_tagging")}
                        </SelectItem>
                        <SelectItem value="summary">
                          {t("settings.ai.summarization")}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
        <ActionButton
          type="submit"
          loading={isCreating}
          variant="default"
          className="items-center"
        >
          <Plus className="mr-2 size-4" />
          {t("actions.add")}
        </ActionButton>
      </form>
    </Form>
  );
}

export function PromptRow({ prompt }: { prompt: ZPrompt }) {
  const { t } = useTranslation();
  const apiUtils = api.useUtils();
  const { mutateAsync: updatePrompt, isPending: isUpdating } =
    api.prompts.update.useMutation({
      onSuccess: () => {
        toast({
          description: "Prompt has been updated!",
        });
        apiUtils.prompts.list.invalidate();
      },
    });
  const { mutate: deletePrompt, isPending: isDeleting } =
    api.prompts.delete.useMutation({
      onSuccess: () => {
        toast({
          description: "Prompt has been deleted!",
        });
        apiUtils.prompts.list.invalidate();
      },
    });

  const form = useForm<z.infer<typeof zUpdatePromptSchema>>({
    resolver: zodResolver(zUpdatePromptSchema),
    defaultValues: {
      promptId: prompt.id,
      text: prompt.text,
      appliesTo: prompt.appliesTo,
    },
  });

  return (
    <Form {...form}>
      <form
        className="flex gap-2"
        onSubmit={form.handleSubmit(async (value) => {
          await updatePrompt(value);
        })}
      >
        <FormField
          control={form.control}
          name="promptId"
          render={({ field }) => {
            return (
              <FormItem className="hidden">
                <FormControl>
                  <Input type="hidden" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
        <FormField
          control={form.control}
          name="text"
          render={({ field }) => {
            return (
              <FormItem className="flex-1">
                <FormControl>
                  <Input
                    placeholder="Add a custom prompt"
                    type="text"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <FormField
          control={form.control}
          name="appliesTo"
          render={({ field }) => {
            return (
              <FormItem className="flex-0">
                <FormControl>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Applies To" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all_tagging">
                          {t("settings.ai.all_tagging")}
                        </SelectItem>
                        <SelectItem value="text">
                          {t("settings.ai.text_tagging")}
                        </SelectItem>
                        <SelectItem value="images">
                          {t("settings.ai.image_tagging")}
                        </SelectItem>
                        <SelectItem value="summary">
                          {t("settings.ai.summarization")}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
        <ActionButton
          loading={isUpdating}
          variant="secondary"
          type="submit"
          className="items-center"
        >
          <Save className="mr-2 size-4" />
          {t("actions.save")}
        </ActionButton>
        <ActionButton
          loading={isDeleting}
          variant="destructive"
          onClick={() => deletePrompt({ promptId: prompt.id })}
          className="items-center"
          type="button"
        >
          <Trash2 className="mr-2 size-4" />
          {t("actions.delete")}
        </ActionButton>
      </form>
    </Form>
  );
}

export function TaggingRules() {
  const { t } = useTranslation();
  const { data: prompts, isLoading } = api.prompts.list.useQuery();

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="w-full text-xl font-medium sm:w-1/3">
        {t("settings.ai.tagging_rules")}
      </div>
      <p className="mb-1 text-xs italic text-muted-foreground">
        {t("settings.ai.tagging_rule_description")}
      </p>
      {isLoading && <FullPageSpinner />}
      {prompts && prompts.length == 0 && (
        <p className="rounded-md bg-muted p-2 text-sm text-muted-foreground">
          You don&apos;t have any custom prompts yet.
        </p>
      )}
      {prompts &&
        prompts.map((prompt) => <PromptRow key={prompt.id} prompt={prompt} />)}
      <PromptEditor />
    </div>
  );
}

export function PromptDemo() {
  const { t } = useTranslation();
  const { data: prompts } = api.prompts.list.useQuery();
  const clientConfig = useClientConfig();
  const userSettings = useUserSettings();
  const inferenceLanguage =
    userSettings.inferenceLanguage?.trim() ||
    clientConfig.inference.inferredTagLang;
  return (
    <div className="flex flex-col gap-2">
      <div className="mb-4 w-full text-xl font-medium sm:w-1/3">
        {t("settings.ai.prompt_preview")}
      </div>
      <p>{t("settings.ai.text_prompt")}</p>
      <code className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-muted-foreground">
        {buildTextPrompt(
          inferenceLanguage,
          (prompts ?? [])
            .filter(
              (p) => p.appliesTo == "text" || p.appliesTo == "all_tagging",
            )
            .map((p) => p.text),
          "\n<CONTENT_HERE>\n",
          /* context length */ 1024 /* The value here doesn't matter */,
        ).trim()}
      </code>
      <p>{t("settings.ai.images_prompt")}</p>
      <code className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-muted-foreground">
        {buildImagePrompt(
          inferenceLanguage,
          (prompts ?? [])
            .filter(
              (p) => p.appliesTo == "images" || p.appliesTo == "all_tagging",
            )
            .map((p) => p.text),
        ).trim()}
      </code>
      <p>{t("settings.ai.summarization_prompt")}</p>
      <code className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-muted-foreground">
        {buildSummaryPrompt(
          inferenceLanguage,
          (prompts ?? [])
            .filter((p) => p.appliesTo == "summary")
            .map((p) => p.text),
          "\n<CONTENT_HERE>\n",
          /* context length */ 1024 /* The value here doesn't matter */,
        ).trim()}
      </code>
    </div>
  );
}

export default function AISettings() {
  const { t } = useTranslation();
  return (
    <>
      <div className="rounded-md border bg-background p-4">
        <div className="space-y-6">
          <div className="w-full text-2xl font-medium sm:w-1/3">
            {t("settings.ai.ai_settings")}
          </div>
          <InferenceLanguageForm />
          <TaggingRules />
        </div>
      </div>
      <div className="mt-4 rounded-md border bg-background p-4">
        <PromptDemo />
      </div>
    </>
  );
}
