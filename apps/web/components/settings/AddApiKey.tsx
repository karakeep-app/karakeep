"use client";

import type { SubmitErrorHandler } from "react-hook-form";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { HelpCircle, PlusCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { API_KEY_FULL_ACCESS_SCOPE } from "@karakeep/shared/types/apiKeys";
import type { ZApiKeyScope } from "@karakeep/shared/types/apiKeys";

import ApiKeySuccess from "./ApiKeySuccess";
import type { ScopeAccessChoice, ScopeOption } from "./apiKeyScopes";
import {
  API_KEY_ADMIN_SCOPE_OPTIONS,
  API_KEY_SCOPE_OPTIONS,
  FULL_ACCESS_SCOPE_OPTION,
} from "./apiKeyScopes";

const DIALOG_CLOSE_RESET_DELAY_MS = 200;

function ScopeDescriptionPopover({
  label,
  description,
  ariaLabel,
}: {
  label: string;
  description: string;
  ariaLabel: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          aria-label={ariaLabel}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="space-y-1">
          <div className="text-sm font-medium">{label}</div>
          <p className="text-sm leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ScopeChoiceRow({
  option,
  value,
  disabled,
  onChange,
}: {
  option: ScopeOption;
  value: ScopeAccessChoice;
  disabled: boolean;
  onChange: (value: ScopeAccessChoice) => void;
}) {
  const { t } = useTranslation();
  const label = t(option.labelKey);
  const description = t(option.descriptionKey);
  const readId = `${option.id}-read`;
  const readwriteId = `${option.id}-readwrite`;
  const noneId = `${option.id}-none`;

  return (
    <div className="flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-center gap-1 sm:flex-1">
        <div className="text-sm font-medium">{label}</div>
        <ScopeDescriptionPopover
          label={label}
          description={description}
          ariaLabel={t("settings.api_keys.scopes.scope_details", {
            scope: label,
          })}
        />
      </div>
      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(next as ScopeAccessChoice)}
        disabled={disabled}
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:shrink-0 sm:flex-nowrap sm:justify-end"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem id={noneId} value="none" />
          <Label
            htmlFor={noneId}
            className="whitespace-nowrap text-xs font-normal"
          >
            {t("settings.api_keys.scopes.access.none")}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id={readId} value="read" />
          <Label
            htmlFor={readId}
            className="whitespace-nowrap text-xs font-normal"
          >
            {t("settings.api_keys.scopes.access.read")}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id={readwriteId} value="readwrite" />
          <Label
            htmlFor={readwriteId}
            className="whitespace-nowrap text-xs font-normal"
          >
            {t("settings.api_keys.scopes.access.readwrite")}
          </Label>
        </div>
      </RadioGroup>
    </div>
  );
}

