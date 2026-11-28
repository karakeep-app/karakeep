// Dependency-free so it can be imported from both the server and the browser.

/** Pulls the chunk index back out of a name produced by ttsChunkFileName. */
export function ttsChunkIndexFromFileName(
  fileName: string | null | undefined,
): number {
  const m = /^tts-(\d+)\./.exec(fileName ?? "");
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

/** Orders assets by chunk index, independent of file extension. */
export function sortTtsChunks<T extends { fileName?: string | null }>(
  chunks: T[],
): T[] {
  return [...chunks].sort(
    (a, b) =>
      ttsChunkIndexFromFileName(a.fileName) -
      ttsChunkIndexFromFileName(b.fileName),
  );
}
