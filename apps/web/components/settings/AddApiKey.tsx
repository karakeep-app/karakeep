"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
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
  setServerFormErrors,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
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
  SCOPE_GROUPS,
} from "./apiKeyScopes";

const DIALOG_CLOSE_RESET_DELAY_MS = 200;

/** Radio cards for what a key can reach, the selected one is the outlined one. */
function ScopeCard({
  id,
  value,
  label,
  description,
}: {
  id: string;
  value: string;
  label: string;
  description: string;
}) {
  return (
    <Label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal transition-colors hover:bg-accent/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent has-[[data-state=checked]]:ring-1 has-[[data-state=checked]]:ring-primary"
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" />
      <span className="min-w-0 space-y-1">
        <span className="block text-sm font-medium leading-5">{label}</span>
        <span className="block text-xs leading-4 text-muted-foreground">
          {description}
        </span>
      </span>
    </Label>
  );
}

const scopeChoiceClass =
  "flex items-center gap-2 whitespace-nowrap text-xs font-normal max-sm:min-h-11";

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
      <div className="min-w-0 sm:flex-1">
        <div className="text-sm font-medium">{label}</div>
        <p className="text-xs leading-4 text-muted-foreground">{description}</p>
      </div>
      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(next as ScopeAccessChoice)}
        disabled={disabled}
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:shrink-0 sm:flex-nowrap sm:justify-end"
      >
        <Label htmlFor={noneId} className={scopeChoiceClass}>
          <RadioGroupItem id={noneId} value="none" />
          {t("settings.api_keys.scopes.access.none")}
        </Label>
        <Label htmlFor={readId} className={scopeChoiceClass}>
          <RadioGroupItem id={readId} value="read" />
          {t("settings.api_keys.scopes.access.read")}
        </Label>
        <Label htmlFor={readwriteId} className={scopeChoiceClass}>
          <RadioGroupItem id={readwriteId} value="readwrite" />
          {t("settings.api_keys.scopes.access.readwrite")}
        </Label>
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
    name: z.string().trim().min(1, t("settings.api_keys.name_required")),
  });
  const [useFullAccess, setUseFullAccess] = useState(true);
  const [scopesError, setScopesError] = useState<string | null>(null);
  const [scopeChoices, setScopeChoices] = useState<
    Record<string, ScopeAccessChoice>
  >({});
  const mutator = useMutation(
    api.apiKeys.create.mutationOptions({
      onSuccess: (resp) => {
        onSuccess(resp.key);
      },
      onError: (e) => {
        if (!setServerFormErrors(form, e, { rejectedField: "name" })) {
          toast.error(undefined, {
            description: t("common.something_went_wrong"),
          });
        }
      },
    }),
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "" },
  });

  const clientConfig = useClientConfig();
  const scopeOptions = (
    isAdmin
      ? [...API_KEY_SCOPE_OPTIONS, ...API_KEY_ADMIN_SCOPE_OPTIONS]
      : API_KEY_SCOPE_OPTIONS
  ).map((option) =>
    // Subscription tiers can only be managed when Stripe is configured
    option.id === "admin:subscriptions" && !clientConfig.stripe.isConfigured
      ? { ...option, hidden: true }
      : option,
  );

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
      setScopesError(t("settings.api_keys.scopes.choose_at_least_one"));
      return;
    }
    mutator.mutate({ name: value.name, scopes });
  }

  const visibleOptions = scopeOptions.filter((option) => !option.hidden);

  return (
    <Form {...form}>
      <form
        id="add-api-key-form"
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="contents"
      >
        <DialogBody className="space-y-4">
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
                      autoFocus
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
              onValueChange={(value) => {
                setScopesError(null);
                setUseFullAccess(value === "fullaccess");
              }}
              className="grid gap-2 sm:grid-cols-2"
            >
              <ScopeCard
                id="api-key-fullaccess"
                value="fullaccess"
                label={t(FULL_ACCESS_SCOPE_OPTION.labelKey)}
                description={t(FULL_ACCESS_SCOPE_OPTION.descriptionKey)}
              />
              <ScopeCard
                id="api-key-custom-scopes"
                value="scoped"
                label={t("settings.api_keys.scopes.limited_scopes.label")}
                description={t(
                  "settings.api_keys.scopes.limited_scopes.description",
                )}
              />
            </RadioGroup>
            {!useFullAccess &&
              SCOPE_GROUPS.map((group) => {
                const options = visibleOptions.filter(
                  (option) => option.group === group,
                );
                if (options.length === 0) {
                  return null;
                }
                return (
                  <div key={group} className="space-y-1.5">
                    <h3 className="pt-2 text-xs font-medium text-muted-foreground">
                      {t(`settings.api_keys.scopes.groups.${group}`)}
                    </h3>
                    {options.map((option) => (
                      <ScopeChoiceRow
                        key={option.id}
                        option={option}
                        value={scopeChoices[option.id] ?? "none"}
                        disabled={useFullAccess}
                        onChange={(value) => {
                          setScopesError(null);
                          setScopeChoices((current) => ({
                            ...current,
                            [option.id]: value,
                          }));
                        }}
                      />
                    ))}
                  </div>
                );
              })}
            {scopesError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {scopesError}
              </p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <ActionButton type="submit" loading={mutator.isPending}>
            {t("settings.api_keys.create_api_key")}
          </ActionButton>
        </DialogFooter>
      </form>
    </Form>
  );
}

export default function AddApiKey({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
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
    } else if (key) {
      // Only once the key has been seen: with no keys yet, this dialog lives in
      // the empty state, which the refreshed list replaces.
      router.refresh();
    }
    setDialogOpen(open);
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          {t("settings.api_keys.new_api_key")}
        </Button>
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {key
              ? t("settings.api_keys.copy_your_key")
              : t("settings.api_keys.new_api_key")}
          </DialogTitle>
        </DialogHeader>
        {key ? (
          <ApiKeySuccess apiKey={key} />
        ) : (
          <AddApiKeyForm isAdmin={isAdmin} onSuccess={setKey} />
        )}
        {key && (
          <DialogFooter>
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
