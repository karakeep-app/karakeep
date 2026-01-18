"use client";

import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { useUserSettings } from "@/lib/userSettings";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Plus, Save, Trash2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
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

function SettingsSection({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card>
      <CardHeader>
        {title && <CardTitle>{title}</CardTitle>}
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function AIPreferences() {
  const { t } = useTranslation();
  const clientConfig = useClientConfig();
  const settings = useUserSettings();

  const { mutate: updateSettings, isPending } = useUpdateUserSettings({
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
          inferredTagLang: settings.inferredTagLang ?? "",
          autoTaggingEnabled: settings.autoTaggingEnabled,
          autoSummarizationEnabled: settings.autoSummarizationEnabled,
        }
      : undefined,
  });

  const showAutoTagging = clientConfig.inference.enableAutoTagging;
  const showAutoSummarization = clientConfig.inference.enableAutoSummarization;

  const onSubmit = (data: z.infer<typeof zUpdateUserSettingsSchema>) => {
    updateSettings(data);
  };

  return (
    <SettingsSection title="AI preferences">
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FieldGroup className="gap-3">
          <Controller
            name="inferredTagLang"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field
                className="rounded-lg border p-3"
                data-invalid={fieldState.invalid}
              >
                <FieldContent>
                  <FieldLabel htmlFor="inferredTagLang">
                    {t("settings.ai.inference_language")}
                  </FieldLabel>
                  <FieldDescription>
                    {t("settings.ai.inference_language_description")}
                  </FieldDescription>
                </FieldContent>
                <Input
                  {...field}
                  id="inferredTagLang"
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value.length > 0 ? e.target.value : null,
                    )
                  }
                  aria-invalid={fieldState.invalid}
                  placeholder={`Default (${clientConfig.inference.inferredTagLang})`}
                  type="text"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          {showAutoTagging && (
            <Controller
              name="autoTaggingEnabled"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field
                  orientation="horizontal"
                  className="rounded-lg border p-3"
                  data-invalid={fieldState.invalid}
                >
                  <FieldContent>
                    <FieldLabel htmlFor="autoTaggingEnabled">
                      {t("settings.ai.auto_tagging")}
                    </FieldLabel>
                    <FieldDescription>
                      {t("settings.ai.auto_tagging_description")}
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="autoTaggingEnabled"
                    name={field.name}
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          )}

          {showAutoSummarization && (
            <Controller
              name="autoSummarizationEnabled"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field
                  orientation="horizontal"
                  className="rounded-lg border p-3"
                  data-invalid={fieldState.invalid}
                >
                  <FieldContent>
                    <FieldLabel htmlFor="autoSummarizationEnabled">
                      {t("settings.ai.auto_summarization")}
                    </FieldLabel>
                    <FieldDescription>
                      {t("settings.ai.auto_summarization_description")}
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="autoSummarizationEnabled"
                    name={field.name}
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          )}

          <div className="flex justify-end pt-4">
            <ActionButton type="submit" loading={isPending} variant="default">
              <Save className="mr-2 size-4" />
              {t("actions.save")}
            </ActionButton>
          </div>
        </FieldGroup>
      </form>
    </SettingsSection>
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
      label: t("settings.ai.no_preference"),
      examples: ["Machine Learning", "web development", "AI_generated"],
    },
  ] as const;

  const selectedStyle = settings?.tagStyle ?? "as-generated";

  return (
    <SettingsSection
      title={t("settings.ai.tag_style")}
      description={t("settings.ai.tag_style_description")}
    >
      <RadioGroup
        value={selectedStyle}
        onValueChange={(value) => {
          updateSettings({ tagStyle: value as typeof selectedStyle });
        }}
        disabled={isUpdating}
        className="grid gap-3 sm:grid-cols-2"
      >
        {tagStyleOptions.map((option) => (
          <FieldLabel
            key={option.value}
            htmlFor={option.value}
            className={cn(selectedStyle === option.value && "ring-1")}
          >
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{option.label}</FieldTitle>
                <div className="flex flex-wrap gap-1">
                  {option.examples.map((example) => (
                    <Badge
                      key={example}
                      variant="secondary"
                      className="text-xs font-light"
                    >
                      {example}
                    </Badge>
                  ))}
                </div>
              </FieldContent>
              <RadioGroupItem value={option.value} id={option.value} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </SettingsSection>
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
    <SettingsSection
      title={t("settings.ai.tagging_rules")}
      description={t("settings.ai.tagging_rule_description")}
    >
      {prompts && prompts.length == 0 && (
        <div className="flex items-start gap-2 rounded-md bg-muted p-4 text-sm text-muted-foreground">
          <Info className="size-4 flex-shrink-0" />
          <p>You don&apos;t have any custom prompts yet.</p>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {isLoading && <FullPageSpinner />}
        {prompts &&
          prompts.map((prompt) => (
            <PromptRow key={prompt.id} prompt={prompt} />
          ))}
        <PromptEditor />
      </div>
    </SettingsSection>
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
    <SettingsSection
      title={t("settings.ai.prompt_preview")}
      description="Preview the actual prompts sent to AI based on your settings"
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium">
            {t("settings.ai.text_prompt")}
          </p>
          <code className="block whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-muted-foreground">
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
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">
            {t("settings.ai.images_prompt")}
          </p>
          <code className="block whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-muted-foreground">
            {buildImagePrompt(
              inferredTagLang,
              (prompts ?? [])
                .filter(
                  (p) =>
                    p.appliesTo == "images" || p.appliesTo == "all_tagging",
                )
                .map((p) => p.text),
              tagStyle,
            ).trim()}
          </code>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">
            {t("settings.ai.summarization_prompt")}
          </p>
          <code className="block whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-muted-foreground">
            {buildSummaryPromptUntruncated(
              inferredTagLang,
              (prompts ?? [])
                .filter((p) => p.appliesTo == "summary")
                .map((p) => p.text),
              "\n<CONTENT_HERE>\n",
            ).trim()}
          </code>
        </div>
      </div>
    </SettingsSection>
  );
}

export default function AISettings() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">
        {t("settings.ai.ai_settings")}
      </h2>

      {/* AI Preferences */}
      <AIPreferences />

      {/* Tag Style */}
      <TagStyleSelector />

      {/* Tagging Rules */}
      <TaggingRules />

      {/* Prompt Preview */}
      <PromptDemo />
    </div>
  );
}
