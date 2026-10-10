import { JSDOM } from "jsdom";
import { renderToString } from "katex";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeDistillMath } from "./normalizeDistillMath";

vi.mock("katex", () => ({
  renderToString: vi.fn(
    () => '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>',
  ),
}));

beforeEach(() => vi.mocked(renderToString).mockClear());

describe("Distill math normalization budgets", () => {
  it("caps render attempts and leaves excess equations readable", () => {
    const dom = new JSDOM("<d-math>x</d-math>".repeat(600));
    try {
      normalizeDistillMath(dom.window.document);
      expect(renderToString).toHaveBeenCalledTimes(512);
      expect(dom.window.document.querySelectorAll("d-math")).toHaveLength(88);
      expect(dom.window.document.body.textContent).toHaveLength(600);
    } finally {
      dom.window.close();
    }
  });

  it("caps aggregate TeX input even when each equation is within the per-equation limit", () => {
    const dom = new JSDOM(`<d-math>${"x".repeat(4096)}</d-math>`.repeat(40));
    try {
      normalizeDistillMath(dom.window.document);
      expect(renderToString).toHaveBeenCalledTimes(32);
      expect(dom.window.document.querySelectorAll("d-math")).toHaveLength(8);
    } finally {
      dom.window.close();
    }
  });

  it("skips a single oversized expression without suppressing later short equations", () => {
    const dom = new JSDOM(
      `<d-math>${"x".repeat(4097)}</d-math><d-math>y</d-math>`,
    );
    try {
      normalizeDistillMath(dom.window.document);
      expect(renderToString).toHaveBeenCalledTimes(1);
      expect(vi.mocked(renderToString).mock.calls[0][0]).toBe("y");
      expect(
        dom.window.document.querySelector("d-math")?.textContent,
      ).toHaveLength(4097);
    } finally {
      dom.window.close();
    }
  });
});
