import { expect, test, vi } from "vitest";
import {
  downloadHighlightPdf,
  MAX_HIGHLIGHT_PDF_BYTES as LIMIT,
} from "../../../../mobile/components/bookmarks/downloadHighlightPdf";

function fixture(length: string | null = "100", status = 200) {
  let progress: (received: number, total: number) => void = vi.fn();
  let finish: () => void = vi.fn();
  let reject: (error: Error) => void = vi.fn();
  const get = Object.assign(
    new Promise<unknown>((resolve, fail) => {
      finish = () => resolve({ info: () => ({ status: 200 }) });
      reject = fail;
    }),
    {
      cancel: vi.fn(() => reject(new Error("cancelled"))),
      progress: vi.fn((_config, callback) => {
        progress = callback;
      }),
    },
  );
  const head = Object.assign(
    Promise.resolve({
      info: () => ({
        status,
        headers: length === null ? {} : { "Content-Length": length },
      }),
    }),
    { cancel: vi.fn() },
  );
  const fetchGet = vi.fn(() => get);
  const client = {
    fetch: vi.fn(() => head),
    config: vi.fn(() => ({ fetch: fetchGet })),
    fs: {
      stat: vi.fn(async () => ({ size: "100" })),
      readFile: vi.fn(async () => "PDF_BYTES"),
      unlink: vi.fn().mockResolvedValue(undefined),
    },
  };
  const run = () =>
    downloadHighlightPdf(
      client as unknown as Parameters<typeof downloadHighlightPdf>[0],
      "https://fixture.test/pdf",
      { Authorization: "fixture-only" },
      "/fixture-cache.pdf",
    );
  return {
    client,
    get,
    head,
    fetchGet,
    run,
    finish: () => finish(),
    progress: (received: number, total = -1) => progress(received, total),
  };
}

test("oversized HEAD never starts a body download", async () => {
  const f = fixture(String(LIMIT + 1));
  await expect(f.run().promise).rejects.toThrow("too large");
  expect(f.fetchGet).not.toHaveBeenCalled();
  expect(f.client.fs.readFile).not.toHaveBeenCalled();
});

test("accepted size uses native authentication and removes its cache file", async () => {
  const f = fixture(String(LIMIT));
  const task = f.run();
  await vi.waitFor(() => expect(f.fetchGet).toHaveBeenCalled());
  expect(f.fetchGet).toHaveBeenCalledWith("GET", "https://fixture.test/pdf", {
    Authorization: "fixture-only",
  });
  f.finish();
  await expect(task.promise).resolves.toBe("PDF_BYTES");
  expect(f.client.fs.unlink).toHaveBeenCalledWith("/fixture-cache.pdf");
});

test.each([200, 405, 501])(
  "unknown size or unsupported HEAD (%i) cancels oversized transfer",
  async (status) => {
    const f = fixture(null, status);
    const task = f.run();
    const rejected = expect(task.promise).rejects.toThrow("too large");
    await vi.waitFor(() => expect(f.get.progress).toHaveBeenCalled());
    f.progress(LIMIT + 1);
    await rejected;
    expect(f.get.cancel).toHaveBeenCalledTimes(1);
    expect(f.client.fs.readFile).not.toHaveBeenCalled();
    expect(f.client.fs.unlink).toHaveBeenCalled();
  },
);

test("final file size still guards missed progress and inaccurate metadata", async () => {
  const f = fixture("100");
  f.client.fs.stat.mockResolvedValue({ size: String(LIMIT + 1) });
  const task = f.run();
  const rejected = expect(task.promise).rejects.toThrow("too large");
  await vi.waitFor(() => expect(f.fetchGet).toHaveBeenCalled());
  f.finish();
  await rejected;
  expect(f.client.fs.readFile).not.toHaveBeenCalled();
});

test("failed HEAD prevents GET, while cancellation prevents starting the body", async () => {
  const failed = fixture(null, 403);
  await expect(failed.run().promise).rejects.toThrow("connection and access");
  expect(failed.fetchGet).not.toHaveBeenCalled();
  const cancelled = fixture();
  const task = cancelled.run();
  task.cancel();
  await expect(task.promise).resolves.toBeNull();
  expect(cancelled.head.cancel).toHaveBeenCalledTimes(1);
  expect(cancelled.fetchGet).not.toHaveBeenCalled();
});
