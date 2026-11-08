"use client";

import React from "react";
import { TagsEditor } from "@/components/dashboard/bookmarks/TagsEditor";
import {
  ActionButton,
  ActionButtonWithTooltip,
} from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  useFormErrors,
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
import { useUserSettings } from "@/lib/userSettings";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ScrollText, Trash2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import type { ZBookmarkTags } from "@karakeep/shared/types/tags";
import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";
import { useUpdateUserSettings } from "@karakeep/shared-react/hooks/users";
import { useTRPC } from "@karakeep/shared-react/trpc";
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

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SaveBar } from "./SaveBar";
import { SavedHint, useAutosavedSettings, useSavedField } from "./SavedHint";
import {
  SettingsPage,
  SettingsRow,
  SettingsRows,
  SettingsSection,
} from "./SettingsPage";

export function AIPreferences() {
  const { t } = useTranslation();
  const clientConfig = useClientConfig();
  const settings = useUserSettings();
  const { savedField, failedField, markSaved, markFailed } =
    useSavedField<"preferences">();

  const { mutate: updateSettings, isPending } = useUpdateUserSettings({
    onSuccess: () => {
      markSaved("preferences");
    },
    onError: () => {
      markFailed("preferences");
    },
  });

  const form = useForm<z.infer<typeof zUpdateUserSettingsSchema>>({
    resolver: zodResolver(zUpdateUserSettingsSchema, useFormErrors()),
    values: settings
      ? {
          // Clearing the input sets null, which must not count as a change.
          inferredTagLang: settings.inferredTagLang ?? null,
          autoTaggingEnabled: settings.autoTaggingEnabled,
          autoSummarizationEnabled: settings.autoSummarizationEnabled,
        }
      : undefined,
  });

  const showAutoTagging = clientConfig.inference.enableAutoTagging;
  const showAutoSummarization = clientConfig.inference.enableAutoSummarization;

  const onSubmit = (data: z.infer<typeof zUpdateUserSettingsSchema>) => {
    updateSettings(data, { onSuccess: () => form.reset(data) });
  };

  return (
    <SettingsSection
      title={t("settings.ai.preferences_title")}
      action={
        <SavedHint
          show={
            savedField === "preferences" &&
            Object.keys(form.formState.errors).length === 0
          }
          failed={failedField === "preferences"}
        />
      }
    >
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <SettingsRows>
          <Controller
            name="inferredTagLang"
            control={form.control}
            render={({ field, fieldState }) => (
              <SettingsRow
                label={
                  <FieldLabel htmlFor="inferredTagLang">
                    {t("settings.ai.inference_language")}
                  </FieldLabel>
                }
                description={t("settings.ai.inference_language_description")}
              >
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
                  <FieldError className="mt-2" errors={[fieldState.error]} />
                )}
              </SettingsRow>
            )}
          />

          {showAutoTagging && (
            <Controller
              name="autoTaggingEnabled"
              control={form.control}
              render={({ field, fieldState }) => (
                <SettingsRow
                  inline
                  label={
                    <FieldLabel htmlFor="autoTaggingEnabled">
                      {t("settings.ai.auto_tagging")}
                    </FieldLabel>
                  }
                  description={t("settings.ai.auto_tagging_description")}
                >
                  <Switch
                    id="autoTaggingEnabled"
                    name={field.name}
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                    aria-invalid={fieldState.invalid}
                  />
                </SettingsRow>
              )}
            />
          )}

          {showAutoSummarization && (
            <Controller
              name="autoSummarizationEnabled"
              control={form.control}
              render={({ field, fieldState }) => (
                <SettingsRow
                  inline
                  label={
                    <FieldLabel htmlFor="autoSummarizationEnabled">
                      {t("settings.ai.auto_summarization")}
                    </FieldLabel>
                  }
                  description={t("settings.ai.auto_summarization_description")}
                >
                  <Switch
                    id="autoSummarizationEnabled"
                    name={field.name}
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                    aria-invalid={fieldState.invalid}
                  />
                </SettingsRow>
              )}
            />
          )}
        </SettingsRows>

        {form.formState.isDirty && (
          <SaveBar
            saving={isPending}
            saveLabel={t("bookmark_editor.save_changes")}
            onDiscard={() => form.reset()}
          />
        )}
      </form>
    </SettingsSection>
  );
}

