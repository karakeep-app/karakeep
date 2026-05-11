import renderMathInElement from "katex/contrib/auto-render";

export const READER_MATH_DELIMITERS = [
  { left: "$$", right: "$$", display: true },
  { left: "\\(", right: "\\)", display: false },
  { left: "\\[", right: "\\]", display: true },
];

export function renderMathInReaderElement(element: HTMLElement) {
  renderMathInElement(element, {
    delimiters: READER_MATH_DELIMITERS,
    throwOnError: false,
  });
}
