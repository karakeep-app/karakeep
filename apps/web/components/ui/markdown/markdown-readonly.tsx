import React from "react";
import CopyBtn from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";
import Markdown from "react-markdown";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";
import docker from "react-syntax-highlighter/dist/esm/languages/prism/docker";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import kotlin from "react-syntax-highlighter/dist/esm/languages/prism/kotlin";
import markdownLang from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import php from "react-syntax-highlighter/dist/esm/languages/prism/php";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import swift from "react-syntax-highlighter/dist/esm/languages/prism/swift";
import toml from "react-syntax-highlighter/dist/esm/languages/prism/toml";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import dracula from "react-syntax-highlighter/dist/esm/styles/prism/dracula";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

// The full Prism build bundles ~300 languages. Register only the common ones;
// code blocks in other languages render unhighlighted.
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("c", c);
SyntaxHighlighter.registerLanguage("cpp", cpp);
SyntaxHighlighter.registerLanguage("csharp", csharp);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("diff", diff);
SyntaxHighlighter.registerLanguage("docker", docker);
SyntaxHighlighter.registerLanguage("go", go);
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("kotlin", kotlin);
SyntaxHighlighter.registerLanguage("markdown", markdownLang);
SyntaxHighlighter.registerLanguage("markup", markup);
SyntaxHighlighter.registerLanguage("php", php);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("ruby", ruby);
SyntaxHighlighter.registerLanguage("rust", rust);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("swift", swift);
SyntaxHighlighter.registerLanguage("toml", toml);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("yaml", yaml);

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
