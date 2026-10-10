// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { SaveJob, SaveReply } from "./background/save-protocol";
import { saveJobKey } from "./background/save-protocol";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), send: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("./utils/settings", () => ({
  default: () => ({ settings: { autoSave: false }, isPending: true }),
}));
import SavePage from "./SavePage";

const tab = { id: 1, url: "https://example.com/article", title: "Article" };
const job: SaveJob = {
  id: "old-job",
  tabId: tab.id,
  tabUrl: tab.url,
  connectionId: "old-connection",
  bookmark: { type: BookmarkTypes.LINK, url: tab.url },
  capture: true,
  stage: "saving",
  revision: 1,
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
type StorageListener = (changes: Record<string, unknown>, area: string) => void;
let listeners: Set<StorageListener>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  listeners = new Set();
  vi.stubGlobal("chrome", {
    tabs: { query: vi.fn().mockResolvedValue([tab]) },
    runtime: { sendMessage: mocks.send },
    storage: {
      session: { get: vi.fn().mockResolvedValue({}), remove: vi.fn() },
      onChanged: {
        addListener: (fn: StorageListener) => listeners.add(fn),
        removeListener: (fn: StorageListener) => listeners.delete(fn),
      },
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function publish(next: SaveJob) {
  for (const listener of listeners)
    listener({ [saveJobKey(tab.id)]: { newValue: next } }, "session");
}
function deferred() {
  let resolve!: (value: SaveReply) => void;
  const promise = new Promise<SaveReply>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === label,
  );
  expect(button).toBeDefined();
  await act(() => button!.click());
}

describe("save popup reconnect", () => {
  it("reads completion again when the initial reply arrives after the final update", async () => {
    const initial = deferred();
    const saved = {
      ...job,
      stage: "saved" as const,
      revision: 2,
      bookmarkId: "bookmark",
    };
    let reads = 0;
    mocks.send.mockImplementation((message) =>
      message.type === "GET_SAVE"
        ? ++reads === 1
          ? initial.promise
          : Promise.resolve({ job: saved })
        : Promise.resolve({}),
    );
    await act(() => root.render(<SavePage />));
    // Background finishes after taking the initial snapshot but before replying.
    await act(() => publish(saved));
    await act(() => initial.resolve({ job }));
    expect(reads).toBe(2);
    expect(mocks.navigate).toHaveBeenCalledWith("/bookmark/bookmark", {
      replace: true,
    });
  });

  it("does not overwrite a newer storage update with the reconnect read", async () => {
    const latest = deferred();
    let reads = 0;
    mocks.send.mockImplementation((message) =>
      message.type === "GET_SAVE"
        ? ++reads === 1
          ? Promise.resolve({ job })
          : latest.promise
        : Promise.resolve({}),
    );
    await act(() => root.render(<SavePage />));
    await act(() =>
      publish({ ...job, revision: 3, stage: "saved", bookmarkId: "bookmark" }),
    );
    await act(() => latest.resolve({ job: { ...job, revision: 2 } }));
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it("lets a failed old-connection job be discarded before a new save", async () => {
    const failed = { ...job, stage: "failed", error: "Interrupted" };
    mocks.send.mockImplementation(async (message) => {
      if (message.type === "GET_SAVE") return { job: failed };
      if (message.type === "RETRY_SAVE")
        return { error: "Your Karakeep connection changed." };
      if (message.type === "START_SAVE")
        return {
          job: {
            ...job,
            id: "new-job",
            stage: "saved",
            bookmarkId: "new-bookmark",
          },
        };
      return {};
    });
    await act(() => root.render(<SavePage />));
    await click("Retry");
    expect(container.textContent).toContain("connection changed");
    await click("Discard failed save");
    await click("Save Bookmark");
    expect(mocks.send).toHaveBeenCalledWith({
      type: "DISCARD_SAVE",
      tabId: 1,
      jobId: "old-job",
    });
    expect(mocks.navigate).toHaveBeenCalledWith("/bookmark/new-bookmark", {
      replace: true,
    });
  });
});