export function TagStyleSelector() {
  const { t } = useTranslation();
  const settings = useUserSettings();

  const {
    savedField,
    failedField,
    save: saveTagStyle,
  } = useAutosavedSettings<"tagStyle">();

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
      action={
        <SavedHint
          show={savedField === "tagStyle"}
          failed={failedField === "tagStyle"}
        />
      }
    >
      <RadioGroup
        value={selectedStyle}
        onValueChange={(value) => {
          saveTagStyle("tagStyle", {
            tagStyle: value as typeof selectedStyle,
          });
        }}
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
                      className="text-xs font-normal"
                    >
                      {example}
                    </Badge>
                  ))}
                </div>
              </FieldContent>
              <RadioGroupItem
                value={option.value}
                id={option.value}
                aria-label={option.label}
              />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </SettingsSection>
  );
}

export function CuratedTagsSelector() {
  const api = useTRPC();
  const { t } = useTranslation();
  const settings = useUserSettings();

  const { savedField, failedField, markSaved, markFailed } =
    useSavedField<"curatedTags">();
  const { mutate: updateSettings, isPending: isUpdatingCuratedTags } =
    useUpdateUserSettings({
      onSuccess: () => {
        markSaved("curatedTags");
      },
      onError: () => {
        markFailed("curatedTags");
      },
    });

  const areTagIdsEqual = React.useCallback((a: string[], b: string[]) => {
    return a.length === b.length && a.every((id, index) => id === b[index]);
  }, []);

  const curatedTagIds = React.useMemo(
    () => settings?.curatedTagIds ?? [],
    [settings?.curatedTagIds],
  );
  const [localCuratedTagIds, setLocalCuratedTagIds] =
    React.useState<string[]>(curatedTagIds);
  const debouncedCuratedTagIds = useDebounce(localCuratedTagIds, 300);
  const lastServerCuratedTagIdsRef = React.useRef(curatedTagIds);
  const lastSubmittedCuratedTagIdsRef = React.useRef<string[] | null>(null);

  React.useEffect(() => {
    const hadUnsyncedLocalChanges = !areTagIdsEqual(
      localCuratedTagIds,
      lastServerCuratedTagIdsRef.current,
    );

    if (
      !hadUnsyncedLocalChanges &&
      !areTagIdsEqual(localCuratedTagIds, curatedTagIds)
    ) {
      setLocalCuratedTagIds(curatedTagIds);
    }

    lastServerCuratedTagIdsRef.current = curatedTagIds;
  }, [areTagIdsEqual, curatedTagIds, localCuratedTagIds]);

  React.useEffect(() => {
    if (isUpdatingCuratedTags) {
      return;
    }

    if (areTagIdsEqual(debouncedCuratedTagIds, curatedTagIds)) {
      lastSubmittedCuratedTagIdsRef.current = null;
      return;
    }

    if (
      lastSubmittedCuratedTagIdsRef.current &&
      areTagIdsEqual(
        lastSubmittedCuratedTagIdsRef.current,
        debouncedCuratedTagIds,
      )
    ) {
      return;
    }

    lastSubmittedCuratedTagIdsRef.current = debouncedCuratedTagIds;
    updateSettings({
      curatedTagIds:
        debouncedCuratedTagIds.length > 0 ? debouncedCuratedTagIds : null,
    });
  }, [
    areTagIdsEqual,
    curatedTagIds,
    debouncedCuratedTagIds,
    isUpdatingCuratedTags,
    updateSettings,
  ]);

  // Fetch selected tags to display their names
  const { data: selectedTagsData } = useQuery(
    api.tags.list.queryOptions(
      { ids: localCuratedTagIds },
      { enabled: localCuratedTagIds.length > 0 },
    ),
  );

  const selectedTags: ZBookmarkTags[] = React.useMemo(() => {
    const tagsMap = new Map(
      (selectedTagsData?.tags ?? []).map((tag) => [tag.id, tag]),
    );
    // Preserve the order from curatedTagIds instead of server sort order
    return localCuratedTagIds
      .map((id) => tagsMap.get(id))
      .filter((tag): tag is NonNullable<typeof tag> => tag != null)
      .map((tag) => ({
        id: tag.id,
        name: tag.name,
        attachedBy: "human" as const,
      }));
  }, [selectedTagsData?.tags, localCuratedTagIds]);

  return (
    <SettingsSection
      title={t("settings.ai.curated_tags")}
      description={t("settings.ai.curated_tags_description")}
      action={
        <SavedHint
          show={savedField === "curatedTags"}
          failed={failedField === "curatedTags"}
        />
      }
    >
      <TagsEditor
        tags={selectedTags}
        placeholder={t("settings.ai.curated_tags_placeholder")}
        onAttach={(tag) => {
          const tagId = tag.tagId;
          if (tagId) {
            setLocalCuratedTagIds((prev) => {
              if (prev.includes(tagId)) {
                return prev;
              }
              return [...prev, tagId];
            });
          }
        }}
        onDetach={(tag) => {
          setLocalCuratedTagIds((prev) => {
            return prev.filter((id) => id !== tag.tagId);
          });
        }}
        allowCreation={false}
      />
    </SettingsSection>
  );
}

