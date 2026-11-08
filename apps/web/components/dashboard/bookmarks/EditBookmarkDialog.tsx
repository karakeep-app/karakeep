import * as React from "react";
import { z } from "zod";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { useDialogFormReset } from "@/lib/hooks/useDialogFormReset";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useForm } from "react-hook-form";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";
import {
  BookmarkTypes,
  ZBookmark,
  zUpdateBookmarksRequestSchema,
} from "@karakeep/shared/types/bookmarks";
import { getBookmarkTitle } from "@karakeep/shared/utils/bookmarkUtils";

import { BookmarkTagsEditor } from "./BookmarkTagsEditor";

const formSchema = zUpdateBookmarksRequestSchema.extend({
  createdAt: z.date().optional(),
  datePublished: z.date().nullish(),
  dateModified: z.date().nullish(),
});
type BookmarkFormValues = z.infer<typeof formSchema>;

// As far back as these dates can be set
const CALENDAR_START_MONTH = new Date(1900, 0);

export function EditBookmarkDialog({
  open,
  setOpen,
  bookmark,
  children,
}: {
  bookmark: ZBookmark;
  children?: React.ReactNode;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const api = useTRPC();
  const { t } = useTranslation();

  const { data: assetContent, isLoading: isAssetContentLoading } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      {
        bookmarkId: bookmark.id,
        includeContent: true,
      },
      {
        enabled: open && bookmark.content.type == BookmarkTypes.ASSET,
        select: (b) =>
          b.content.type == BookmarkTypes.ASSET ? b.content.content : null,
      },
    ),
  );

  const bookmarkToDefault = (bookmark: ZBookmark): BookmarkFormValues => ({
    bookmarkId: bookmark.id,
    summary: bookmark.summary,
    note: bookmark.note === null ? undefined : bookmark.note,
    title: getBookmarkTitle(bookmark),
    createdAt: bookmark.createdAt ?? new Date(),
    // Link specific defaults (only if bookmark is a link)
    url:
      bookmark.content.type === BookmarkTypes.LINK
        ? bookmark.content.url
        : undefined,
    description:
      bookmark.content.type === BookmarkTypes.LINK
        ? (bookmark.content.description ?? "")
        : undefined,
    author:
      bookmark.content.type === BookmarkTypes.LINK
        ? (bookmark.content.author ?? "")
        : undefined,
    publisher:
      bookmark.content.type === BookmarkTypes.LINK
        ? (bookmark.content.publisher ?? "")
        : undefined,
    datePublished:
      bookmark.content.type === BookmarkTypes.LINK
        ? bookmark.content.datePublished
        : undefined,
    // Asset specific fields
    assetContent: assetContent ?? undefined,
  });

  const form = useForm<BookmarkFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: bookmarkToDefault(bookmark),
  });

  const { mutate: updateBookmarkMutate, isPending: isUpdatingBookmark } =
    useUpdateBookmark({
      onSuccess: (updatedBookmark) => {
        toast({ description: t("toasts.bookmarks.updated") });
        // Close the dialog after successful detail update
        setOpen(false);
        // Reset form with potentially updated data
        form.reset(bookmarkToDefault(updatedBookmark));
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Failed to update bookmark",
          description: error.message,
        });
      },
    });

  function onSubmit(values: BookmarkFormValues) {
    // Ensure optional fields that are empty strings are sent as null/undefined if appropriate
    const payload = {
      ...values,
      title: values.title ?? null,
    };
    updateBookmarkMutate(payload);
  }

  // Reset form only when dialog is initially opened to preserve unsaved changes
  // This prevents losing unsaved title edits when tags are updated, which would
  // cause the bookmark prop to change and trigger a form reset
  useDialogFormReset(open, form, bookmarkToDefault(bookmark));

  // Update assetContent field when it's loaded
  React.useEffect(() => {
    if (assetContent && bookmark.content.type === BookmarkTypes.ASSET) {
      form.setValue("assetContent", assetContent);
    }
  }, [assetContent, bookmark.content.type, form]);

  const isLink = bookmark.content.type === BookmarkTypes.LINK;
  const isAsset = bookmark.content.type === BookmarkTypes.ASSET;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle>{t("bookmark_editor.title")}</DialogTitle>
          <DialogDescription>{t("bookmark_editor.subtitle")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6 pt-1">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.title")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Bookmark title"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isLink && (
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.url")}</FormLabel>
                      <FormControl>
                        <Input placeholder="https://example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Above the fold, so it's there without scrolling past the dates */}
              <FormItem>
                <FormLabel>{t("common.tags")}</FormLabel>
                <FormControl>
                  <BookmarkTagsEditor bookmark={bookmark} />
                </FormControl>
                <FormMessage />
              </FormItem>

              {
                <FormField
                  control={form.control}
                  name="note"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.note")}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t("preview.note_placeholder")}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormDescription>
                        {t("bookmark_editor.note_help")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              }

              {isLink && (
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.description")}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Bookmark description"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormDescription>
                        {t("bookmark_editor.description_help")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isLink && (
                <FormField
                  control={form.control}
                  name="summary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.summary")}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Bookmark summary"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormDescription>
                        {t("bookmark_editor.summary_help")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isAsset && (
                <FormField
                  control={form.control}
                  name="assetContent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("bookmark_editor.extracted_content")}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          disabled={isAssetContentLoading}
                          placeholder={t("bookmark_editor.extracted_content")}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isLink && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="author"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("bookmark_editor.author")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Author name"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="publisher"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("bookmark_editor.publisher")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Publisher name"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="createdAt"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>{t("common.created_at")}</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground",
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>{t("bookmark_editor.pick_a_date")}</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            defaultMonth={field.value}
                            startMonth={CALENDAR_START_MONTH}
                            endMonth={new Date()}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date > new Date() || date < new Date("1900-01-01")
                            }
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isLink && (
                  <FormField
                    control={form.control}
                    name="datePublished"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>
                          {t("bookmark_editor.date_published")}
                        </FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground",
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>
                                    {t("bookmark_editor.pick_a_date")}
                                  </span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value ?? undefined}
                              defaultMonth={field.value ?? undefined}
                              startMonth={CALENDAR_START_MONTH}
                              endMonth={new Date()}
                              onSelect={(date) => field.onChange(date ?? null)} // Handle undefined -> null
                              disabled={(date) =>
                                date > new Date() ||
                                date < new Date("1900-01-01")
                              }
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>

            <DialogFooter className="border-t px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isUpdatingBookmark}
              >
                {t("actions.cancel")}
              </Button>
              <ActionButton type="submit" loading={isUpdatingBookmark}>
                {t("bookmark_editor.save_changes")}
              </ActionButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
