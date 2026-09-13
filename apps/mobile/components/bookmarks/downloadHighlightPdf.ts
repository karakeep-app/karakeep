import type ReactNativeBlobUtil from "react-native-blob-util";
import type {
  FetchBlobResponse,
  StatefulPromise,
} from "react-native-blob-util";

export const MAX_HIGHLIGHT_PDF_BYTES = 25 * 1024 * 1024;
const TOO_LARGE =
  "This PDF is too large for text highlighting on this device. Use the original reader.";

// Keep credentials in native requests; only the returned bytes cross the DOM bridge.
export function downloadHighlightPdf(
  client: Pick<typeof ReactNativeBlobUtil, "fetch" | "config" | "fs">,
  uri: string,
  headers: Record<string, string>,
  path: string,
) {
  let task: StatefulPromise<FetchBlobResponse> | undefined;
  let cancelled = false;
  let oversized = false;
  const promise = (async () => {
    try {
      // Native fetch forwards arbitrary methods to OkHttp; the library's
      // narrower TypeScript Methods union omits HEAD.
      task = client.fetch(
        "HEAD" as Parameters<typeof client.fetch>[0],
        uri,
        headers,
      );
      const head = await task;
      if (cancelled) return null;
      const info = head.info();
      if (info.status >= 200 && info.status < 300) {
        const length = Object.entries(info.headers).find(
          ([name]) => name.toLowerCase() === "content-length",
        )?.[1];
        if (Number(length) > MAX_HIGHLIGHT_PDF_BYTES)
          throw new Error(TOO_LARGE);
      } else if (info.status !== 405 && info.status !== 501) {
        throw new Error(
          "Unable to download the PDF. Check your connection and access.",
        );
      }
      task = client
        .config({ path, fileCache: true })
        .fetch("GET", uri, headers);
      task.progress({ interval: 10 }, (received, total) => {
        // Also cover absent/stale Content-Length or servers without HEAD.
        // Native progress events can overshoot by a chunk; retain the final stat guard.
        if (
          !oversized &&
          (received > MAX_HIGHLIGHT_PDF_BYTES ||
            total > MAX_HIGHLIGHT_PDF_BYTES)
        ) {
          oversized = true;
          task?.cancel();
        }
      });
      const response = await task;
      if (cancelled) return null;
      if (oversized) throw new Error(TOO_LARGE);
      if (response.info().status < 200 || response.info().status >= 300)
        throw new Error(
          "Unable to download the PDF. Check your connection and access.",
        );
      const stat = await client.fs.stat(path);
      if (Number(stat.size) > MAX_HIGHLIGHT_PDF_BYTES)
        throw new Error(TOO_LARGE);
      if (cancelled) return null;
      return await client.fs.readFile(path, "base64");
    } catch (error) {
      if (cancelled) return null;
      if (oversized) throw new Error(TOO_LARGE);
      throw error;
    } finally {
      await client.fs.unlink(path).catch(() => undefined);
    }
  })();
  return {
    promise,
    cancel() {
      cancelled = true;
      task?.cancel();
    },
  };
}
