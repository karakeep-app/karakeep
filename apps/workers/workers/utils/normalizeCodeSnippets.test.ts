import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { normalizeCodeSnippets } from "./normalizeCodeSnippets";

const code =
  "example/\n  ├── index.md\n  └── data.md\n\n\tvalue = '<script>alert(1)</script>';\n";

function article(editor: string) {
  const dom = new JSDOM(`
    <html><head><title>Example article</title></head><body><article>
      <h1>Example article</h1>
      <p>${"This article explains the example below, including its files and contents. ".repeat(10)}</p>
      <div data-text-to-copy="">${editor}</div>
      <p>${"The example above retains its indentation, blank lines, and special characters. ".repeat(10)}</p>
    </article></body></html>
  `);
  dom.window.document
    .querySelector("[data-text-to-copy]")!
    .setAttribute("data-text-to-copy", code);
  return dom;
}

describe("normalizeCodeSnippets", () => {
  it.each([
    [
      "unrendered",
      "<div data-read-only><textarea>Loading example</textarea></div>",
    ],
    [
      "rendered",
      '<div data-read-only><div class="CodeMirror"><pre>Only a visible line</pre></div></div>',
    ],
  ])(
    "preserves complete %s snippets through Readability and sanitization",
    (_name, editor) => {
      const dom = article(editor);
      try {
        normalizeCodeSnippets(dom.window.document);
        const result = new Readability(dom.window.document).parse();
        const sanitized = DOMPurify(dom.window).sanitize(result!.content!);
        const output = new JSDOM(sanitized);
        try {
          expect(output.window.document.querySelectorAll("pre")).toHaveLength(
            1,
          );
          expect(
            output.window.document.querySelector("pre > code")?.textContent,
          ).toBe(code);
          expect(output.window.document.querySelector("script")).toBeNull();
          expect(output.window.document.body.textContent).not.toContain(
            "Only a visible line",
          );
        } finally {
          output.window.close();
        }
      } finally {
        dom.window.close();
      }
    },
  );

  it("leaves ordinary copy controls and editable widgets unchanged", () => {
    const dom = new JSDOM(`
      <button data-text-to-copy="copy me">Copy</button>
      <div data-text-to-copy="editable"><div data-read-only="false"><textarea>Input</textarea></div></div>
      <textarea readonly>Ordinary form field</textarea>
      <pre><code>Existing code</code></pre>
    `);
    try {
      const before = dom.window.document.body.innerHTML;
      normalizeCodeSnippets(dom.window.document);
      expect(dom.window.document.body.innerHTML).toBe(before);
    } finally {
      dom.window.close();
    }
  });

  it("leaves empty copy-backed widgets unchanged", () => {
    const dom = article(
      "<div data-read-only><textarea>Existing content</textarea></div>",
    );
    try {
      dom.window.document
        .querySelector("[data-text-to-copy]")!
        .setAttribute("data-text-to-copy", "");
      const before = dom.window.document.body.innerHTML;
      normalizeCodeSnippets(dom.window.document);
      expect(dom.window.document.body.innerHTML).toBe(before);
    } finally {
      dom.window.close();
    }
  });
});
