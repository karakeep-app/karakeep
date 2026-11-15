"use client";

import React from "react";
import { ActionButton } from "@/components/ui/action-button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  setServerFormErrors,
  useFormErrors,
} from "@/components/ui/form";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Plus, Trash2, Webhook } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useTRPC } from "@karakeep/shared-react/trpc";
import {
  zNewWebhookSchema,
  zUpdateWebhookSchema,
  ZWebhook,
} from "@karakeep/shared/types/webhooks";

import ActionConfirmingDialog from "../ui/action-confirming-dialog";
import { Button } from "../ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import {
  StackedLabel,
  stackedTable,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { RowActionsMenu } from "./RowActions";
import { SettingsPage, SettingsSection } from "./SettingsPage";
import { WebhookEventSelector } from "./WebhookEventSelector";

// Mirrors the body apps/workers/workers/webhookWorker.ts sends.
const WEBHOOK_PAYLOAD_EXAMPLE = `POST <your URL>
{
  "jobId": "123",
  "bookmarkId": "abc",
  "userId": "def",
  "url": "https://example.com",
  "type": "link",
  "operation": "created"
}`;

function WebhookPayloadExample() {
  const { t } = useTranslation();
  return (
    <details className="text-sm text-muted-foreground">
      <summary className="cursor-pointer select-none hover:text-foreground">
        {t("settings.webhooks.payload_example")}
      </summary>
      <pre className="mt-2 overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs text-foreground">
        {WEBHOOK_PAYLOAD_EXAMPLE}
      </pre>
    </details>
  );
}

function useWebhookFormErrors() {
  const { t } = useTranslation();
  return useFormErrors({
    url: t("settings.webhooks.url_error"),
    events: t("settings.webhooks.events.select_at_least_one"),
  });
}

