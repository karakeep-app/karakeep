import { useCallback, useEffect, useState } from "react";
import { Button, ButtonWithTooltip } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/client";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  LexicalCommand,
  SELECTION_CHANGE_COMMAND,
  TextFormatType,
} from "lexical";
import {
  Bold,
  Code,
  Highlighter,
  Info,
  Italic,
  LucideIcon,
  Strikethrough,
} from "lucide-react";

import { Label } from "../../label";
import { Switch } from "../../switch";

const LowPriority = 1;

const CONTROL_CLASS = "size-8 max-sm:size-11 [@media(pointer:coarse)]:size-11";

function MarkdownToolTip() {
  const { t } = useTranslation();
  const label = t("editor.text_toolbar.markdown_shortcuts.label");
  // A popover, as a tooltip's content can't be reached by touch.
  return (
    <Popover>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="none"
              aria-label={label}
              className={`${CONTROL_CLASS} text-muted-foreground hover:text-foreground`}
            >
              <Info className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>{label}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
      <PopoverContent
        align="end"
        collisionPadding={8}
        className="w-96 max-w-[calc(100vw-1rem)] p-3"
      >
        <table className="w-full table-auto text-left text-sm">
          <thead>
            <tr>
              <th>{t("editor.text_toolbar.markdown_shortcuts.label")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-2">
                {t("editor.text_toolbar.markdown_shortcuts.heading.label")}
              </td>
              <td className="py-2">
                {t("editor.text_toolbar.markdown_shortcuts.heading.example")}
              </td>
            </tr>
            <tr className="border-b">
              <td className="py-2">
                {t("editor.text_toolbar.markdown_shortcuts.bold.label")}
              </td>
              <td className="py-2">
                {t("editor.text_toolbar.markdown_shortcuts.bold.example")}
              </td>
            </tr>
            <tr className="border-b">
              <td className="py-2">
                {t("editor.text_toolbar.markdown_shortcuts.italic.label")}
              </td>
              <td className="py-2">
                {t("editor.text_toolbar.markdown_shortcuts.italic.example")}
              </td>
            </tr>
            <tr className="border-b">
              <td className="py-2">
                {t("editor.text_toolbar.markdown_shortcuts.blockquote.label")}
              </td>
              <td className="py-2">
                {t("editor.text_toolbar.markdown_shortcuts.blockquote.example")}
              </td>
            </tr>
            <tr className="border-b">
              <td className="py-2">
                {t("editor.text_toolbar.markdown_shortcuts.ordered_list.label")}
              </td>
              <td className="py-2">
                {t(
                  "editor.text_toolbar.markdown_shortcuts.ordered_list.example",
                )}
              </td>
            </tr>
            <tr className="border-b">
              <td className="py-2">
                {t(
                  "editor.text_toolbar.markdown_shortcuts.unordered_list.label",
                )}
              </td>
              <td className="py-2">
                {t(
                  "editor.text_toolbar.markdown_shortcuts.unordered_list.example",
                )}
              </td>
            </tr>
            <tr className="border-b">
              <td className="py-2">
                {t("editor.text_toolbar.markdown_shortcuts.inline_code.label")}
              </td>
              <td className="py-2">
                {t(
                  "editor.text_toolbar.markdown_shortcuts.inline_code.example",
                )}
              </td>
            </tr>
            <tr className="border-b">
              <td className="py-2">
                {t("editor.text_toolbar.markdown_shortcuts.block_code.label")}
              </td>
              <td className="py-2">
                {t("editor.text_toolbar.markdown_shortcuts.block_code.example")}
              </td>
            </tr>
          </tbody>
        </table>
      </PopoverContent>
    </Popover>
  );
}

export default function ToolbarPlugin({
  isRawMarkdownMode = false,
  setIsRawMarkdownMode,
}: {
  isRawMarkdownMode: boolean;
  setIsRawMarkdownMode: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const [editor] = useLexicalComposerContext();
  const [editorToolbarState, setEditorToolbarState] = useState<{
    isBold: boolean;
    isItalic: boolean;
    isStrikethrough: boolean;
    isHighlight: boolean;
    isCode: boolean;
  }>({
    isBold: false,
    isItalic: false,
    isStrikethrough: false,
    isHighlight: false,
    isCode: false,
  });

  const $updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      setEditorToolbarState({
        isBold: selection.hasFormat("bold"),
        isItalic: selection.hasFormat("italic"),
        isStrikethrough: selection.hasFormat("strikethrough"),
        isHighlight: selection.hasFormat("highlight"),
        isCode: selection.hasFormat("code"),
      });
    }
  }, []);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          $updateToolbar();
        });
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        (_payload, _newEditor) => {
          $updateToolbar();
          return false;
        },
        LowPriority,
      ),
    );
  }, [editor, $updateToolbar]);

  const formatButtons: {
    command: LexicalCommand<TextFormatType>;
    format: TextFormatType;
    isActive?: boolean;
    icon: LucideIcon;
    label: string;
  }[] = [
    {
      command: FORMAT_TEXT_COMMAND,
      format: "bold",
      icon: Bold,
      isActive: editorToolbarState.isBold,
      label: t("editor.text_toolbar.bold"),
    },
    {
      command: FORMAT_TEXT_COMMAND,
      format: "italic",
      icon: Italic,
      isActive: editorToolbarState.isItalic,
      label: t("editor.text_toolbar.italic"),
    },
    {
      command: FORMAT_TEXT_COMMAND,
      format: "strikethrough",
      icon: Strikethrough,
      isActive: editorToolbarState.isStrikethrough,
      label: t("editor.text_toolbar.strikethrough"),
    },
    {
      command: FORMAT_TEXT_COMMAND,
      format: "code",
      icon: Code,
      isActive: editorToolbarState.isCode,
      label: t("editor.text_toolbar.code"),
    },
    {
      command: FORMAT_TEXT_COMMAND,
      format: "highlight",
      icon: Highlighter,
      isActive: editorToolbarState.isHighlight,
      label: t("editor.text_toolbar.highlight"),
    },
  ];

  const handleRawMarkdownToggle = useCallback(() => {
    editor.update(() => {
      const root = $getRoot();
      const firstChild = root.getFirstChild();
      if (isRawMarkdownMode) {
        if (firstChild) {
          $convertFromMarkdownString(firstChild.getTextContent(), TRANSFORMERS);
        }
        setIsRawMarkdownMode(false);
      } else {
        const markdown = $convertToMarkdownString(TRANSFORMERS);
        const pNode = $createParagraphNode();
        pNode.append($createTextNode(markdown));
        root.clear().append(pNode);
        setIsRawMarkdownMode(true);
      }
    });
  }, [editor, isRawMarkdownMode]);

  return (
    <div className="mb-1 flex shrink-0 flex-wrap items-center justify-between gap-x-2 rounded-t-lg p-1 max-sm:px-0">
      <div className="flex flex-wrap">
        {formatButtons.map(
          ({ command, format, icon: Icon, isActive, label }) => (
            <ButtonWithTooltip
              key={format}
              tooltip={label}
              delayDuration={0}
              disabled={isRawMarkdownMode}
              size="none"
              className={CONTROL_CLASS}
              onClick={() => {
                editor.dispatchCommand(command, format);
              }}
              variant={isActive ? "default" : "ghost"}
              aria-label={label}
              aria-pressed={!!isActive}
            >
              <Icon className="size-4" />
            </ButtonWithTooltip>
          ),
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <Switch
            id="editor-raw-markdown"
            onCheckedChange={handleRawMarkdownToggle}
            checked={isRawMarkdownMode}
          />
          <Label
            htmlFor="editor-raw-markdown"
            className="flex min-h-8 items-center max-sm:min-h-11"
          >
            {t("editor.text_toolbar.raw_markdown")}
          </Label>
        </div>
        <MarkdownToolTip />
      </div>
    </div>
  );
}
