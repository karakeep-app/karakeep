// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { serializeHighlightRange } from "@karakeep/shared-react/components/highlight-selection";

function select(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.replaceChildren(root);
  const range = document.createRange();
  range.selectNodeContents(root);
  return { root, range };
}

describe("highlight selection persistence", () => {
  it("keeps table cells separated without adding trailing tabs", () => {
    const { root, range } = select(
      "<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>",
    );
    expect(serializeHighlightRange(root, range)?.text).toBe("A\tB\nC\tD");
  });
  it("keeps explicitly selected trailing breaks", () => {
    const { root, range } = select("<p>First<br><br></p>");
    expect(serializeHighlightRange(root, range)?.text).toBe("First\n\n");
  });
  it("preserves block boundaries and explicit breaks", () => {
    const { root, range } = select("<p>First<br>second</p><p>Third</p>");
    expect(serializeHighlightRange(root, range)?.text).toBe(
      "First\nsecond\nThird",
    );
  });

  it("stores an image-only range without changing text offsets", () => {
    const { root, range } = select(
      '<img src="https://example.com/a.png" alt="Diagram">',
    );
    expect(serializeHighlightRange(root, range)).toMatchObject({
      startOffset: 0,
      endOffset: 0,
      content: {
        version: 1,
        parts: [
          {
            type: "image",
            index: 0,
            src: "https://example.com/a.png",
            alt: "Diagram",
          },
        ],
      },
    });
  });

  it("distinguishes repeated images and element-container endpoints", () => {
    const { root, range } = select(
      '<img src="https://example.com/a.png"><img src="https://example.com/a.png">tail',
    );
    range.setStart(root, 1);
    range.setEnd(root, 2);
    expect(serializeHighlightRange(root, range)).toMatchObject({
      startOffset: 0,
      endOffset: 0,
      content: { parts: [{ type: "image", index: 1 }] },
    });
  });

  it("retains existing text offsets for partial text selections", () => {
    const { root, range } = select("<p>First</p><p>Second</p>");
    range.setStart(root.firstChild!.firstChild!, 2);
    range.setEnd(root.lastChild!.firstChild!, 3);
    expect(serializeHighlightRange(root, range)).toMatchObject({
      startOffset: 2,
      endOffset: 8,
      text: "rst\nSec",
    });
  });

  it("keeps literal markup as text and rejects active image schemes", () => {
    const { root, range } = select(
      '&lt;img src="https://example.com/private"&gt;<img src="javascript:alert(1)" alt="Unsafe">',
    );
    const result = serializeHighlightRange(root, range);
    expect(result?.content?.parts.every((part) => part.type === "text")).toBe(
      true,
    );
    expect(result?.text).toContain('<img src="https://example.com/private">');
  });
});
