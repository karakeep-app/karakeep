// Control characters (C0, DEL and C1) are never valid in a file name and can
// break HTTP headers or log lines, so they are replaced. Everything else,
// including non-ASCII letters such as "Prüfung Größe Öl.pdf" or "報告.pdf",
// is kept as-is: the file name is only ever stored as data (database column,
// asset metadata, API response) and never used as a filesystem path.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

export function sanitizeUploadFileName(fileName: string): string {
  return fileName.replace(CONTROL_CHARS, "_");
}
