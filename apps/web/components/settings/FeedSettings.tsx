"use client";

import React from "react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import FormattedDate from "@/components/ui/formatted-date";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  setServerFormErrors,
  useFormErrors,
} from "@/components/ui/form";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  CheckCircle,
  CircleDashed,
  Pencil,
  Plus,
  Rss,
  Trash2,
  XCircle,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useTRPC } from "@karakeep/shared-react/trpc";
import {
  ZFeed,
  zNewFeedSchema,
  zUpdateFeedSchema,
} from "@karakeep/shared/types/feeds";

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

function useFeedFormErrors() {
  const { t } = useTranslation();
  return useFormErrors({
    name: t("settings.feeds.name_error"),
    url: t("settings.feeds.url_error"),
  });
}

export function FeedsEditorDialog() {
  const api = useTRPC();
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(zNewFeedSchema, useFeedFormErrors()),
    defaultValues: {
      name: "",
      url: "",
      enabled: true,
      importTags: false,
    },
  });

  React.useEffect(() => {
    if (open) {
      form.reset();
    }
  }, [open]);

  const { mutate: createFeed, isPending: isCreating } = useMutation(
    api.feeds.create.mutationOptions({
      onSuccess: () => {
        toast({
          description: t("settings.feeds.feed_created"),
        });
        queryClient.invalidateQueries(api.feeds.list.pathFilter());
        setOpen(false);
      },
      onError: (e) => {
        if (!setServerFormErrors(form, e)) {
          toast({ variant: "destructive", description: e.message });
        }
      },
    }),
  );
  const onSubmit = form.handleSubmit((value) => createFeed(value));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          {t("settings.feeds.add_a_subscription")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.feeds.add_a_subscription")}</DialogTitle>
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
                name="name"
                render={({ field }) => {
                  return (
                    <FormItem className="flex-1">
                      <FormLabel>{t("common.name")}</FormLabel>
                      <FormControl>
                        <Input
                          autoFocus
                          placeholder={t("settings.feeds.name_placeholder")}
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
                name="url"
                render={({ field }) => {
                  return (
                    <FormItem className="flex-1">
                      <FormLabel>{t("common.url")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://example.com/feed.xml"
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
                name="importTags"
                render={({ field }) => {
                  return (
                    <FormItem className="flex flex-row items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <FormLabel>{t("settings.feeds.import_tags")}</FormLabel>
                        <div className="text-[13px] leading-[18px] text-muted-foreground">
                          {t("settings.feeds.import_tags_description")}
                        </div>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  );
                }}
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
            {t("settings.feeds.create_subscription")}
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditFeedDialog({
  feed,
  open,
  setOpen,
}: {
  feed: ZFeed;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  React.useEffect(() => {
    if (open) {
      form.reset({
        feedId: feed.id,
        name: feed.name,
        url: feed.url,
        importTags: feed.importTags,
      });
    }
  }, [open]);
  const { mutate: updateFeed, isPending: isUpdating } = useMutation(
    api.feeds.update.mutationOptions({
      onSuccess: () => {
        toast({
          description: t("settings.feeds.feed_updated"),
        });
        setOpen(false);
        queryClient.invalidateQueries(api.feeds.list.pathFilter());
      },
      onError: (e) => {
        if (!setServerFormErrors(form, e)) {
          toast({ variant: "destructive", description: e.message });
        }
      },
    }),
  );
  const form = useForm<z.infer<typeof zUpdateFeedSchema>>({
    resolver: zodResolver(zUpdateFeedSchema, useFeedFormErrors()),
    defaultValues: {
      feedId: feed.id,
      name: feed.name,
      url: feed.url,
      importTags: feed.importTags,
    },
  });
  const onSubmit = form.handleSubmit((value) => updateFeed(value));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.feeds.edit_feed")}</DialogTitle>
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
                name="feedId"
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
                name="name"
                render={({ field }) => {
                  return (
                    <FormItem className="flex-1">
                      <FormLabel>{t("common.name")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("settings.feeds.name_placeholder")}
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
                name="url"
                render={({ field }) => {
                  return (
                    <FormItem className="flex-1">
                      <FormLabel>{t("common.url")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://example.com/feed.xml"
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
                name="importTags"
                render={({ field }) => {
                  return (
                    <FormItem className="flex flex-row items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <FormLabel>{t("settings.feeds.import_tags")}</FormLabel>
                        <div className="text-[13px] leading-[18px] text-muted-foreground">
                          {t("settings.feeds.import_tags_description")}
                        </div>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  );
                }}
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

export function FeedRow({ feed }: { feed: ZFeed }) {
  const api = useTRPC();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const { mutate: deleteFeed, isPending: isDeleting } = useMutation(
    api.feeds.delete.mutationOptions({
      onSuccess: () => {
        toast({
          description: t("settings.feeds.feed_deleted"),
        });
        queryClient.invalidateQueries(api.feeds.list.pathFilter());
      },
    }),
  );

  const { mutate: fetchNow, isPending: isFetching } = useMutation(
    api.feeds.fetchNow.mutationOptions({
      onSuccess: () => {
        toast({
          description: t("settings.feeds.fetch_enqueued"),
        });
        queryClient.invalidateQueries(api.feeds.list.pathFilter());
      },
    }),
  );

  const { mutate: updateFeedEnabled } = useMutation(
    api.feeds.update.mutationOptions({
      onSuccess: () => {
        toast({
          description: feed.enabled
            ? t("settings.feeds.feed_disabled")
            : t("settings.feeds.feed_enabled"),
        });
        queryClient.invalidateQueries(api.feeds.list.pathFilter());
      },
      onError: (error) => {
        toast({
          description: `Error: ${error.message}`,
          variant: "destructive",
        });
      },
    }),
  );

  const handleToggle = (checked: boolean) => {
    updateFeedEnabled({ feedId: feed.id, enabled: checked });
  };

  return (
    <TableRow className={stackedTable.row}>
      <TableCell className={stackedTable.primaryCell}>
        <Link
          href={`/dashboard/feeds/${feed.id}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {feed.name}
        </Link>
      </TableCell>
      <TableCell
        className={cn(stackedTable.cell, "max-w-full truncate lg:max-w-64")}
        title={feed.url}
      >
        {feed.url}
      </TableCell>
      <TableCell className={stackedTable.cell}>
        <StackedLabel>{t("settings.feeds.last_fetch")}</StackedLabel>
        {feed.lastFetchedAt ? <FormattedDate date={feed.lastFetchedAt} /> : "—"}
      </TableCell>
      <TableCell className={stackedTable.cell}>
        {feed.lastFetchedStatus === "success" ? (
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle className="size-4 text-green-500" />
            {t("settings.feeds.status_success")}
          </span>
        ) : feed.lastFetchedStatus === "failure" ? (
          <span className="inline-flex items-center gap-1.5">
            <XCircle className="size-4 text-red-500" />
            {t("settings.feeds.status_failed")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <CircleDashed className="size-4 text-muted-foreground" />
            {t("settings.feeds.status_pending")}
          </span>
        )}
      </TableCell>
      <TableCell className={stackedTable.actionsCell}>
        <div className="flex items-center gap-1">
          <Switch
            className="me-1"
            checked={feed.enabled}
            onCheckedChange={handleToggle}
            aria-label={t("settings.feeds.feed_enabled_toggle", {
              name: feed.name,
            })}
          />
          <EditFeedDialog feed={feed} open={editOpen} setOpen={setEditOpen} />
          <ActionConfirmingDialog
            open={deleteOpen}
            setOpen={setDeleteOpen}
            title={t("common.delete_named", { name: feed.name })}
            description={t("settings.feeds.delete_description", {
              name: feed.name,
            })}
            actionButton={() => (
              <ActionButton
                loading={isDeleting}
                variant="destructive"
                onClick={() => deleteFeed({ feedId: feed.id })}
                className="items-center"
                type="button"
              >
                <Trash2 className="size-4" />
                {t("actions.delete")}
              </ActionButton>
            )}
          />
          <RowActionsMenu
            label={t("common.actions_for", { name: feed.name })}
            items={[
              {
                label: t("actions.edit"),
                icon: <Pencil className="size-4" />,
                onSelect: () => setEditOpen(true),
              },
              {
                label: t("actions.fetch_now"),
                icon: <ArrowDownToLine className="size-4" />,
                disabled: isFetching,
                onSelect: () => fetchNow({ feedId: feed.id }),
              },
              {
                label: t("actions.delete"),
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

export default function FeedSettings() {
  const api = useTRPC();
  const { t } = useTranslation();
  const { data: feeds, isLoading } = useQuery(api.feeds.list.queryOptions());
  const isEmpty = feeds?.feeds.length === 0;
  return (
    <SettingsPage
      title={t("settings.feeds.rss_subscriptions")}
      description={t("settings.feeds.page_description")}
      action={isEmpty ? undefined : <FeedsEditorDialog />}
    >
      {isLoading && <FullPageSpinner />}
      {isEmpty && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Rss />
            </EmptyMedia>
            <EmptyTitle>{t("settings.feeds.no_feeds")}</EmptyTitle>
            <EmptyDescription>
              {t("settings.feeds.no_feeds_description")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{<FeedsEditorDialog />}</EmptyContent>
        </Empty>
      )}
      {feeds && feeds.feeds.length > 0 && (
        <SettingsSection>
          <Table inCard className={stackedTable.table}>
            <TableHeader className={stackedTable.header}>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.url")}</TableHead>
                <TableHead>{t("settings.feeds.last_fetch")}</TableHead>
                <TableHead>{t("settings.feeds.last_status")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("common.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={stackedTable.body}>
              {feeds.feeds.map((feed) => (
                <FeedRow key={feed.id} feed={feed} />
              ))}
            </TableBody>
          </Table>
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
