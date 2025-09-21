import * as React from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { DateTimePicker } from "@/components/ui/date-time-picker";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { useDialogFormReset } from "@/lib/hooks/useDialogFormReset";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, Clock, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import {
  BookmarkTypes,
  ZBookmark,
  zUpdateBookmarksRequestSchema,
} from "@karakeep/shared/types/bookmarks";
import { getBookmarkTitle } from "@karakeep/shared/utils/bookmarkUtils";

import { BookmarkTagsEditor } from "./BookmarkTagsEditor";

const formSchema = zUpdateBookmarksRequestSchema.extend({
  remindAt: z.date().nullable().optional(),
});

type FormData = z.infer<typeof formSchema>;

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
  const { t } = useTranslation();
  const utils = api.useUtils();

  // Fetch existing reminder for this bookmark
  const { data: existingReminder } = api.reminders.getBookmarkReminder.useQuery(
    { bookmarkId: bookmark.id },
    { enabled: open },
  );

  // Reminder mutations
  const setReminderMutation = api.reminders.setReminder.useMutation({
    onSuccess: () => {
      utils.bookmarks.invalidate();
      utils.reminders.invalidate();
    },
  });

  const deleteReminderMutation = api.reminders.deleteReminder.useMutation({
    onSuccess: () => {
      utils.bookmarks.invalidate();
      utils.reminders.invalidate();
    },
  });

  const bookmarkToDefault = (bookmark: ZBookmark) => ({
    bookmarkId: bookmark.id,
    summary: bookmark.summary,
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
    assetContent:
      bookmark.content.type === BookmarkTypes.ASSET
        ? bookmark.content.content
        : undefined,
    remindAt: null,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: bookmarkToDefault(bookmark),
  });

  // Update form when existing reminder is fetched
  React.useEffect(() => {
    if (existingReminder && open) {
      form.setValue("remindAt", new Date(existingReminder.remindAt));
    }
  }, [existingReminder, open, form]);

  const { mutate: updateBookmarkMutate, isPending: isUpdatingBookmark } =
    useUpdateBookmark({
      onSuccess: (updatedBookmark) => {
        toast({ description: "Bookmark details updated successfully!" });
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

  async function onSubmit(values: FormData) {
    // Extract reminder from form values
    const { remindAt, ...bookmarkData } = values;

    // Ensure optional fields that are empty strings are sent as null/undefined if appropriate
    const payload = {
      ...bookmarkData,
      title: bookmarkData.title ?? null,
    };

    // Update bookmark first
    updateBookmarkMutate(payload, {
      onSuccess: async (updatedBookmark) => {
        // Handle reminder updates after bookmark is saved
        try {
          if (remindAt) {
            // Set or update reminder
            await setReminderMutation.mutateAsync({
              bookmarkId: updatedBookmark.id,
              remindAt: remindAt,
            });
            toast({ description: "Reminder set successfully!" });
          } else if (existingReminder && !remindAt) {
            // Delete reminder if it was cleared
            await deleteReminderMutation.mutateAsync({
              reminderId: existingReminder.id,
            });
            toast({ description: "Reminder removed!" });
          }
        } catch (error) {
          toast({
            variant: "destructive",
            title: "Failed to update reminder",
            description:
              error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    });
  }

  // Reset form only when dialog is initially opened to preserve unsaved changes
  // This prevents losing unsaved title edits when tags are updated, which would
  // cause the bookmark prop to change and trigger a form reset
  useDialogFormReset(open, form, bookmarkToDefault(bookmark));

  const isLink = bookmark.content.type === BookmarkTypes.LINK;
  const isAsset = bookmark.content.type === BookmarkTypes.ASSET;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("bookmark_editor.title")}</DialogTitle>
          <DialogDescription>{t("bookmark_editor.subtitle")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                        placeholder="Extracted Content"
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
                                <span>{t("bookmark_editor.pick_a_date")}</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value ?? undefined} // Calendar expects Date | undefined
                            onSelect={(date) => field.onChange(date ?? null)} // Handle undefined -> null
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
              )}
            </div>

            <FormItem>
              <FormLabel>{t("common.tags")}</FormLabel>
              <FormControl>
                <BookmarkTagsEditor bookmark={bookmark} />
              </FormControl>
              <FormMessage />
            </FormItem>

            <FormField
              control={form.control}
              name="remindAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Reminder
                  </FormLabel>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <DateTimePicker
                        date={field.value}
                        onDateChange={field.onChange}
                        placeholder="Set a reminder"
                        className="flex-1"
                      />
                    </FormControl>
                    {field.value && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => field.onChange(null)}
                        title="Clear reminder"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
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
