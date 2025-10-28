import type { SubmitErrorHandler, SubmitHandler } from "react-hook-form";
import React, { useEffect, useImperativeHandle, useRef } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Form, FormControl, FormItem } from "@/components/ui/form";
import InfoTooltip from "@/components/ui/info-tooltip";
import MultipleChoiceDialog from "@/components/ui/multiple-choice-dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import BookmarkAlreadyExistsToast from "@/components/utils/BookmarkAlreadyExistsToast";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import {
  useBookmarkLayout,
  useBookmarkLayoutSwitch,
} from "@/lib/userLocalSettings/bookmarksLayout";
import { cn, getOS } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useCreateBookmarkWithPostHook } from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { useUploadAsset } from "../UploadDropzone";

function useFocusOnKeyPress(
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
) {
  useEffect(() => {
    function handleKeyPress(e: KeyboardEvent) {
      if (!inputRef.current) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyE") {
        inputRef.current.focus();
        e.preventDefault();
      }
    }

    document.addEventListener("keydown", handleKeyPress);
    return () => {
      document.removeEventListener("keydown", handleKeyPress);
    };
  }, [inputRef]);
}

interface MultiUrlImportState {
  urls: URL[];
  text: string;
}

export default function EditorCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [multiUrlImportState, setMultiUrlImportState] =
    React.useState<MultiUrlImportState | null>(null);

  const demoMode = !!useClientConfig().demoMode;
  const bookmarkLayout = useBookmarkLayout();
  const formSchema = z.object({
    text: z.string(),
  });
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      text: "",
    },
  });
  const { ref, ...textFieldProps } = form.register("text");
  useImperativeHandle(ref, () => inputRef.current);
  useFocusOnKeyPress(inputRef);

  const { mutate, isPending } = useCreateBookmarkWithPostHook({
    onSuccess: (resp) => {
      if (resp.alreadyExists) {
        toast({
          description: <BookmarkAlreadyExistsToast bookmarkId={resp.id} />,
          variant: "default",
        });
      }
      form.reset();
      // if the list layout is used, we reset the size of the editor card to the original size after submitting
      if (bookmarkLayout === "list" && inputRef?.current?.style) {
        inputRef.current.style.height = "auto";
      }
    },
    onError: (e) => {
      toast({ description: e.message, variant: "destructive" });
    },
  });

  const uploadAsset = useUploadAsset();

  function tryToImportUrls(text: string): void {
    const lines = text.split("\n");
    const urls: URL[] = [];
    for (const line of lines) {
      // parsing can also throw an exception, but will be caught outside
      const url = new URL(line);
      if (url.protocol != "http:" && url.protocol != "https:") {
        throw new Error("Invalid URL");
      }
      urls.push(url);
    }

    if (urls.length === 1) {
      // Only 1 url in the textfield --> simply import it
      mutate({ type: BookmarkTypes.LINK, url: text });
      return;
    }
    // multiple urls found --> ask the user if it should be imported as multiple URLs or as a text bookmark
    setMultiUrlImportState({ urls, text });
  }

  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    // Expand the textarea to a max of half the screen size in the list layout only
    if (bookmarkLayout === "list") {
      const target = e.target as HTMLTextAreaElement;
      const maxHeight = window.innerHeight * 0.5;
      target.style.height = "auto";

      if (target.scrollHeight <= maxHeight) {
        target.style.height = `${target.scrollHeight}px`;
      } else {
        target.style.height = `${maxHeight}px`;
      }
    }
  };

  const onSubmit: SubmitHandler<z.infer<typeof formSchema>> = (data) => {
    const text = data.text.trim();
    if (!text.length) return;
    try {
      tryToImportUrls(text);
    } catch {
      // Not a URL
      mutate({ type: BookmarkTypes.TEXT, text });
    }
  };

  const onError: SubmitErrorHandler<z.infer<typeof formSchema>> = (errors) => {
    toast({
      description: Object.values(errors)
        .map((v) => v.message)
        .join("\n"),
      variant: "destructive",
    });
  };
  const cardHeight = useBookmarkLayoutSwitch({
    grid: "h-96",
    masonry: "h-48",
    list: undefined,
    compact: undefined,
  });

  const handlePaste = async (
    event: React.ClipboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event?.clipboardData?.items) {
      await Promise.all(
        Array.from(event.clipboardData.items)
          .filter((item) => item?.type?.startsWith("image"))
          .map((item) => {
            const blob = item.getAsFile();
            if (blob) {
              return uploadAsset(blob);
            }
          }),
      );
    }
  };

  /**
   * Methods that triggers when "enter" is pressed (without ctrl)
   * It checks if the current line is a todo
   * if it is it automatically appends a todo a the start of the new line
   */
  const handleNewTodo = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const todoMarkup = "- [ ] ";
    const textarea = inputRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const textBefore = textarea.value.slice(0, start);
    const lines = textBefore.split("\n");
    const currentLine = lines[lines.length - 1];
    const currentLineIsTodo = currentLine.startsWith(todoMarkup);
    if (!currentLineIsTodo) return;
    e.preventDefault();
    const newValue =
      textarea.value.slice(0, start) +
      "\n" +
      todoMarkup +
      textarea.value.slice(end);
    textarea.value = newValue;
    textarea.selectionStart = start + todoMarkup.length + 1;
    textarea.selectionEnd = start + todoMarkup.length + 1;
  };

  const OS = getOS();

  return (
    <Form {...form}>
      <form
        className={cn(
          className,
          "relative flex flex-col gap-2 rounded-xl bg-card p-4",
          cardHeight,
        )}
        onSubmit={form.handleSubmit(onSubmit, onError)}
      >
        <div className="flex justify-between">
          <p className="text-sm">{t("editor.new_item")}</p>
          <InfoTooltip size={15}>
            <p className="text-center">{t("editor.quickly_focus")}</p>
          </InfoTooltip>
        </div>
        <Separator />
        <FormItem className="flex-1">
          <FormControl>
            <Textarea
              ref={inputRef}
              disabled={isPending}
              className={cn(
                "text-md h-full w-full border-none p-0 font-light focus-visible:ring-0",
                { "resize-none": bookmarkLayout !== "list" },
              )}
              placeholder={t("editor.placeholder_v2")}
              onKeyDown={(e) => {
                if (demoMode) {
                  return;
                }
                if (
                  e.key === "Enter" &&
                  !(e.metaKey || e.ctrlKey || e.shiftKey)
                ) {
                  handleNewTodo(e);
                }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  form.handleSubmit(onSubmit, onError)();
                }
              }}
              onPaste={(e) => {
                if (demoMode) {
                  return;
                }
                handlePaste(e);
              }}
              onInput={onInput}
              {...textFieldProps}
            />
          </FormControl>
        </FormItem>
        <ActionButton
          disabled={!form.formState.dirtyFields.text}
          loading={isPending}
          type="submit"
          variant="secondary"
        >
          {form.formState.dirtyFields.text
            ? demoMode
              ? t("editor.disabled_submissions")
              : `${t("actions.save")} (${OS === "macos" ? "⌘" : "Ctrl"} + Enter)`
            : t("actions.save")}
        </ActionButton>

        {multiUrlImportState && (
          <MultipleChoiceDialog
            open={true}
            title={t("editor.multiple_urls_dialog_title")}
            description={t("editor.multiple_urls_dialog_desc")}
            onOpenChange={(open) => {
              if (!open) {
                setMultiUrlImportState(null);
              }
            }}
            actionButtons={[
              () => (
                <ActionButton
                  type="button"
                  variant="secondary"
                  loading={isPending}
                  onClick={() => {
                    mutate({
                      type: BookmarkTypes.TEXT,
                      text: multiUrlImportState.text,
                    });
                    setMultiUrlImportState(null);
                  }}
                >
                  {t("editor.import_as_text")}
                </ActionButton>
              ),
              () => (
                <ActionButton
                  type="button"
                  variant="destructive"
                  loading={isPending}
                  onClick={() => {
                    multiUrlImportState.urls.forEach((url) =>
                      mutate({ type: BookmarkTypes.LINK, url: url.toString() }),
                    );
                    setMultiUrlImportState(null);
                  }}
                >
                  {t("editor.import_as_separate_bookmarks")}
                </ActionButton>
              ),
            ]}
          ></MultipleChoiceDialog>
        )}
      </form>
    </Form>
  );
}
