import { beforeEach, describe, expect, test, vi } from "vitest";

import { readImageText } from "./imageOcr";

const mocks = vi.hoisted(() => ({
  ocrConfig: {
    langs: ["eng"],
    cacheDir: "/tmp/ocr-cache",
    confidenceThreshold: 50,
  },
  recognize: vi.fn(),
  terminate: vi.fn(),
  createWorker: vi.fn(),
}));

vi.mock("@karakeep/shared/config", () => ({
  default: { ocr: mocks.ocrConfig },
}));

vi.mock("tesseract.js", () => ({ createWorker: mocks.createWorker }));

// Like tesseract.js after terminate(): the recognize() promise never settles.
const neverSettles = () => new Promise<never>(() => undefined);

describe("readImageText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ocrConfig.langs = ["eng"];
    mocks.terminate.mockResolvedValue(undefined);
    mocks.createWorker.mockResolvedValue({
      recognize: mocks.recognize,
      terminate: mocks.terminate,
    });
  });

  test("returns the recognized text and terminates the worker", async () => {
    mocks.recognize.mockResolvedValue({
      data: { text: "hello world", confidence: 90 },
    });

    await expect(
      readImageText(Buffer.from("img"), new AbortController().signal),
    ).resolves.toBe("hello world");
    expect(mocks.terminate).toHaveBeenCalledOnce();
  });

  test("returns null when the confidence is at or below the threshold", async () => {
    mocks.recognize.mockResolvedValue({
      data: { text: "noise", confidence: 50 },
    });

    await expect(
      readImageText(Buffer.from("img"), new AbortController().signal),
    ).resolves.toBeNull();
    expect(mocks.terminate).toHaveBeenCalledOnce();
  });

  test("an abort mid-OCR rejects and terminates the worker", async () => {
    mocks.recognize.mockImplementation(neverSettles);
    const controller = new AbortController();

    const result = readImageText(Buffer.from("img"), controller.signal);
    await vi.waitFor(() => expect(mocks.recognize).toHaveBeenCalled());
    expect(mocks.terminate).not.toHaveBeenCalled();

    controller.abort(new Error("Job timed out"));

    await expect(result).rejects.toThrow("Job timed out");
    expect(mocks.terminate).toHaveBeenCalledOnce();
  });

  test("an abort without an Error reason still rejects", async () => {
    mocks.recognize.mockImplementation(neverSettles);
    const controller = new AbortController();

    const result = readImageText(Buffer.from("img"), controller.signal);
    await vi.waitFor(() => expect(mocks.recognize).toHaveBeenCalled());
    controller.abort("timeout");

    await expect(result).rejects.toThrow("Image OCR aborted");
    expect(mocks.terminate).toHaveBeenCalledOnce();
  });

  test("a signal that aborted while the worker started skips OCR", async () => {
    const controller = new AbortController();
    mocks.createWorker.mockImplementation(async () => {
      controller.abort(new Error("Job timed out"));
      return { recognize: mocks.recognize, terminate: mocks.terminate };
    });

    await expect(
      readImageText(Buffer.from("img"), controller.signal),
    ).rejects.toThrow("Job timed out");
    expect(mocks.recognize).not.toHaveBeenCalled();
    expect(mocks.terminate).toHaveBeenCalledOnce();
  });

  test("an OCR error propagates and terminates the worker", async () => {
    mocks.recognize.mockRejectedValue(new Error("bad image"));

    await expect(
      readImageText(Buffer.from("img"), new AbortController().signal),
    ).rejects.toThrow("bad image");
    expect(mocks.terminate).toHaveBeenCalledOnce();
  });

  test("an abort after OCR finished is ignored", async () => {
    mocks.recognize.mockResolvedValue({
      data: { text: "done", confidence: 90 },
    });
    const controller = new AbortController();

    await expect(
      readImageText(Buffer.from("img"), controller.signal),
    ).resolves.toBe("done");
    // The job can still time out after OCR finished; that must not throw or
    // touch the already-terminated worker again.
    controller.abort(new Error("late"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.terminate).toHaveBeenCalledOnce();
  });

  test("returns null without starting a worker when OCR is disabled", async () => {
    mocks.ocrConfig.langs = [""];

    await expect(
      readImageText(Buffer.from("img"), new AbortController().signal),
    ).resolves.toBeNull();
    expect(mocks.createWorker).not.toHaveBeenCalled();
  });
});
