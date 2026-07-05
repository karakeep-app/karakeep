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

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "'": "&#x27;",
  "`": "&#x60;",
  '"': "&quot;",
  "<": "&lt;",
  ">": "&gt;",
};

/**
 * Escapes HTML special characters so that untrusted input can be safely
 * interpolated into an HTML context (e.g. email bodies, exported files).
 */
export function escapeHtml(input: string): string {
  return input.replace(/[&'`"<>]/g, (match) => HTML_ESCAPE_MAP[match] || "");
}
