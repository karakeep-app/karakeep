"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Button, ButtonWithTooltip } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  useFormErrors,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronRight, X } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import {
  useCreateBookmarkList,
  useEditBookmarkList,
} from "@karakeep/shared-react/hooks/lists";
import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";
import {
  ZBookmarkList,
  zNewBookmarkListSchema,
} from "@karakeep/shared/types/lists";

import QueryExplainerTooltip from "../search/QueryExplainerTooltip";
import { BookmarkListSelector } from "./BookmarkListSelector";
import { SmartListPreview } from "./SmartListPreview";
import { isQueryRepresentableInBuilder } from "./smartListBuilderQuery";
import { SmartListQueryBuilder } from "./SmartListQueryBuilder";

// The emoji dataset is large, only load it when the picker is opened.
const EmojiPicker = dynamic(
  async () => {
    const [{ default: data }, { default: Picker }] = await Promise.all([
      import("@emoji-mart/data"),
      import("@emoji-mart/react"),
    ]);
    return function EmojiPicker(props: {
      onEmojiSelect: (e: { native: string }) => void;
    }) {
      return <Picker data={data} {...props} />;
    };
  },
  { ssr: false },
);

export function EditListModal({
  open: userOpen,
  setOpen: userSetOpen,
  list,
  prefill,
  children,
}: {
  open?: boolean;
  setOpen?: (v: boolean) => void;
  list?: ZBookmarkList;
  prefill?: Partial<Omit<ZBookmarkList, "id">>;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  if (
    (userOpen !== undefined && !userSetOpen) ||
    (userOpen === undefined && userSetOpen)
  ) {
    throw new Error("You must provide both open and setOpen or neither");
  }
  const [customOpen, customSetOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(
      zNewBookmarkListSchema,
      useFormErrors({ query: t("lists.query_required") }),
    ),
    defaultValues: {
      name: list?.name ?? prefill?.name ?? "",
      description: list?.description ?? prefill?.description ?? "",
      icon: list?.icon ?? prefill?.icon ?? "📁",
      parentId: list?.parentId ?? prefill?.parentId,
      type: list?.type ?? prefill?.type ?? "manual",
      query: list?.query ?? prefill?.query ?? undefined,
    },
  });
  const [open, setOpen] = [
    userOpen ?? customOpen,
    userSetOpen ?? customSetOpen,
  ];

  useEffect(() => {
    form.reset({
      name: list?.name ?? prefill?.name ?? "",
      description: list?.description ?? prefill?.description ?? "",
      icon: list?.icon ?? prefill?.icon ?? "📁",
      parentId: list?.parentId ?? prefill?.parentId,
      type: list?.type ?? prefill?.type ?? "manual",
      query: list?.query ?? prefill?.query ?? undefined,
    });
    setAdvancedOpen(false);
  }, [open]);

  const query = useWatch({ control: form.control, name: "query" });
  // A query the builder can't show has to stay on screen. Sticky rather than
  // derived, so the field doesn't vanish once a query being typed becomes valid.
  if (!advancedOpen && !isQueryRepresentableInBuilder(query ?? "")) {
    setAdvancedOpen(true);
  }
  const parsedSearchQuery = useMemo(() => {
    if (!query) {
      return undefined;
    }
    return parseSearchQuery(query);
  }, [query]);
  // Mirrors what the server's schema rejects, while they're still typing.
  const queryError = !parsedSearchQuery
    ? undefined
    : parsedSearchQuery.result !== "full"
      ? t("lists.query_invalid", { text: parsedSearchQuery.text })
      : parsedSearchQuery.text.length > 0
        ? t("lists.query_plain_text", { text: parsedSearchQuery.text })
        : undefined;

  // "Parent list not found" and "can't be nested under" are the rejected values.
  const onMutationError = (e: Parameters<typeof setServerFormErrors>[1]) => {
    if (!setServerFormErrors(form, e, { rejectedField: "parentId" })) {
      toast({
        variant: "destructive",
        title: t("common.something_went_wrong"),
      });
    }
  };

  const { mutate: createList, isPending: isCreating } = useCreateBookmarkList({
    onSuccess: (resp) => {
      toast({
        description: t("toasts.lists.created"),
      });
      setOpen(false);
      router.push(`/dashboard/lists/${resp.id}`);
      form.reset();
    },
    onError: onMutationError,
  });

  const { mutate: editList, isPending: isEditing } = useEditBookmarkList({
    onSuccess: () => {
      toast({
        description: t("toasts.lists.updated"),
      });
      setOpen(false);
      form.reset();
    },
    onError: onMutationError,
  });
  const listType = useWatch({ control: form.control, name: "type" });
  // Above the fields it's about, and the schema's own wording talks about a query
  // they may never have seen. It can be off screen when Create is pressed.
  const conditionMissing =
    listType === "smart" && !query && !!form.formState.errors.query;
  const conditionErrorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (conditionMissing) {
      conditionErrorRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [conditionMissing]);

  useEffect(() => {
    if (listType !== "smart") {
      form.resetField("query");
    }
  }, [listType]);

  const isEdit = !!list;
  const isPending = isCreating || isEditing;

  const onSubmit = form.handleSubmit(
    (value: z.infer<typeof zNewBookmarkListSchema>) => {
      value.parentId = value.parentId === "" ? null : value.parentId;
      value.query = value.type === "smart" ? value.query : undefined;
      if (isEdit) {
        editList({ ...value, listId: list.id });
      } else {
        createList(value);
      }
    },
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(s) => {
        form.reset();
        setOpen(s);
      }}
    >
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent>
        <Form {...form}>
          <form noValidate className="contents" onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>
                {isEdit ? t("lists.edit_list") : t("lists.new_list")}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="flex w-full items-start gap-2 pb-4">
                <FormField
                  control={form.control}
                  name="icon"
                  render={({ field }) => {
                    return (
                      <FormItem>
                        <FormLabel>{t("lists.icon_label")}</FormLabel>
                        <Popover>
                          <FormControl>
                            <PopoverTrigger
                              aria-label={t("lists.choose_icon")}
                              className="flex size-10 items-center justify-center rounded-md border border-input text-xl max-sm:size-11"
                            >
                              {field.value}
                            </PopoverTrigger>
                          </FormControl>
                          <PopoverContent className="w-auto">
                            <EmojiPicker
                              onEmojiSelect={(e: { native: string }) =>
                                field.onChange(e.native)
                              }
                            />
                          </PopoverContent>
                        </Popover>
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
                      <FormItem className="grow">
                        <FormLabel>{t("common.name")}</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            className="w-full"
                            autoFocus
                            placeholder={t("lists.name_placeholder")}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => {
                  return (
                    <FormItem className="grow pb-4">
                      <FormLabel>{t("lists.description")}</FormLabel>
                      <FormControl>
                        <Input type="text" className="w-full" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <FormField
                control={form.control}
                name="parentId"
                render={({ field }) => {
                  return (
                    <FormItem className="grow pb-4">
                      <FormLabel>
                        {t("common.optional_field", {
                          label: t("lists.parent_list"),
                        })}
                      </FormLabel>
                      <div className="flex items-center gap-1">
                        <FormControl>
                          <BookmarkListSelector
                            // Hide the current list from the list of parents
                            hideSubtreeOf={list ? list.id : undefined}
                            // Lists can only be nested under lists you own
                            ownedOnly
                            value={field.value}
                            onChange={field.onChange}
                            placeholder={t("lists.no_parent")}
                          />
                        </FormControl>
                        {field.value && (
                          <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-muted-foreground max-sm:size-11"
                            tooltip={t("lists.clear_parent")}
                            aria-label={t("lists.clear_parent")}
                            onClick={() => {
                              form.setValue("parentId", "", {
                                shouldDirty: true,
                              });
                            }}
                          >
                            <X className="size-4" />
                          </ButtonWithTooltip>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => {
                  return (
                    <FormItem className="grow pb-4">
                      <FormLabel>{t("lists.list_type")}</FormLabel>
                      <Select
                        disabled={isEdit}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="manual">
                            {t("lists.manual_list")}
                          </SelectItem>
                          <SelectItem value="smart">
                            {t("lists.smart_list")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              {listType === "smart" && (
                <FormField
                  control={form.control}
                  name="query"
                  render={({ field }) => {
                    return (
                      <FormItem className="grow pb-4">
                        {conditionMissing && (
                          <p
                            ref={conditionErrorRef}
                            role="alert"
                            className="text-sm font-medium text-destructive"
                          >
                            {t("lists.query_required")}
                          </p>
                        )}
                        <SmartListQueryBuilder
                          listId={list?.id}
                          query={field.value ?? ""}
                          onChange={(next) =>
                            form.setValue("query", next, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                        />
                        <SmartListPreview
                          query={
                            parsedSearchQuery && !queryError
                              ? (query ?? "")
                              : ""
                          }
                          invalid={!!queryError}
                        />
                        <Collapsible
                          open={advancedOpen}
                          onOpenChange={setAdvancedOpen}
                          className="space-y-2 pt-2"
                        >
                          <CollapsibleTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="group -ms-3 text-muted-foreground"
                            >
                              <ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" />
                              {t("lists.search_query_toggle")}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-2">
                            <FormLabel>{t("lists.search_query")}</FormLabel>
                            <FormControl>
                              <Input
                                value={field.value ?? ""}
                                onChange={field.onChange}
                                aria-invalid={!!queryError}
                                className="font-mono"
                                placeholder={t(
                                  "lists.search_query_placeholder",
                                )}
                                endIcon={
                                  parsedSearchQuery ? (
                                    <QueryExplainerTooltip
                                      className="stroke-foreground p-1"
                                      parsedSearchQuery={parsedSearchQuery}
                                    />
                                  ) : undefined
                                }
                              />
                            </FormControl>
                          </CollapsibleContent>
                        </Collapsible>
                        {queryError ? (
                          <p className="text-sm text-destructive" role="alert">
                            {queryError}
                          </p>
                        ) : (
                          !conditionMissing && <FormMessage />
                        )}
                        <FormDescription>
                          {t("lists.smart_list_help")}{" "}
                          <Link
                            href="https://docs.karakeep.com/Guides/search-query-language"
                            className="underline underline-offset-4 hover:text-foreground"
                            target="_blank"
                          >
                            {t("lists.search_query_help")}
                          </Link>
                        </FormDescription>
                      </FormItem>
                    );
                  }}
                />
              )}
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>
              {(!isEdit || form.formState.isDirty) && (
                <ActionButton type="submit" loading={isPending}>
                  {list ? t("actions.save") : t("lists.create_list")}
                </ActionButton>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
