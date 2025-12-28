"use client";

import React from "react";
import Link from "next/link";
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
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDownToLine,
  CheckCircle,
  CircleDashed,
  CirclePlus,
  Edit,
  Plus,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  ZFeed,
  zNewFeedSchema,
  zUpdateFeedSchema,
} from "@karakeep/shared/types/feeds";

import ActionConfirmingDialog from "../ui/action-confirming-dialog";
import { Button, buttonVariants } from "../ui/button";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function FeedsEditorDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const apiUtils = api.useUtils();

  const form = useForm<z.infer<typeof zNewFeedSchema>>({
    resolver: zodResolver(zNewFeedSchema),
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

  const { mutateAsync: createFeed, isPending: isCreating } =
    api.feeds.create.useMutation({
      onSuccess: () => {
        toast({
          description: "Feed has been created!",
        });
        apiUtils.feeds.list.invalidate();
        setOpen(false);
      },
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <CirclePlus className="mr-2 size-4" />
          {t("settings.feeds.add_a_subscription")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subscribe to a new Feed</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-3"
            onSubmit={form.handleSubmit(async (value) => {
              await createFeed(value);
              form.resetField("name");
              form.resetField("url");
            })}
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => {
                return (
                  <FormItem className="flex-1">
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Feed Name" type="text" {...field} />
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
                    <FormLabel>URL</FormLabel>
                    <FormControl>
                      <Input placeholder="Feed URL" type="text" {...field} />
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
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Import Tags</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        Automatically import categories from RSS feed as tags
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
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </DialogClose>
          <ActionButton
            onClick={form.handleSubmit(async (value) => {
              await createFeed(value);
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

export function EditFeedDialog({ feed }: { feed: ZFeed }) {
  const { t } = useTranslation();
  const apiUtils = api.useUtils();
  const [open, setOpen] = React.useState(false);
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
  const { mutateAsync: updateFeed, isPending: isUpdating } =
    api.feeds.update.useMutation({
      onSuccess: () => {
        toast({
          description: "Feed has been updated!",
        });
        setOpen(false);
        apiUtils.feeds.list.invalidate();
      },
    });
  const form = useForm<z.infer<typeof zUpdateFeedSchema>>({
    resolver: zodResolver(zUpdateFeedSchema),
    defaultValues: {
      feedId: feed.id,
      name: feed.name,
      url: feed.url,
      importTags: feed.importTags,
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost">
              <Edit className="size-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("actions.edit")}</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Feed</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-3"
            onSubmit={form.handleSubmit(async (value) => {
              await updateFeed(value);
            })}
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
                      <Input placeholder="Feed name" type="text" {...field} />
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
                      <Input placeholder="Feed url" type="text" {...field} />
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
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Import Tags</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        Automatically import categories from RSS feed as tags
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
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {t("actions.close")}
            </Button>
          </DialogClose>
          <ActionButton
            loading={isUpdating}
            onClick={form.handleSubmit(async (value) => {
              await updateFeed(value);
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

export function FeedRow({ feed }: { feed: ZFeed }) {
  const { t } = useTranslation();
  const apiUtils = api.useUtils();
  const { mutate: deleteFeed, isPending: isDeleting } =
    api.feeds.delete.useMutation({
      onSuccess: () => {
        toast({
          description: "Feed has been deleted!",
        });
        apiUtils.feeds.list.invalidate();
      },
    });

  const { mutate: fetchNow, isPending: isFetching } =
    api.feeds.fetchNow.useMutation({
      onSuccess: () => {
        toast({
          description: "Feed fetch has been enqueued!",
        });
        apiUtils.feeds.list.invalidate();
      },
    });

  const { mutate: updateFeedEnabled } = api.feeds.update.useMutation({
    onSuccess: () => {
      toast({
        description: feed.enabled
          ? t("settings.feeds.feed_disabled")
          : t("settings.feeds.feed_enabled"),
      });
      apiUtils.feeds.list.invalidate();
    },
    onError: (error) => {
      toast({
        description: `Error: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleToggle = (checked: boolean) => {
    updateFeedEnabled({ feedId: feed.id, enabled: checked });
  };

  return (
    <TableRow>
      <TableCell>
        <Link
          href={`/dashboard/feeds/${feed.id}`}
          className={cn(buttonVariants({ variant: "link" }))}
        >
          {feed.name}
        </Link>
      </TableCell>
      <TableCell
        className="max-w-64 overflow-clip text-ellipsis"
        title={feed.url}
      >
        {feed.url}
      </TableCell>
      <TableCell>{feed.lastFetchedAt?.toLocaleString()}</TableCell>
      <TableCell>
        {feed.lastFetchedStatus === "success" ? (
          <span title="Successful">
            <CheckCircle />
          </span>
        ) : feed.lastFetchedStatus === "failure" ? (
          <span title="Failed">
            <XCircle />
          </span>
        ) : (
          <span title="Pending">
            <CircleDashed name="Pending" />
          </span>
        )}
      </TableCell>
      <TableCell className="flex items-center gap-2">
        <Switch checked={feed.enabled} onCheckedChange={handleToggle} />
        <EditFeedDialog feed={feed} />
        <Tooltip>
          <TooltipTrigger asChild>
            <ActionButton
              loading={isFetching}
              variant="ghost"
              className="items-center"
              onClick={() => fetchNow({ feedId: feed.id })}
            >
              <ArrowDownToLine className="size-4" />
            </ActionButton>
          </TooltipTrigger>
          <TooltipContent>{t("actions.fetch_now")}</TooltipContent>
        </Tooltip>
        <ActionConfirmingDialog
          title={`Delete Feed "${feed.name}"?`}
          description={`Are you sure you want to delete the feed "${feed.name}"?`}
          actionButton={() => (
            <ActionButton
              loading={isDeleting}
              variant="destructive"
              onClick={() => deleteFeed({ feedId: feed.id })}
              className="items-center"
              type="button"
            >
              <Trash2 className="mr-2 size-4" />
              {t("actions.delete")}
            </ActionButton>
          )}
        >
          <Button variant="destructive" disabled={isDeleting}>
            <Trash2 className="size-4" />
          </Button>
        </ActionConfirmingDialog>
      </TableCell>
    </TableRow>
  );
}

export default function FeedSettings() {
  const { t } = useTranslation();
  const { data: feeds, isLoading } = api.feeds.list.useQuery();
  return (
    <>
      <div className="rounded-md border bg-background p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-lg font-medium">
              {t("settings.feeds.rss_subscriptions")}
            </span>
            <FeedsEditorDialog />
          </div>
          {isLoading && <FullPageSpinner />}
          {feeds && feeds.feeds.length == 0 && (
            <p className="rounded-md bg-muted p-2 text-sm text-muted-foreground">
              You don&apos;t have any RSS subscriptions yet.
            </p>
          )}
          {feeds && feeds.feeds.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("common.url")}</TableHead>
                  <TableHead>Last Fetch</TableHead>
                  <TableHead>Last Status</TableHead>
                  <TableHead>{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeds.feeds.map((feed) => (
                  <FeedRow key={feed.id} feed={feed} />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </>
  );
}
