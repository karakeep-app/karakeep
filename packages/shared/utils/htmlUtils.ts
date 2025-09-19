import { compile } from "html-to-text";

const compiledConvert = compile({
  selectors: [{ selector: "img", format: "skip" }],
});

/**
 * Converts HTML content to plain text
 */
export function htmlToPlainText(htmlContent: string): string {
  if (!htmlContent) {
    return "";
  }

  // TODO, we probably should also remove singlefile inline images from the content
  return compiledConvert(htmlContent);
}
