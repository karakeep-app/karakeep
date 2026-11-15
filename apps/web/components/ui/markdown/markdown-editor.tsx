import { memo, useMemo, useRef, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import ToolbarPlugin from "@/components/ui/markdown/plugins/toolbar-plugin";
import { MarkdownEditorTheme } from "@/components/ui/markdown/theme";
import {
  CodeHighlightNode,
  CodeNode,
  registerCodeHighlighting,
} from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import {
  InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Save } from "lucide-react";
import { $getRoot, EditorState, LexicalEditor } from "lexical";

function onError(error: Error) {
  console.error(error);
}

// The canvas is a text field, so it takes the same focus style as Input. It's
// also what scrolls, leaving the toolbar and the footer in view.
const CANVAS_CLASS =
  "min-h-0 w-full min-w-full flex-1 overflow-auto rounded-md border border-input p-2 outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50";

const EDITOR_NODES = [
  HeadingNode,
  ListNode,
  ListItemNode,
  QuoteNode,
  LinkNode,
  CodeNode,
  HorizontalRuleNode,
  CodeHighlightNode,
];

interface MarkdownEditorProps {
  children: string;
  onSave?: (markdown: string) => void;
  onCancel?: () => void;
  isSaving?: boolean;
  /** Called as the text changes, with whether it now differs from the original. */
  onDraftChange?: (draft: { markdown: string; isDirty: boolean }) => void;
}

const MarkdownEditor = memo(
  ({
    children: initialMarkdown,
    onSave,
    onCancel,
    isSaving,
    onDraftChange,
  }: MarkdownEditorProps) => {
    const { t } = useTranslation();
    // The editor's own rendering of the original, which may be spelled differently
    // from what was stored. Comparing with that would count as an edit on opening.
    const originalMarkdown = useRef(initialMarkdown);
    const [isRawMarkdownMode, setIsRawMarkdownMode] = useState(false);
    const [rawMarkdown, setRawMarkdown] = useState(initialMarkdown);

    const initialConfig: InitialConfigType = useMemo(
      () => ({
        namespace: "editor",
        onError,
        theme: MarkdownEditorTheme,
        nodes: EDITOR_NODES,
        editorState: (editor: LexicalEditor) => {
          registerCodeHighlighting(editor);
          $convertFromMarkdownString(initialMarkdown, TRANSFORMERS);
          originalMarkdown.current = $convertToMarkdownString(TRANSFORMERS);
        },
      }),
      [initialMarkdown],
    );

    const handleOnChange = (editorState: EditorState) => {
      editorState.read(() => {
        let markdownString;
        if (isRawMarkdownMode) {
          markdownString = $getRoot()?.getFirstChild()?.getTextContent() ?? "";
        } else {
          markdownString = $convertToMarkdownString(TRANSFORMERS);
        }
        setRawMarkdown(markdownString);
        onDraftChange?.({
          markdown: markdownString,
          isDirty: markdownString !== originalMarkdown.current,
        });
      });
    };

    return (
      <LexicalComposer initialConfig={initialConfig}>
        <div className="flex h-full flex-col justify-stretch">
          <ToolbarPlugin
            isRawMarkdownMode={isRawMarkdownMode}
            setIsRawMarkdownMode={setIsRawMarkdownMode}
          />
          {isRawMarkdownMode ? (
            <PlainTextPlugin
              contentEditable={<ContentEditable className={CANVAS_CLASS} />}
              ErrorBoundary={LexicalErrorBoundary}
            />
          ) : (
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className={cn(
                    "prose dark:prose-invert prose-p:m-0",
                    CANVAS_CLASS,
                  )}
                />
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
          )}
          {onSave && (
            <div className="flex shrink-0 justify-end gap-2 pt-3">
              {onCancel && (
                <Button
                  variant="outline"
                  className="max-sm:flex-1"
                  onClick={onCancel}
                >
                  {t("actions.cancel")}
                </Button>
              )}
              <ActionButton
                loading={!!isSaving}
                className="max-sm:flex-1"
                onClick={() => onSave(rawMarkdown)}
              >
                <Save className="size-4" />
                {t("actions.save")}
              </ActionButton>
            </div>
          )}
        </div>
        <HistoryPlugin />
        <AutoFocusPlugin />
        <TabIndentationPlugin />
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
        <OnChangePlugin onChange={handleOnChange} />
        <ListPlugin />
      </LexicalComposer>
    );
  },
);
// needed for linter because of memo
MarkdownEditor.displayName = "MarkdownEditor";

export default MarkdownEditor;
