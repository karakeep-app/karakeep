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
  Form,
  FormControl,
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
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/use-toast";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, Image, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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

function getPromptTypeInfo(appliesTo: string) {
  switch (appliesTo) {
    case "all_tagging":
      return { icon: Sparkles, variant: "default" as const };
    case "text":
      return { icon: FileText, variant: "secondary" as const };
    case "images":
      return { icon: Image, variant: "secondary" as const };
    case "summary":
      return { icon: FileText, variant: "outline" as const };
    default:
      return { icon: Sparkles, variant: "default" as const };
  }
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
    <Card className="border-dashed bg-muted/50">
      <CardContent className="pt-6">
        <Form {...form}>
          <form
            className="flex flex-col gap-4 sm:flex-row sm:gap-2"
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
                        placeholder="e.g., Always include sentiment analysis in tags"
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
                  <FormItem className="w-full sm:w-auto">
                    <FormControl>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <SelectTrigger className="w-full sm:w-[180px]">
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
              className="w-full items-center sm:w-auto"
            >
              <Plus className="mr-2 size-4" />
              {t("actions.add")}
            </ActionButton>
          </form>
        </Form>
      </CardContent>
    </Card>
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

  const typeInfo = getPromptTypeInfo(form.watch("appliesTo"));
  const TypeIcon = typeInfo.icon;

  return (
    <Card>
      <CardContent className="pt-6">
        <Form {...form}>
          <form
            className="flex flex-col gap-4 sm:flex-row sm:gap-2"
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
            <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:gap-2">
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
                    <FormItem className="w-full sm:w-auto">
                      <FormControl>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <SelectTrigger className="w-full sm:w-[180px]">
                            <div className="flex items-center gap-2">
                              <TypeIcon className="size-4" />
                              <SelectValue placeholder="Applies To" />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="all_tagging">
                                <div className="flex items-center gap-2">
                                  <Sparkles className="size-4" />
                                  {t("settings.ai.all_tagging")}
                                </div>
                              </SelectItem>
                              <SelectItem value="text">
                                <div className="flex items-center gap-2">
                                  <FileText className="size-4" />
                                  {t("settings.ai.text_tagging")}
                                </div>
                              </SelectItem>
                              <SelectItem value="images">
                                <div className="flex items-center gap-2">
                                  <Image className="size-4" />
                                  {t("settings.ai.image_tagging")}
                                </div>
                              </SelectItem>
                              <SelectItem value="summary">
                                <div className="flex items-center gap-2">
                                  <FileText className="size-4" />
                                  {t("settings.ai.summarization")}
                                </div>
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
            </div>
            <div className="flex gap-2">
              <ActionButton
                loading={isUpdating}
                variant="secondary"
                type="submit"
                className="flex-1 items-center sm:flex-none"
              >
                <Save className="mr-2 size-4" />
                {t("actions.save")}
              </ActionButton>
              <ActionButton
                loading={isDeleting}
                variant="destructive"
                onClick={() => deletePrompt({ promptId: prompt.id })}
                className="flex-1 items-center sm:flex-none"
                type="button"
              >
                <Trash2 className="mr-2 size-4" />
                {t("actions.delete")}
              </ActionButton>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export function TaggingRules() {
  const { t } = useTranslation();
  const { data: prompts, isLoading } = api.prompts.list.useQuery();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">
          {t("settings.ai.tagging_rules")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.ai.tagging_rule_description")}
        </p>
      </div>
      {isLoading && <FullPageSpinner />}
      {prompts && prompts.length == 0 && (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="flex items-center justify-center p-8">
            <div className="text-center">
              <Sparkles className="mx-auto mb-2 size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">
                No custom prompts yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add your first prompt below to customize AI tagging behavior
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="space-y-3">
        {prompts &&
          prompts.map((prompt) => <PromptRow key={prompt.id} prompt={prompt} />)}
      </div>
      <PromptEditor />
    </div>
  );
}

export function PromptDemo() {
  const { t } = useTranslation();
  const { data: prompts } = api.prompts.list.useQuery();
  const clientConfig = useClientConfig();

  const promptSections = [
    {
      title: t("settings.ai.text_prompt"),
      icon: FileText,
      content: buildTextPromptUntruncated(
        clientConfig.inference.inferredTagLang,
        (prompts ?? [])
          .filter((p) => p.appliesTo == "text" || p.appliesTo == "all_tagging")
          .map((p) => p.text),
        "\n<CONTENT_HERE>\n",
      ).trim(),
    },
    {
      title: t("settings.ai.images_prompt"),
      icon: Image,
      content: buildImagePrompt(
        clientConfig.inference.inferredTagLang,
        (prompts ?? [])
          .filter(
            (p) => p.appliesTo == "images" || p.appliesTo == "all_tagging",
          )
          .map((p) => p.text),
      ).trim(),
    },
    {
      title: t("settings.ai.summarization_prompt"),
      icon: FileText,
      content: buildSummaryPromptUntruncated(
        clientConfig.inference.inferredTagLang,
        (prompts ?? [])
          .filter((p) => p.appliesTo == "summary")
          .map((p) => p.text),
        "\n<CONTENT_HERE>\n",
      ).trim(),
    },
  ];

  return (
    <div className="space-y-6">
      {promptSections.map((section, index) => {
        const SectionIcon = section.icon;
        return (
          <div key={index} className="space-y-3">
            <div className="flex items-center gap-2">
              <SectionIcon className="size-5 text-muted-foreground" />
              <h4 className="font-medium">{section.title}</h4>
            </div>
            <Card>
              <CardContent className="p-4">
                <pre className="overflow-x-auto text-xs">
                  <code className="text-muted-foreground">{section.content}</code>
                </pre>
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}

export default function AISettings() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-6" />
            {t("settings.ai.ai_settings")}
          </CardTitle>
          <CardDescription>
            Customize how AI processes and tags your bookmarks with custom prompts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaggingRules />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.ai.prompt_preview")}</CardTitle>
          <CardDescription>
            Preview the final prompts that will be sent to the AI for processing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PromptDemo />
        </CardContent>
      </Card>
    </div>
  );
}
