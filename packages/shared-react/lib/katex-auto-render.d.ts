declare module "katex/contrib/auto-render" {
  export interface KatexAutoRenderDelimiter {
    left: string;
    right: string;
    display: boolean;
  }

  export interface KatexAutoRenderOptions {
    delimiters?: KatexAutoRenderDelimiter[];
    throwOnError?: boolean;
  }

  export default function renderMathInElement(
    element: HTMLElement,
    options?: KatexAutoRenderOptions,
  ): void;
}
