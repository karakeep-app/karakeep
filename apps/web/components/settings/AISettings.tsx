"use client";

import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
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
import { Switch } from "@/components/ui/switch";
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
  buildSummaryPromptUntruncated,
  buildTextPromptUntruncated,
} from "@karakeep/shared/prompts";
import {
  zNewPromptSchema,
  ZPrompt,
  zUpdatePromptSchema,
} from "@karakeep/shared/types/prompts";
import { zUpdateUserSettingsSchema } from "@karakeep/shared/types/users";

export function InferenceLanguageSelector() {
  const { t } = useTranslation();
  const settings = useUserSettings();
  const clientConfig = useClientConfig();

  const { mutate: updateSettings, isPending: isUpdating } =
    useUpdateUserSettings({
      onSuccess: () => {
        toast({
          description: "Inference language updated successfully!",
        });
      },
      onError: () => {
        toast({
          description: "Failed to update inference language",
          variant: "destructive",
        });
      },
    });

  const languageOptions = [
    { value: "english", label: "English" },
    { value: "spanish", label: "Español" },
    { value: "french", label: "Français" },
    { value: "german", label: "Deutsch" },
    { value: "italian", label: "Italiano" },
    { value: "portuguese", label: "Português" },
    { value: "russian", label: "Русский" },
    { value: "chinese", label: "中文" },
    { value: "japanese", label: "日本語" },
    { value: "korean", label: "한국어" },
    { value: "arabic", label: "العربية" },
    { value: "hindi", label: "हिन्दी" },
    { value: null, label: t("settings.ai.use_server_default") },
  ] as const;

  const selectedLanguage =
    settings?.inferredTagLang ?? clientConfig.inference.inferredTagLang;

  return (
    <div className="mt-4 space-y-3">
      <div className="text-xl font-medium">
        {t("settings.ai.inference_language")}
      </div>
      <p className="text-sm text-muted-foreground">
        {t("settings.ai.inference_language_description")}
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {languageOptions.map((option) => (
          <button
            key={option.value ?? "null"}
            type="button"
            onClick={() => {
              updateSettings({ inferredTagLang: option.value });
            }}
            disabled={isUpdating}
            className={`rounded-lg border p-3 text-left transition-all ${
              selectedLanguage === option.value
                ? "border-primary bg-primary/5 ring-2 ring-primary ring-offset-2"
                : "border-border hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            <div className="font-medium">{option.label}</div>
            {selectedLanguage === option.value && (
              <div className="mt-2 flex items-center justify-center">
                <div className="flex size-4 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  ✓
                </div>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TagStyleSelector() {
  const { t } = useTranslation();
  const settings = useUserSettings();

  const { mutate: updateSettings, isPending: isUpdating } =
    useUpdateUserSettings({
      onSuccess: () => {
        toast({
          description: "Tag style updated successfully!",
        });
      },
      onError: () => {
        toast({
          description: "Failed to update tag style",
          variant: "destructive",
        });
      },
    });

  const tagStyleOptions = [
    {
      value: "lowercase-hyphens",
      label: t("settings.ai.lowercase_hyphens"),
      examples: ["machine-learning", "web-development"],
    },
    {
      value: "lowercase-spaces",
      label: t("settings.ai.lowercase_spaces"),
      examples: ["machine learning", "web development"],
    },
    {
      value: "lowercase-underscores",
      label: t("settings.ai.lowercase_underscores"),
      examples: ["machine_learning", "web_development"],
    },
    {
      value: "titlecase-spaces",
      label: t("settings.ai.titlecase_spaces"),
      examples: ["Machine Learning", "Web Development"],
    },
    {
      value: "titlecase-hyphens",
      label: t("settings.ai.titlecase_hyphens"),
      examples: ["Machine-Learning", "Web-Development"],
    },
    {
      value: "camelCase",
      label: t("settings.ai.camelCase"),
      examples: ["machineLearning", "webDevelopment"],
    },
    {
      value: "as-generated",
      label: t("settings.ai.as_generated"),
      examples: ["Machine Learning", "web development", "AI_generated"],
    },
  ] as const;

  const selectedStyle = settings?.tagStyle ?? "as-generated";

  return (
    <div className="mt-4 space-y-3">
      <div className="text-xl font-medium">{t("settings.ai.tag_style")}</div>
      <p className="text-sm text-muted-foreground">
        {t("settings.ai.tag_style_description")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {tagStyleOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              updateSettings({ tagStyle: option.value });
            }}
            disabled={isUpdating}
            className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all ${
              selectedStyle === option.value
                ? "border-primary bg-primary/5 ring-2 ring-primary ring-offset-2"
                : "border-border hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            <div className="flex-1 space-y-1">
              <div className="font-medium">{option.label}</div>
              <div className="flex flex-wrap gap-1">
                {option.examples.map((example) => (
                  <Badge key={example} variant="secondary" className="text-xs">
                    {example}
                  </Badge>
                ))}
              </div>
            </div>
            {selectedStyle === option.value && (
              <div className="flex size-4 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                ✓
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AIPreferences() {
  const { t } = useTranslation();
  const clientConfig = useClientConfig();
  const settings = useUserSettings();

  const { mutate: updateSettings } = useUpdateUserSettings({
    onSuccess: () => {
      toast({
        description: "Settings updated successfully!",
      });
    },
    onError: () => {
      toast({
        description: "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  const form = useForm<z.infer<typeof zUpdateUserSettingsSchema>>({
    resolver: zodResolver(zUpdateUserSettingsSchema),
    values: settings
      ? {
          autoTaggingEnabled: settings.autoTaggingEnabled,
          autoSummarizationEnabled: settings.autoSummarizationEnabled,
        }
      : undefined,
  });

  const showAutoTagging = clientConfig.inference.enableAutoTagging;
  const showAutoSummarization = clientConfig.inference.enableAutoSummarization;

  // Don't show the section if neither feature is enabled on the server
  if (!showAutoTagging && !showAutoSummarization) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="mb-1 text-xs italic text-muted-foreground">
        {t("settings.ai.ai_preferences_description")}
      </p>
      <Form {...form}>
        <form className="space-y-4">
          {showAutoTagging && (
            <FormField
              control={form.control}
              name="autoTaggingEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>{t("settings.ai.auto_tagging")}</FormLabel>
                    <FormDescription>
                      {t("settings.ai.auto_tagging_description")}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value ?? true}
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                        updateSettings({ autoTaggingEnabled: checked });
                      }}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          )}

          {showAutoSummarization && (
            <FormField
              control={form.control}
              name="autoSummarizationEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>{t("settings.ai.auto_summarization")}</FormLabel>
                    <FormDescription>
                      {t("settings.ai.auto_summarization_description")}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value ?? true}
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                        updateSettings({ autoSummarizationEnabled: checked });
                      }}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          )}
        </form>
      </Form>
    </div>
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
  const settings = useUserSettings();
  const clientConfig = useClientConfig();

  const tagStyle = settings?.tagStyle ?? "as-generated";
  const inferredTagLang =
    settings?.inferredTagLang ?? clientConfig.inference.inferredTagLang;

  return (
    <div className="flex flex-col gap-2">
      <div className="mb-4 w-full text-xl font-medium sm:w-1/3">
        {t("settings.ai.prompt_preview")}
      </div>
      <p>{t("settings.ai.text_prompt")}</p>
      <code className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-muted-foreground">
        {buildTextPromptUntruncated(
          inferredTagLang,
          (prompts ?? [])
            .filter(
              (p) => p.appliesTo == "text" || p.appliesTo == "all_tagging",
            )
            .map((p) => p.text),
          "\n<CONTENT_HERE>\n",
          tagStyle,
        ).trim()}
      </code>
      <p>{t("settings.ai.images_prompt")}</p>
      <code className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-muted-foreground">
        {buildImagePrompt(
          inferredTagLang,
          (prompts ?? [])
            .filter(
              (p) => p.appliesTo == "images" || p.appliesTo == "all_tagging",
            )
            .map((p) => p.text),
          tagStyle,
        ).trim()}
      </code>
      <p>{t("settings.ai.summarization_prompt")}</p>
      <code className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-muted-foreground">
        {buildSummaryPromptUntruncated(
          inferredTagLang,
          (prompts ?? [])
            .filter((p) => p.appliesTo == "summary")
            .map((p) => p.text),
          "\n<CONTENT_HERE>\n",
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
        <div className="mb-2 flex flex-col gap-3">
          <div className="w-full text-2xl font-medium sm:w-1/3">
            {t("settings.ai.ai_settings")}
          </div>
          <AIPreferences />
          <InferenceLanguageSelector />
          <TagStyleSelector />
          <TaggingRules />
        </div>
      </div>
      <div className="mt-4 rounded-md border bg-background p-4">
        <PromptDemo />
      </div>
    </>
  );
}
