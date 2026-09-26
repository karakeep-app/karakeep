import React from "react";
import CopyBtn from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { dracula } from "react-syntax-highlighter/dist/cjs/styles/prism";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [failedToLoad, setFailedToLoad] = React.useState(false);

  if (!src || failedToLoad) {
    return (
      <span className="inline-block rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1 align-middle text-xs text-destructive">
        Image not found (it may have been deleted)
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onError={() => setFailedToLoad(true)} />
  );
}

function PreWithCopyBtn({ className, ...props }: React.ComponentProps<"pre">) {
  const ref = React.useRef<HTMLPreElement>(null);
  return (
    <span className="group relative">
      <CopyBtn
        className="absolute right-1 top-1 m-1 hidden text-white group-hover:block"
        getStringToCopy={() => {
          return ref.current?.textContent ?? "";
        }}
      />
      <pre ref={ref} className={cn(className, "")} {...props} />
    </span>
  );
}

export function MarkdownReadonly({
  children: markdown,
  className,
  onSave,
}: {
  children: string;
  className?: string;
  onSave?: (markdown: string) => void;
}) {
  /**
   * This method is triggered when a checkbox is toggled from the masonry view
   * It finds the index of the clicked checkbox inside of the note
   * It then finds the corresponding markdown and changes it accordingly
   */
  const handleTodoClick = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const parent = e.target.closest(".prose");
    if (!parent) return;
    const allCheckboxes = parent.querySelectorAll(".todo-checkbox");
    let checkboxIndex = 0;
    allCheckboxes.forEach((cb, i) => {
      if (cb === e.target) checkboxIndex = i;
    });
    let i = 0;
    const todoPattern = /^(\s*[-*+]\s*\[)( |x|X)(\])/gm;
    const newMarkdown = markdown.replace(
      todoPattern,
      (match, prefix: string, state: string, suffix: string) => {
        const currentIndex = i++;
        if (currentIndex !== checkboxIndex) {
          return match;
        }
        const isDone = state.toLowerCase() === "x";
        const nextState = isDone ? " " : "x";
        return `${prefix}${nextState}${suffix}`;
      },
    );
    if (onSave) {
      onSave(newMarkdown);
    }
  };
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      className={cn("prose dark:prose-invert", className)}
      components={{
        input: (props) =>
          props.type === "checkbox" ? (
            <input
              checked={props.checked}
              onChange={handleTodoClick}
              type="checkbox"
              className="todo-checkbox"
            />
          ) : (
            <input {...props} readOnly />
          ),
        pre({ ...props }) {
          return <PreWithCopyBtn {...props} />;
        },
        img({ src, alt }) {
          return <MarkdownImage src={src} alt={alt} />;
        },
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className ?? "");
          return match ? (
            <SyntaxHighlighter
              PreTag="div"
              language={match[1]}
              {...props}
              style={dracula}
            >
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {markdown}
    </Markdown>
  );
}
