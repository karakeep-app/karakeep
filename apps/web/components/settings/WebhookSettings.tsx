"use client";

import React from "react";
import { ActionButton } from "@/components/ui/action-button";
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
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Edit,
  KeyRound,
  Plus,
  PlusCircle,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  zNewWebhookSchema,
  zUpdateWebhookSchema,
  ZWebhook,
} from "@karakeep/shared/types/webhooks";

import ActionConfirmingDialog from "../ui/action-confirming-dialog";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { WebhookEventSelector } from "./WebhookEventSelector";

export function WebhooksEditorDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const apiUtils = api.useUtils();

  const form = useForm<z.infer<typeof zNewWebhookSchema>>({
    resolver: zodResolver(zNewWebhookSchema),
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

  const { mutateAsync: createWebhook, isPending: isCreating } =
    api.webhooks.create.useMutation({
      onSuccess: () => {
        toast({
          description: "Webhook has been created!",
        });
        apiUtils.webhooks.list.invalidate();
        setOpen(false);
      },
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 size-4" />
          {t("settings.webhooks.create_webhook")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.webhooks.create_webhook")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-3"
            onSubmit={form.handleSubmit(async (value) => {
              await createWebhook(value);
              form.resetField("url");
              form.resetField("events");
            })}
          >
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => {
                return (
                  <FormItem className="flex-1">
                    <FormLabel>URL</FormLabel>
                    <FormControl>
                      <Input placeholder="Webhook URL" type="text" {...field} />
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
                  <FormLabel>{t("settings.webhooks.auth_token")}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Authentication token"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="events"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>Events</FormLabel>
                  <WebhookEventSelector
                    value={field.value}
                    onChange={field.onChange}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </DialogClose>
          <ActionButton
            onClick={form.handleSubmit(async (value) => {
              await createWebhook(value);
            })}
            loading={isCreating}
            variant="default"
            className="items-center"
          >
            <Plus className="mr-2 size-4" />
            Add
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditWebhookDialog({ webhook }: { webhook: ZWebhook }) {
  const { t } = useTranslation();
  const apiUtils = api.useUtils();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      form.reset({
        webhookId: webhook.id,
        url: webhook.url,
        events: webhook.events,
      });
    }
  }, [open]);
  const { mutateAsync: updateWebhook, isPending: isUpdating } =
    api.webhooks.update.useMutation({
      onSuccess: () => {
        toast({
          description: "Webhook has been updated!",
        });
        setOpen(false);
        apiUtils.webhooks.list.invalidate();
      },
    });
  const updateSchema = zUpdateWebhookSchema.required({
    events: true,
    url: true,
  });
  const form = useForm<z.infer<typeof updateSchema>>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      webhookId: webhook.id,
      url: webhook.url,
      events: webhook.events,
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Edit className="mr-2 size-4" />
          {t("actions.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.webhooks.edit_webhook")}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-3"
            onSubmit={form.handleSubmit(async (value) => {
              await updateWebhook(value);
            })}
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
                      <Input placeholder="Webhook URL" type="text" {...field} />
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
                  <WebhookEventSelector
                    value={field.value}
                    onChange={field.onChange}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {t("actions.close")}
            </Button>
          </DialogClose>
          <ActionButton
            loading={isUpdating}
            onClick={form.handleSubmit(async (value) => {
              await updateWebhook(value);
            })}
            type="submit"
            className="items-center"
          >
            <Save className="mr-2 size-4" />
            {t("actions.save")}
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditTokenDialog({ webhook }: { webhook: ZWebhook }) {
  const { t } = useTranslation();
  const apiUtils = api.useUtils();
  const [open, setOpen] = React.useState(false);
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
    resolver: zodResolver(updateSchema),
    defaultValues: {
      webhookId: webhook.id,
      token: "",
    },
  });

  const { mutateAsync: updateWebhook, isPending: isUpdating } =
    api.webhooks.update.useMutation({
      onSuccess: () => {
        toast({
          description: "Webhook token has been updated!",
        });
        setOpen(false);
        apiUtils.webhooks.list.invalidate();
      },
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <KeyRound className="mr-2 size-4" />
          {webhook.hasToken
            ? t("settings.webhooks.edit_auth_token")
            : t("settings.webhooks.add_auth_token")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.webhooks.edit_auth_token")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-3"
            onSubmit={form.handleSubmit(async (value) => {
              await updateWebhook(value);
            })}
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
                    <Input
                      type="password"
                      placeholder="Authentication token"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {t("actions.close")}
            </Button>
          </DialogClose>
          <ActionButton
            variant="destructive"
            loading={isUpdating}
            onClick={form.handleSubmit(async (value) => {
              await updateWebhook({
                webhookId: value.webhookId,
                token: null,
              });
            })}
            className="items-center"
          >
            <Trash2 className="mr-2 size-4" />
            {t("actions.delete")}
          </ActionButton>
          <ActionButton
            loading={isUpdating}
            onClick={form.handleSubmit(async (value) => {
              await updateWebhook(value);
            })}
            type="submit"
            className="items-center"
          >
            <Save className="mr-2 size-4" />
            {t("actions.save")}
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WebhookRow({ webhook }: { webhook: ZWebhook }) {
  const { t } = useTranslation();
  const apiUtils = api.useUtils();
  const { mutate: deleteWebhook, isPending: isDeleting } =
    api.webhooks.delete.useMutation({
      onSuccess: () => {
        toast({
          description: "Webhook has been deleted!",
        });
        apiUtils.webhooks.list.invalidate();
      },
    });

  return (
    <TableRow>
      <TableCell>{webhook.url}</TableCell>
      <TableCell>{webhook.events.join(", ")}</TableCell>
      <TableCell>{webhook.hasToken ? "*******" : <X />}</TableCell>
      <TableCell className="flex items-center gap-2">
        <EditWebhookDialog webhook={webhook} />
        <EditTokenDialog webhook={webhook} />
        <ActionConfirmingDialog
          title={t("settings.webhooks.delete_webhook")}
          description={t("settings.webhooks.delete_webhook_confirmation")}
          actionButton={() => (
            <ActionButton
              loading={isDeleting}
              variant="destructive"
              onClick={() => deleteWebhook({ webhookId: webhook.id })}
              className="items-center"
              type="button"
            >
              <Trash2 className="mr-2 size-4" />
              {t("actions.delete")}
            </ActionButton>
          )}
        >
          <Button variant="destructive" disabled={isDeleting}>
            <Trash2 className="mr-2 size-4" />
            {t("actions.delete")}
          </Button>
        </ActionConfirmingDialog>
      </TableCell>
    </TableRow>
  );
}

export default function WebhookSettings() {
  const { t } = useTranslation();
  const { data: webhooks, isLoading } = api.webhooks.list.useQuery();
  return (
    <div className="rounded-md border bg-background p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg font-medium">
            {t("settings.webhooks.webhooks")}
          </span>
          <WebhooksEditorDialog />
        </div>
        <p className="text-sm italic text-muted-foreground">
          {t("settings.webhooks.description")}
        </p>
        {isLoading && <FullPageSpinner />}
        {webhooks && webhooks.webhooks.length == 0 && (
          <p className="rounded-md bg-muted p-2 text-sm text-muted-foreground">
            You don&apos;t have any webhooks configured yet.
          </p>
        )}
        {webhooks && webhooks.webhooks.length > 0 && (
          <Table className="table-auto">
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.url")}</TableHead>
                <TableHead>{t("settings.webhooks.events.title")}</TableHead>
                <TableHead>{t("settings.webhooks.auth_token")}</TableHead>
                <TableHead>{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.webhooks.map((webhook) => (
                <WebhookRow key={webhook.id} webhook={webhook} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
