import { describe, expect, it, vi } from "vitest";

import renderMathInElement from "katex/contrib/auto-render";

import {
  READER_MATH_DELIMITERS,
  renderMathInReaderElement,
} from "./math-rendering";

vi.mock("katex/contrib/auto-render", () => ({
  default: vi.fn(),
}));

describe("renderMathInReaderElement", () => {
  it("renders reader math with safe KaTeX delimiters", () => {
    const element = {} as HTMLElement;

    renderMathInReaderElement(element);

    expect(renderMathInElement).toHaveBeenCalledWith(element, {
      delimiters: READER_MATH_DELIMITERS,
      throwOnError: false,
    });
  });
});