export function WebhooksEditorDialog() {
  const api = useTRPC();
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof zNewWebhookSchema>>({
    resolver: zodResolver(zNewWebhookSchema, useWebhookFormErrors()),
    defaultValues: {
      url: "",
      events: [],
      token: "",
    },
  });

  React.useEffect(() => {
    if (open) {
      form.reset();
    }
  }, [open]);

  const { mutate: createWebhook, isPending: isCreating } = useMutation(
    api.webhooks.create.mutationOptions({
      onSuccess: () => {
        toast({
          description: t("settings.webhooks.webhook_created"),
        });
        queryClient.invalidateQueries(api.webhooks.list.pathFilter());
        setOpen(false);
      },
      onError: (e) => {
        if (!setServerFormErrors(form, e)) {
          toast({ variant: "destructive", description: e.message });
        }
      },
    }),
  );
  const onSubmit = form.handleSubmit((value) =>
    // A left-empty token field means no token, not an empty one.
    createWebhook({ ...value, token: value.token || undefined }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          {t("settings.webhooks.create_webhook")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.webhooks.create_webhook")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Form {...form}>
            <form
              noValidate
              className="flex flex-col gap-3"
              onSubmit={onSubmit}
            >
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => {
                  return (
                    <FormItem className="flex-1">
                      <FormLabel>{t("common.url")}</FormLabel>
                      <FormControl>
                        <Input
                          autoFocus
                          placeholder="https://example.com/webhook"
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
                name="token"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>
                      {t("common.optional_field", {
                        label: t("settings.webhooks.auth_token"),
                      })}
                    </FormLabel>
                    <FormControl>
                      <PasswordInput autoComplete="off" {...field} />
                    </FormControl>
                    <FormDescription>
                      {t("settings.webhooks.auth_token_description")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="events"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>{t("settings.webhooks.events.title")}</FormLabel>
                    <FormControl>
                      <WebhookEventSelector
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                    <WebhookPayloadExample />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <ActionButton
            onClick={onSubmit}
            loading={isCreating}
            variant="default"
            className="items-center"
          >
            {t("settings.webhooks.create_webhook_submit")}
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditWebhookDialog({
  webhook,
  open,
  setOpen,
}: {
  webhook: ZWebhook;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  React.useEffect(() => {
    if (open) {
      form.reset({
        webhookId: webhook.id,
        url: webhook.url,
        events: webhook.events,
      });
    }
  }, [open]);
  const { mutate: updateWebhook, isPending: isUpdating } = useMutation(
    api.webhooks.update.mutationOptions({
      onSuccess: () => {
        toast({
          description: t("settings.webhooks.webhook_updated"),
        });
        setOpen(false);
        queryClient.invalidateQueries(api.webhooks.list.pathFilter());
      },
      onError: (e) => {
        if (!setServerFormErrors(form, e)) {
          toast({ variant: "destructive", description: e.message });
        }
      },
    }),
  );
  const updateSchema = zUpdateWebhookSchema.required({
    events: true,
    url: true,
  });
  const form = useForm<z.infer<typeof updateSchema>>({
    resolver: zodResolver(updateSchema, useWebhookFormErrors()),
    defaultValues: {
      webhookId: webhook.id,
      url: webhook.url,
      events: webhook.events,
    },
  });
  const onSubmit = form.handleSubmit((value) => updateWebhook(value));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.webhooks.edit_webhook")}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <Form {...form}>
            <form
              noValidate
              className="flex flex-col gap-3"
              onSubmit={onSubmit}
            >
              <FormField
                control={form.control}
                name="webhookId"
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
                name="url"
                render={({ field }) => {
                  return (
                    <FormItem className="flex-1">
                      <FormLabel>{t("common.url")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://example.com/webhook"
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
                name="events"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>{t("settings.webhooks.events.title")}</FormLabel>
                    <FormControl>
                      <WebhookEventSelector
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                    <WebhookPayloadExample />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          {form.formState.isDirty && (
            <ActionButton
              loading={isUpdating}
              onClick={onSubmit}
              type="submit"
              className="items-center"
            >
              {t("actions.save")}
            </ActionButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditTokenDialog({
  webhook,
  open,
  setOpen,
}: {
  webhook: ZWebhook;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  React.useEffect(() => {
    if (open) {
      form.reset({
        webhookId: webhook.id,
        token: "",
      });
    }
  }, [open]);

  const updateSchema = zUpdateWebhookSchema
    .pick({
      webhookId: true,
      token: true,
    })
    .required({
      token: true,
    });

  const form = useForm<z.infer<typeof updateSchema>>({
    resolver: zodResolver(updateSchema, useWebhookFormErrors()),
    defaultValues: {
      webhookId: webhook.id,
      token: "",
    },
  });

  const { mutate: updateWebhook, isPending: isUpdating } = useMutation(
    api.webhooks.update.mutationOptions({
      onSuccess: () => {
        toast({
          description: t("settings.webhooks.token_updated"),
        });
        setOpen(false);
        queryClient.invalidateQueries(api.webhooks.list.pathFilter());
      },
      onError: (e) => {
        if (!setServerFormErrors(form, e)) {
          toast({ variant: "destructive", description: e.message });
        }
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {webhook.hasToken
              ? t("settings.webhooks.edit_auth_token")
              : t("settings.webhooks.add_auth_token")}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            className="flex flex-col gap-3"
            onSubmit={form.handleSubmit((value) => updateWebhook(value))}
          >
            <FormField
              control={form.control}
              name="webhookId"
              render={({ field }) => (
                <FormItem className="hidden">
                  <FormControl>
                    <Input type="hidden" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="token"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>{t("settings.webhooks.auth_token")}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete="off"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("settings.webhooks.auth_token_description")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          {webhook.hasToken && (
            <ActionButton
              variant="destructive"
              loading={isUpdating}
              onClick={() =>
                updateWebhook({ webhookId: webhook.id, token: null })
              }
              className="items-center"
            >
              <Trash2 className="size-4" />
              {t("actions.delete")}
            </ActionButton>
          )}
          {form.formState.isDirty && (
            <ActionButton
              loading={isUpdating}
              onClick={form.handleSubmit((value) => updateWebhook(value))}
              type="submit"
              className="items-center"
            >
              {t("actions.save")}
            </ActionButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WebhookRow({ webhook }: { webhook: ZWebhook }) {
  const api = useTRPC();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = React.useState(false);
  const [tokenOpen, setTokenOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const { mutate: deleteWebhook, isPending: isDeleting } = useMutation(
    api.webhooks.delete.mutationOptions({
      onSuccess: () => {
        toast({
          description: t("settings.webhooks.webhook_deleted"),
        });
        queryClient.invalidateQueries(api.webhooks.list.pathFilter());
      },
    }),
  );

  const tokenLabel = webhook.hasToken
    ? t("settings.webhooks.edit_auth_token")
    : t("settings.webhooks.add_auth_token");

  return (
    <TableRow className={stackedTable.row}>
      <TableCell className={cn(stackedTable.primaryCell, "break-all")}>
        {webhook.url}
      </TableCell>
      <TableCell className={stackedTable.cell}>
        <StackedLabel>{t("settings.webhooks.events.title")}</StackedLabel>
        {webhook.events.join(", ")}
      </TableCell>
      <TableCell className={stackedTable.cell}>
        <StackedLabel>{t("settings.webhooks.auth_token")}</StackedLabel>
        {webhook.hasToken
          ? t("settings.webhooks.token_set")
          : t("settings.webhooks.token_not_set")}
      </TableCell>
      <TableCell className={stackedTable.actionsCell}>
        <div className="flex items-center gap-1">
          <EditWebhookDialog
            webhook={webhook}
            open={editOpen}
            setOpen={setEditOpen}
          />
          <EditTokenDialog
            webhook={webhook}
            open={tokenOpen}
            setOpen={setTokenOpen}
          />
          <ActionConfirmingDialog
            open={deleteOpen}
            setOpen={setDeleteOpen}
            title={t("settings.webhooks.delete_webhook_title")}
            description={t("settings.webhooks.delete_webhook_confirmation")}
            actionButton={() => (
              <ActionButton
                loading={isDeleting}
                variant="destructive"
                onClick={() => deleteWebhook({ webhookId: webhook.id })}
                className="items-center"
                type="button"
              >
                <Trash2 className="size-4" />
                {t("actions.delete")}
              </ActionButton>
            )}
          />
          <RowActionsMenu
            label={t("common.actions_for", { name: webhook.url })}
            items={[
              {
                label: t("actions.edit"),
                icon: <Pencil className="size-4" />,
                onSelect: () => setEditOpen(true),
              },
              {
                label: tokenLabel,
                icon: <KeyRound className="size-4" />,
                onSelect: () => setTokenOpen(true),
              },
              {
                label: t("settings.webhooks.delete_webhook"),
                icon: <Trash2 className="size-4" />,
                destructive: true,
                disabled: isDeleting,
                onSelect: () => setDeleteOpen(true),
              },
            ]}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function WebhookSettings() {
  const api = useTRPC();
  const { t } = useTranslation();
  const { data: webhooks, isLoading } = useQuery(
    api.webhooks.list.queryOptions(),
  );
  const isEmpty = webhooks?.webhooks.length === 0;
  return (
    <SettingsPage
      title={t("settings.webhooks.webhooks")}
      description={t("settings.webhooks.description")}
      action={isEmpty ? undefined : <WebhooksEditorDialog />}
    >
      {isLoading && <FullPageSpinner />}
      {isEmpty && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Webhook />
            </EmptyMedia>
            <EmptyTitle>{t("settings.webhooks.no_webhooks")}</EmptyTitle>
            <EmptyDescription>
              {t("settings.webhooks.no_webhooks_description")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{<WebhooksEditorDialog />}</EmptyContent>
        </Empty>
      )}
      {webhooks && webhooks.webhooks.length > 0 && (
        <SettingsSection>
          <Table inCard className={cn(stackedTable.table, "sm:table-auto")}>
            <TableHeader className={stackedTable.header}>
              <TableRow>
                <TableHead>{t("common.url")}</TableHead>
                <TableHead>{t("settings.webhooks.events.title")}</TableHead>
                <TableHead>{t("settings.webhooks.auth_token")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("common.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={stackedTable.body}>
              {webhooks.webhooks.map((webhook) => (
                <WebhookRow key={webhook.id} webhook={webhook} />
              ))}
            </TableBody>
          </Table>
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