function AddApiKeyForm({
  isAdmin,
  onSuccess,
}: {
  isAdmin: boolean;
  onSuccess: (key: string) => void;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const formSchema = z.object({
    name: z.string(),
  });
  const [useFullAccess, setUseFullAccess] = useState(true);
  const [scopeChoices, setScopeChoices] = useState<
    Record<string, ScopeAccessChoice>
  >({});
  const router = useRouter();
  const mutator = useMutation(
    api.apiKeys.create.mutationOptions({
      onSuccess: (resp) => {
        onSuccess(resp.key);
        router.refresh();
      },
      onError: () => {
        toast.error(undefined, {
          description: t("common.something_went_wrong"),
        });
      },
    }),
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
  });

  const scopeOptions = isAdmin
    ? [...API_KEY_SCOPE_OPTIONS, ...API_KEY_ADMIN_SCOPE_OPTIONS]
    : API_KEY_SCOPE_OPTIONS;

  function selectedScopes(): ZApiKeyScope[] {
    if (useFullAccess) {
      return [API_KEY_FULL_ACCESS_SCOPE];
    }

    const scopes = scopeOptions.flatMap((option) => {
      const access = scopeChoices[option.id] ?? "none";
      if (access === "read") {
        return [option.readScope];
      }
      if (access === "readwrite") {
        return [option.readwriteScope];
      }
      return [];
    });

    return scopes;
  }

  async function onSubmit(value: z.infer<typeof formSchema>) {
    const scopes = selectedScopes();
    if (scopes.length === 0) {
      toast.error(undefined, {
        description: t("settings.api_keys.scopes.choose_at_least_one"),
      });
      return;
    }
    mutator.mutate({ name: value.name, scopes });
  }

  const onError: SubmitErrorHandler<z.infer<typeof formSchema>> = (errors) => {
    toast.error(undefined, {
      description: Object.values(errors)
        .map((v) => v.message)
        .join("\n"),
    });
  };

  return (
    <Form {...form}>
      <form
        id="add-api-key-form"
        onSubmit={form.handleSubmit(onSubmit, onError)}
        className="flex min-h-0 flex-col gap-4 pt-4"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => {
            return (
              <FormItem className="flex-1">
                <FormLabel>{t("common.name")}</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    placeholder={t("common.name")}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t("settings.api_keys.new_api_key_desc")}
                </FormDescription>
                <FormMessage />
              </FormItem>
            );
          }}
        />
        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium">
              {t("settings.api_keys.scopes.scopes")}
            </div>
          </div>
          <RadioGroup
            value={useFullAccess ? "fullaccess" : "scoped"}
            onValueChange={(value) => setUseFullAccess(value === "fullaccess")}
            className="grid gap-2 sm:grid-cols-2"
          >
            <div className="flex items-start gap-3 rounded-md border p-3">
              <RadioGroupItem
                id="api-key-fullaccess"
                value="fullaccess"
                className="mt-1"
              />
              <div className="flex min-w-0 items-center gap-1">
                <Label
                  htmlFor="api-key-fullaccess"
                  className="text-sm font-medium"
                >
                  {t(FULL_ACCESS_SCOPE_OPTION.labelKey)}
                </Label>
                <ScopeDescriptionPopover
                  label={t(FULL_ACCESS_SCOPE_OPTION.labelKey)}
                  description={t(FULL_ACCESS_SCOPE_OPTION.descriptionKey)}
                  ariaLabel={t("settings.api_keys.scopes.scope_details", {
                    scope: t(FULL_ACCESS_SCOPE_OPTION.labelKey),
                  })}
                />
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-md border p-3">
              <RadioGroupItem
                id="api-key-custom-scopes"
                value="scoped"
                className="mt-1"
              />
              <div className="flex min-w-0 items-center gap-1">
                <Label
                  htmlFor="api-key-custom-scopes"
                  className="text-sm font-medium"
                >
                  {t("settings.api_keys.scopes.limited_scopes.label")}
                </Label>
                <ScopeDescriptionPopover
                  label={t("settings.api_keys.scopes.limited_scopes.label")}
                  description={t(
                    "settings.api_keys.scopes.limited_scopes.description",
                  )}
                  ariaLabel={t("settings.api_keys.scopes.scope_details", {
                    scope: t("settings.api_keys.scopes.limited_scopes.label"),
                  })}
                />
              </div>
            </div>
          </RadioGroup>
          {!useFullAccess && (
            <ScrollArea className="h-[44vh] max-h-[28rem] min-h-48 pr-3">
              <div className="space-y-1.5">
                {scopeOptions
                  .filter((option) => !option.hidden)
                  .map((option) => (
                    <ScopeChoiceRow
                      key={option.id}
                      option={option}
                      value={scopeChoices[option.id] ?? "none"}
                      disabled={useFullAccess}
                      onChange={(value) =>
                        setScopeChoices((current) => ({
                          ...current,
                          [option.id]: value,
                        }))
                      }
                    />
                  ))}
              </div>
            </ScrollArea>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("actions.close")}
            </Button>
          </DialogClose>
          <ActionButton type="submit" loading={mutator.isPending}>
            {t("actions.create")}
          </ActionButton>
        </div>
      </form>
    </Form>
  );
}

export default function AddApiKey({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useTranslation();
  const [key, setKey] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  useEffect(() => {
    if (dialogOpen) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => setKey(undefined),
      DIALOG_CLOSE_RESET_DELAY_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [dialogOpen]);

  function handleOpenChange(open: boolean) {
    if (open) {
      setKey(undefined);
    }
    setDialogOpen(open);
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          {t("settings.api_keys.new_api_key")}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {key
              ? t("settings.api_keys.key_success")
              : t("settings.api_keys.new_api_key")}
          </DialogTitle>
        </DialogHeader>
        {key ? (
          <ApiKeySuccess
            apiKey={key}
            message={t("settings.api_keys.key_success")}
          />
        ) : (
          <AddApiKeyForm isAdmin={isAdmin} onSuccess={setKey} />
        )}
        {key && (
          <DialogFooter className="sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("actions.close")}
              </Button>
            </DialogClose>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
