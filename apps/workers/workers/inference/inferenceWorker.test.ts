import { beforeEach, describe, expect, test, vi } from "vitest";

const inferenceMocks = vi.hoisted(() => ({
  build: vi.fn(),
}));

vi.mock("@karakeep/shared/inference", async (original) => {
  const mod = (await original()) as typeof import("@karakeep/shared/inference");
  return {
    ...mod,
    InferenceClientFactory: {
      build: inferenceMocks.build,
    },
  };
});

import { runOpenAI } from "./inferenceWorker";

function job(type: "summarize" | "tag") {
  return {
    id: "1",
    data: { bookmarkId: "bookmark-id", type },
  } as Parameters<typeof runOpenAI>[0];
}

describe("runOpenAI without an inference client", () => {
  beforeEach(() => {
    inferenceMocks.build.mockReset();
    inferenceMocks.build.mockReturnValue(null);
  });

  test("reports a summarize job as skipped", async () => {
    // Otherwise the worker's onComplete would record a successful
    // summarization for a job that never reached a model.
    await expect(runOpenAI(job("summarize"))).resolves.toBe("skipped");
  });

  test("leaves tagging jobs alone", async () => {
    await expect(runOpenAI(job("tag"))).resolves.toBeUndefined();
  });
});