export function PromptEditor() {
  const api = useTRPC();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof zNewPromptSchema>>({
    resolver: zodResolver(
      zNewPromptSchema,
      useFormErrors({ text: t("settings.ai.prompt_required") }),
    ),
    defaultValues: {
      text: "",
      appliesTo: "all_tagging",
    },
  });

  const { mutateAsync: createPrompt, isPending: isCreating } = useMutation(
    api.prompts.create.mutationOptions({
      onSuccess: () => {
        toast({
          description: t("settings.ai.prompt_created"),
        });
        queryClient.invalidateQueries(api.prompts.list.pathFilter());
      },
    }),
  );

  return (
    <Form {...form}>
      <form
        className="flex flex-wrap gap-2 sm:flex-nowrap"
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
              <FormItem className="min-w-full flex-1 sm:min-w-0">
                <FormControl>
                  <Input
                    placeholder={t("settings.ai.add_custom_prompt")}
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
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger aria-label={t("settings.ai.applies_to")}>
                      <SelectValue placeholder={t("settings.ai.applies_to")} />
                    </SelectTrigger>
                  </FormControl>
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
          <Plus className="size-4" />
          {t("actions.add")}
        </ActionButton>
      </form>
    </Form>
  );
}

export function PromptRow({ prompt }: { prompt: ZPrompt }) {
  const api = useTRPC();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { savedField, markSaved } = useSavedField<"prompt">();
  const { mutateAsync: updatePrompt, isPending: isUpdating } = useMutation(
    api.prompts.update.mutationOptions({
      onSuccess: () => {
        markSaved("prompt");
        queryClient.invalidateQueries(api.prompts.list.pathFilter());
      },
    }),
  );
  const { mutate: deletePrompt, isPending: isDeleting } = useMutation(
    api.prompts.delete.mutationOptions({
      onSuccess: () => {
        toast({
          description: t("settings.ai.prompt_deleted"),
        });
        queryClient.invalidateQueries(api.prompts.list.pathFilter());
      },
    }),
  );

  const form = useForm<z.infer<typeof zUpdatePromptSchema>>({
    resolver: zodResolver(
      zUpdatePromptSchema,
      useFormErrors({ text: t("settings.ai.prompt_required") }),
    ),
    defaultValues: {
      promptId: prompt.id,
      text: prompt.text,
      appliesTo: prompt.appliesTo,
    },
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-wrap gap-2 sm:flex-nowrap"
        onSubmit={form.handleSubmit(async (value) => {
          await updatePrompt(value);
          form.reset(value);
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
              <FormItem className="min-w-full flex-1 sm:min-w-0">
                <FormControl>
                  <Input
                    placeholder={t("settings.ai.add_custom_prompt")}
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
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger aria-label={t("settings.ai.applies_to")}>
                      <SelectValue placeholder={t("settings.ai.applies_to")} />
                    </SelectTrigger>
                  </FormControl>
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
                <FormMessage />
              </FormItem>
            );
          }}
        />
        <SavedHint
          show={
            savedField === "prompt" &&
            !form.formState.isDirty &&
            Object.keys(form.formState.errors).length === 0
          }
        />
        {form.formState.isDirty && (
          <ActionButton
            loading={isUpdating}
            variant="outline"
            type="submit"
            className="items-center"
          >
            {t("actions.save")}
          </ActionButton>
        )}
        <ActionButtonWithTooltip
          loading={isDeleting}
          variant="ghost"
          size="icon"
          aria-label={t("actions.delete")}
          tooltip={t("actions.delete")}
          onClick={() => deletePrompt({ promptId: prompt.id })}
          className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
          type="button"
        >
          <Trash2 className="size-4" />
        </ActionButtonWithTooltip>
      </form>
    </Form>
  );
}

export function TaggingRules() {
  const api = useTRPC();
  const { t } = useTranslation();
  const { data: prompts, isLoading } = useQuery(
    api.prompts.list.queryOptions(),
  );

  return (
    <SettingsSection
      title={t("settings.ai.tagging_rules")}
      description={t("settings.ai.tagging_rule_description")}
    >
      {prompts && prompts.length == 0 && (
        <Empty className="p-4 md:p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScrollText />
            </EmptyMedia>
            <EmptyTitle className="text-base">
              {t("settings.ai.no_custom_prompts")}
            </EmptyTitle>
            <EmptyDescription>
              {t("settings.ai.no_custom_prompts_description")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
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

/**
 * Expand $tags / $aiTags / $userTags placeholders in custom prompt texts so
 * that the preview panel shows exactly what will be sent to the AI.
 *
 * The logic mirrors apps/workers/workers/inference/tagging.ts
 * `replaceTagsPlaceholders` to keep the preview accurate.
 */
function expandTagPlaceholders(
  texts: string[],
  tags: { name: string; numBookmarksByAttachedType: Record<string, number> }[],
): string[] {
  const tagsStr = `[${tags.map((t) => t.name).join(", ")}]`;
  const aiTagsStr = `[${tags
    .filter((t) => t.numBookmarksByAttachedType["human"] ?? true)
    .map((t) => t.name)
    .join(", ")}]`;
  const userTagsStr = `[${tags
    .filter((t) => t.numBookmarksByAttachedType["human"] ?? false)
    .map((t) => t.name)
    .join(", ")}]`;

  return texts.map((text) =>
    text
      .replaceAll("$tags", tagsStr)
      .replaceAll("$aiTags", aiTagsStr)
      .replaceAll("$userTags", userTagsStr),
  );
}

function hasTagPlaceholder(texts: string[]): boolean {
  return texts.some(
    (t) =>
      t.includes("$tags") || t.includes("$aiTags") || t.includes("$userTags"),
  );
}

export function PromptDemo() {
  const api = useTRPC();
  const { t } = useTranslation();
  const { data: prompts } = useQuery(api.prompts.list.queryOptions());
  const settings = useUserSettings();
  const clientConfig = useClientConfig();

  const tagStyle = settings?.tagStyle ?? "as-generated";
  const curatedTagIds = settings?.curatedTagIds ?? [];
  const { data: tagsData } = useQuery(
    api.tags.list.queryOptions(
      { ids: curatedTagIds },
      { enabled: curatedTagIds.length > 0 },
    ),
  );
  const inferredTagLang =
    settings?.inferredTagLang ?? clientConfig.inference.inferredTagLang;

  // Resolve curated tag names for preview
  const curatedTagNames =
    curatedTagIds.length > 0 && tagsData?.tags
      ? curatedTagIds
          .map((id) => tagsData.tags.find((tag) => tag.id === id)?.name)
          .filter((name): name is string => Boolean(name))
      : undefined;

  // Detect whether any prompt uses a tag-list placeholder ($tags / $aiTags / $userTags)
  const allPromptTexts = (prompts ?? []).map((p) => p.text);
  const needsTagExpansion = hasTagPlaceholder(allPromptTexts);

  // Fetch all tags only when a placeholder is actually used (avoids an
  // unnecessary round-trip for users who don't use this feature).
  const { data: allTagsData } = useQuery(
    api.tags.list.queryOptions({}, { enabled: needsTagExpansion }),
  );

  // Build a function that expands placeholders in a list of prompt texts.
  const withTagsExpanded = React.useCallback(
    (texts: string[]): string[] => {
      if (!needsTagExpansion || !allTagsData?.tags) return texts;
      return expandTagPlaceholders(texts, allTagsData.tags);
    },
    [needsTagExpansion, allTagsData],
  );

  return (
    <SettingsSection
      title={t("settings.ai.prompt_preview")}
      description={t("settings.ai.prompt_preview_description")}
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium">
            {t("settings.ai.text_prompt")}
          </p>
          <code className="block whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-muted-foreground">
            {buildTextPromptUntruncated(
              inferredTagLang,
              withTagsExpanded(
                (prompts ?? [])
                  .filter(
                    (p) =>
                      p.appliesTo == "text" || p.appliesTo == "all_tagging",
                  )
                  .map((p) => p.text),
              ),
              "\n<CONTENT_HERE>\n",
              tagStyle,
              curatedTagNames,
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
              withTagsExpanded(
                (prompts ?? [])
                  .filter(
                    (p) =>
                      p.appliesTo == "images" || p.appliesTo == "all_tagging",
                  )
                  .map((p) => p.text),
              ),
              tagStyle,
              curatedTagNames,
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
              withTagsExpanded(
                (prompts ?? [])
                  .filter((p) => p.appliesTo == "summary")
                  .map((p) => p.text),
              ),
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
    <SettingsPage
      title={t("settings.ai.ai_settings")}
      description={t("settings.ai.page_description")}
    >
      <AIPreferences />
      <TagStyleSelector />
      <CuratedTagsSelector />
      <TaggingRules />
      <PromptDemo />
    </SettingsPage>
  );
}
