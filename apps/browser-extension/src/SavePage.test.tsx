import { useEffect } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
import superjson from "superjson";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

const browser = vi.hoisted(() => {
  const event = () => ({ addListener: vi.fn(), removeListener: vi.fn() });
  const storage = { get: vi.fn(), remove: vi.fn(), onChanged: event() };
  const chrome = {
    storage: { sync: storage, session: { get: vi.fn(), remove: vi.fn() } },
    tabs: {
      query: vi.fn(),
      get: vi.fn(),
      onUpdated: event(),
      onActivated: event(),
    },
    action: { setIcon: vi.fn() },
    runtime: { sendMessage: vi.fn() },
  };
  vi.stubGlobal("chrome", chrome);
  return chrome;
});

vi.mock("./utils/singlefile", () => ({
  capturePageWithSingleFile: vi
    .fn()
    .mockResolvedValue("<html>synthetic page</html>"),
  uploadSingleFileAsset: vi.fn().mockResolvedValue("archive-id"),
}));
vi.mock("./utils/permissions", () => ({
  hasHostPermission: vi.fn().mockResolvedValue(true),
}));

import BookmarkSavedPage from "./BookmarkSavedPage";
import SavePage from "./SavePage";
import { Providers } from "./utils/providers";
import type { Settings } from "./utils/settings";
import {
  capturePageWithSingleFile,
  uploadSingleFileAsset,
} from "./utils/singlefile";
import { hasHostPermission } from "./utils/permissions";
import { useTRPC } from "./utils/trpc";

const url = "https://example.com/article/#section";
const currentTab = {
  id: 1,
  windowId: 10,
  active: true,
  url,
  title: "Synthetic article",
};
let settings: Settings;
let requests: {
  path: string;
  input: Record<string, unknown>;
  authorization: string | null;
}[];
let respond: (
  path: string,
  input: Record<string, unknown>,
  authorization: string | null,
) => unknown;
const saved = {
  id: "saved-id",
  note: "Keep this saved note",
  tags: [{ id: "tag-id", name: "Research", attachedBy: "human" }],
  content: {
    type: BookmarkTypes.LINK,
    url,
    crawledAt: new Date(),
    taggingStatus: "success",
  },
  taggingStatus: "success",
  summarizationStatus: "success",
};
const list = {
  id: "list-id",
  name: "Reading",
  icon: "📚",
  type: "manual",
  parentId: null,
  userRole: "owner",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let refreshBookmark: () => Promise<unknown>;

function BookmarkRefreshControl() {
  const queryClient = useQueryClient();
  const api = useTRPC();
  useEffect(() => {
    refreshBookmark = () =>
      queryClient.fetchQuery(
        api.bookmarks.getBookmark.queryOptions(
          { bookmarkId: "saved-id" },
          { staleTime: 0, retry: false },
        ),
      );
  }, [api, queryClient]);
  return null;
}

function mount() {
  return render(
    <Providers>
      <BookmarkRefreshControl />
      <HashRouter>
        <Routes>
          <Route path="/" element={<SavePage />} />
          <Route path="/bookmark/:bookmarkId" element={<BookmarkSavedPage />} />
          <Route path="/signin" element={<p>Sign in page</p>} />
          <Route path="/options" element={<p>Options page</p>} />
        </Routes>
      </HashRouter>
    </Providers>,
  );
}

function mutations() {
  return requests.filter(
    (r) =>
      ![
        "bookmarks.checkUrl",
        "bookmarks.getBookmark",
        "lists.list",
        "lists.getListsOfBookmark",
        "tags.list",
      ].includes(r.path),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasHostPermission).mockResolvedValue(true);
  vi.mocked(capturePageWithSingleFile).mockResolvedValue(
    "<html>synthetic page</html>",
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  window.location.hash = "/";
  settings = {
    address: "https://synthetic.karakeep.test",
    apiKey: "account-a",
    theme: "light",
    customHeaders: {},
    autoSave: false,
    useSingleFile: true,
    singleFileIncludeImages: false,
    showCountBadge: true,
    useBadgeCache: true,
    badgeCacheExpireMs: 3600000,
  };
  browser.storage.sync.get.mockImplementation(async () => ({ settings }));
  browser.storage.session.get.mockResolvedValue({});
  browser.tabs.query.mockReset().mockResolvedValue([currentTab]);
  browser.tabs.get.mockResolvedValue({ id: 1, url });
  requests = [];
  respond = (path, input) => {
    switch (path) {
      case "bookmarks.checkUrl":
        return { bookmarkId: "saved-id" };
      case "bookmarks.getBookmark":
        return saved;
      case "lists.list":
      case "lists.getListsOfBookmark":
        return { lists: [list] };
      case "tags.list":
        return { tags: saved.tags };
      case "bookmarks.createBookmark":
        return { ...saved, ...input };
      case "bookmarks.updateBookmark":
        return { ...saved, ...input };
      default:
        throw new Error(`Unexpected request: ${path}`);
    }
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const requestUrl = new URL(String(input));
      const paths = requestUrl.pathname.split("/").pop()!.split(",");
      const inputs = JSON.parse(
        (init?.body as string) || requestUrl.searchParams.get("input") || "{}",
      );
      const authorization = new Headers(init?.headers).get("Authorization");
      const results = await Promise.all(
        paths.map(async (path, index) => {
          const body = inputs[index]
            ? superjson.deserialize<Record<string, unknown>>(inputs[index])
            : {};
          requests.push({ path, input: body, authorization });
          try {
            const result = await respond(path, body, authorization);
            return { result: { data: superjson.serialize(result) } };
          } catch (error) {
            const code =
              (error as Error & { code?: string }).code ?? "UNAUTHORIZED";
            const errors: Record<string, { code: number; httpStatus: number }> =
              {
                UNAUTHORIZED: { code: -32001, httpStatus: 401 },
                FORBIDDEN: { code: -32003, httpStatus: 403 },
                NOT_FOUND: { code: -32004, httpStatus: 404 },
                INTERNAL_SERVER_ERROR: { code: -32603, httpStatus: 500 },
              };
            const status = errors[code];
            return {
              error: superjson.serialize({
                message: (error as Error).message,
                code: status.code,
                data: {
                  code,
                  httpStatus: status.httpStatus,
                  path,
                },
              }),
            };
          }
        }),
      );
      return new Response(JSON.stringify(results), {
        headers: { "content-type": "application/json" },
      });
    }),
  );
});

afterEach(async () => {
  cleanup();
  // Let the HTTP batch dispatch queued before unmount finish in this test.
  await new Promise((resolve) => setTimeout(resolve, 10));
  vi.unstubAllGlobals();
  // settings.ts holds the same storage reference for the life of the module.
  vi.stubGlobal("chrome", browser);
});

describe("opening the extension", () => {
  it.each([true, false])(
    "opens saved notes, tags and lists without any write (autoSave=%s)",
    async (autoSave) => {
      settings.autoSave = autoSave;
      mount();
      expect(await screen.findByDisplayValue(saved.note)).toBeTruthy();
      expect(await screen.findByText("Research")).toBeTruthy();
      expect(await screen.findByText("📚 Reading")).toBeTruthy();
      expect(
        requests.find((r) => r.path === "bookmarks.checkUrl")?.input,
      ).toEqual({ url });
      expect(mutations()).toEqual([]);
      expect(capturePageWithSingleFile).not.toHaveBeenCalled();
      expect(uploadSingleFileAsset).not.toHaveBeenCalled();
      fireEvent.change(screen.getByDisplayValue(saved.note), {
        target: { value: "Edited note" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save Note" }));
      await waitFor(() =>
        expect(mutations()).toEqual([
          expect.objectContaining({
            path: "bookmarks.updateBookmark",
            input: { bookmarkId: "saved-id", note: "Edited note" },
          }),
        ]),
      );
    },
  );

  it("waits for lookup before offering a save", async () => {
    const lookup = deferred<unknown>();
    respond = () => lookup.promise;
    settings.autoSave = true;
    mount();
    expect(
      await screen.findByText(/Checking for an existing bookmark/),
    ).toBeTruthy();
    expect(mutations()).toEqual([]);
    expect(capturePageWithSingleFile).not.toHaveBeenCalled();
    cleanup();
    lookup.resolve({ bookmarkId: null });
  });

  it("blocks saving on lookup failure and permits an explicit retry", async () => {
    const original = respond;
    respond = (path, input, auth) => {
      if (path === "bookmarks.checkUrl") throw new Error("Session expired");
      return original(path, input, auth);
    };
    settings.autoSave = true;
    mount();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(mutations()).toEqual([]);
    expect(capturePageWithSingleFile).not.toHaveBeenCalled();
    respond = original;
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByDisplayValue(saved.note)).toBeTruthy();
    expect(mutations()).toEqual([]);
  });

  it("keeps manual notes and the SingleFile flow for a new URL", async () => {
    const original = respond;
    respond = (path, input, auth) =>
      path === "bookmarks.checkUrl"
        ? { bookmarkId: null }
        : original(path, input, auth);
    mount();
    const save = await screen.findByRole("button", { name: "Save Bookmark" });
    expect(mutations()).toEqual([]);
    fireEvent.change(screen.getByPlaceholderText("Add notes..."), {
      target: { value: "A new note" },
    });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]).toMatchObject({
      path: "bookmarks.createBookmark",
      input: {
        url,
        note: "A new note",
        precrawledArchiveId: "archive-id",
        source: "extension",
      },
    });
    expect(capturePageWithSingleFile).toHaveBeenCalledExactlyOnceWith(1, {
      includeImages: false,
    });
    expect(uploadSingleFileAsset).toHaveBeenCalledOnce();
    expect(uploadSingleFileAsset).toHaveBeenCalledWith(
      expect.any(String),
      "Synthetic article",
      settings,
    );
  });

  it.each(["permission", "capture"])(
    "still saves a new URL when %s is unavailable",
    async (failure) => {
      const original = respond;
      respond = (path, input, auth) =>
        path === "bookmarks.checkUrl"
          ? { bookmarkId: null }
          : original(path, input, auth);
      if (failure === "permission")
        vi.mocked(hasHostPermission).mockResolvedValue(false);
      else
        vi.mocked(capturePageWithSingleFile).mockRejectedValue(
          new Error("Capture blocked"),
        );
      mount();
      fireEvent.click(
        await screen.findByRole("button", { name: "Save Bookmark" }),
      );
      await waitFor(() => expect(mutations()).toHaveLength(1));
      expect(mutations()[0].input).not.toHaveProperty("precrawledArchiveId");
      expect(uploadSingleFileAsset).not.toHaveBeenCalled();
    },
  );

  it("does not fall back to saving the page if reading the context-menu request fails", async () => {
    browser.storage.session.get.mockRejectedValueOnce(
      new Error("Session storage unavailable"),
    );
    settings.autoSave = true;
    mount();
    expect(await screen.findByText("Session storage unavailable")).toBeTruthy();
    expect(requests).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByDisplayValue(saved.note)).toBeTruthy();
    expect(mutations()).toEqual([]);
  });

  it("does not upload or create after the account changes during capture", async () => {
    const captured = deferred<string>();
    vi.mocked(capturePageWithSingleFile).mockReturnValue(captured.promise);
    const original = respond;
    respond = (path, input, auth) =>
      path === "bookmarks.checkUrl" && auth === "Bearer account-a"
        ? { bookmarkId: null }
        : original(path, input, auth);
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Save Bookmark" }),
    );
    await waitFor(() =>
      expect(capturePageWithSingleFile).toHaveBeenCalledOnce(),
    );
    settings = { ...settings, apiKey: "account-b" };
    await act(async () => {
      for (const [listener] of browser.storage.sync.onChanged.addListener.mock
        .calls)
        listener({ settings: { newValue: settings } });
    });
    expect(await screen.findByDisplayValue(saved.note)).toBeTruthy();
    await act(async () => captured.resolve("<html>old account capture</html>"));
    expect(uploadSingleFileAsset).not.toHaveBeenCalled();
    expect(mutations()).toEqual([]);
  });

  it("automatically saves a genuinely new URL exactly once", async () => {
    const original = respond;
    respond = (path, input, auth) =>
      path === "bookmarks.checkUrl"
        ? { bookmarkId: null }
        : original(path, input, auth);
    settings.autoSave = true;
    settings.useSingleFile = false;
    mount();
    expect(await screen.findByDisplayValue(saved.note)).toBeTruthy();
    expect(mutations()).toHaveLength(1);
    expect(capturePageWithSingleFile).not.toHaveBeenCalled();
  });

  it("does not open editors or create a bookmark when a matched bookmark is missing", async () => {
    const original = respond;
    respond = (path, input, auth) => {
      if (path === "bookmarks.getBookmark")
        throw Object.assign(new Error("Bookmark not found"), {
          code: "NOT_FOUND",
        });
      return original(path, input, auth);
    };
    settings.autoSave = true;
    mount();
    expect(
      await screen.findByText(/Could not load this bookmark/),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(mutations()).toEqual([]);
  });

  it.each(["server", "network"])(
    "keeps an unsaved note and its editors mounted after a temporary %s refresh failure",
    async (failure) => {
      mount();
      const notes = await screen.findByDisplayValue(saved.note);
      const tags = await screen.findByText("Add Tags...");
      const lists = await screen.findByText("📚 Reading");
      fireEvent.change(notes, { target: { value: "Keep my unsaved note" } });
      const original = respond;
      if (failure === "server") {
        respond = (path, input, auth) => {
          if (path === "bookmarks.getBookmark")
            throw Object.assign(new Error("Temporary refresh outage"), {
              code: "INTERNAL_SERVER_ERROR",
            });
          return original(path, input, auth);
        };
      } else {
        vi.mocked(fetch).mockRejectedValueOnce(
          new TypeError("Failed to fetch"),
        );
      }
      await act(async () => {
        await expect(refreshBookmark()).rejects.toThrow();
      });
      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(screen.getByDisplayValue("Keep my unsaved note")).toBe(notes);
      expect(screen.getByText("Add Tags...")).toBe(tags);
      expect(screen.getByText("📚 Reading")).toBe(lists);
      expect(mutations()).toEqual([]);

      respond = (path, input, auth) =>
        path === "bookmarks.getBookmark"
          ? { ...saved, note: "A refreshed server note" }
          : original(path, input, auth);
      fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
      await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
      expect(screen.getByDisplayValue("Keep my unsaved note")).toBe(notes);
      fireEvent.click(screen.getByRole("button", { name: "Save Note" }));
      await waitFor(() =>
        expect(mutations()).toEqual([
          expect.objectContaining({
            path: "bookmarks.updateBookmark",
            input: { bookmarkId: "saved-id", note: "Keep my unsaved note" },
          }),
        ]),
      );
    },
  );

  it.each(["INTERNAL_SERVER_ERROR", "UNAUTHORIZED", "FORBIDDEN"])(
    "blocks editors when the initial bookmark load fails with %s",
    async (code) => {
      const original = respond;
      respond = (path, input, auth) => {
        if (path === "bookmarks.getBookmark")
          throw Object.assign(new Error("Initial bookmark unavailable"), {
            code,
          });
        return original(path, input, auth);
      };
      mount();
      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.queryByText("Add Tags...")).toBeNull();
      expect(mutations()).toEqual([]);
    },
  );

  it.each(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"])(
    "blocks cached editors after a refresh reports %s",
    async (code) => {
      mount();
      const notes = await screen.findByDisplayValue(saved.note);
      fireEvent.change(notes, { target: { value: "Inaccessible draft" } });
      const original = respond;
      respond = (path, input, auth) => {
        if (path === "bookmarks.getBookmark")
          throw Object.assign(new Error("Bookmark access lost"), { code });
        return original(path, input, auth);
      };
      await act(async () => {
        await expect(refreshBookmark()).rejects.toThrow();
      });
      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.queryByText("Add Tags...")).toBeNull();
      expect(screen.queryByText("📚 Reading")).toBeNull();
      expect(!!screen.queryByRole("link", { name: "Sign in" })).toBe(
        code === "UNAUTHORIZED",
      );
      expect(mutations()).toEqual([]);
    },
  );

  it("looks up the requested context-menu link rather than the active page", async () => {
    const contextUrl = "https://example.org/linked";
    browser.storage.session.get.mockResolvedValue({
      "karakeep-new-bookmark": {
        type: BookmarkTypes.LINK,
        url: contextUrl,
        source: "extension",
      },
    });
    mount();
    expect(await screen.findByDisplayValue(saved.note)).toBeTruthy();
    expect(
      requests.find((r) => r.path === "bookmarks.checkUrl")?.input,
    ).toEqual({ url: contextUrl });
    expect(browser.storage.session.remove).toHaveBeenCalledOnce();
    expect(mutations()).toEqual([]);
  });

  it("preserves a context-menu text save even on an already-saved page", async () => {
    browser.storage.session.get.mockResolvedValue({
      "karakeep-new-bookmark": {
        type: BookmarkTypes.TEXT,
        text: "Selected passage",
        sourceUrl: url,
        source: "extension",
      },
    });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Save Bookmark" }),
    );
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0].input).toMatchObject({
      type: BookmarkTypes.TEXT,
      text: "Selected passage",
    });
    expect(requests.some((r) => r.path === "bookmarks.checkUrl")).toBe(false);
  });

  it.each([undefined, "chrome://extensions/"])(
    "rejects a missing or unsupported tab URL: %s",
    async (tabUrl) => {
      browser.tabs.query.mockResolvedValue([{ id: 1, url: tabUrl }]);
      mount();
      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(requests).toEqual([]);
    },
  );

  it("ignores a late lookup after navigating to another URL", async () => {
    const oldLookup = deferred<unknown>();
    const original = respond;
    respond = (path, input, auth) =>
      path === "bookmarks.checkUrl" && input.url === url
        ? oldLookup.promise
        : original(path, input, auth);
    mount();
    await screen.findByText(/Checking for an existing bookmark/);
    await waitFor(() =>
      expect(requests.some((r) => r.path === "bookmarks.checkUrl")).toBe(true),
    );
    const nextUrl = "https://example.net/next";
    browser.tabs.query.mockResolvedValue([{ id: 1, url: nextUrl }]);
    await act(async () =>
      browser.tabs.onUpdated.addListener.mock.calls[0][0](
        1,
        { url: nextUrl },
        { active: true },
      ),
    );
    expect(await screen.findByDisplayValue(saved.note)).toBeTruthy();
    await act(async () => oldLookup.resolve({ bookmarkId: null }));
    expect(screen.queryByRole("button", { name: "Save Bookmark" })).toBeNull();
    expect(mutations()).toEqual([]);
  });

  it.each(["updated", "activated"])(
    "preserves an unsaved draft when another window's tab is %s",
    async (event) => {
      const original = respond;
      respond = (path, input, auth) =>
        path === "bookmarks.checkUrl"
          ? { bookmarkId: null }
          : original(path, input, auth);
      mount();
      const notes = await screen.findByPlaceholderText("Add notes...");
      const title = screen.getByPlaceholderText("Untitled");
      fireEvent.change(notes, { target: { value: "Keep this unsaved draft" } });
      fireEvent.change(title, { target: { value: "Edited draft title" } });
      const lookupsBefore = requests.length;
      const reloadedTab = deferred<(typeof currentTab)[]>();
      browser.tabs.query.mockClear().mockReturnValueOnce(reloadedTab.promise);
      await act(async () => {
        if (event === "updated") {
          browser.tabs.onUpdated.addListener.mock.calls[0][0](
            99,
            { url: "https://background.example/changed" },
            { id: 99, windowId: 20, active: true },
          );
        } else {
          browser.tabs.onActivated.addListener.mock.calls[0][0]({
            tabId: 99,
            windowId: 20,
          });
        }
      });
      await act(async () => reloadedTab.resolve([currentTab]));
      await screen.findByRole("button", { name: "Save Bookmark" });
      expect(screen.getByDisplayValue("Keep this unsaved draft")).toBe(notes);
      expect(screen.getByDisplayValue("Edited draft title")).toBe(title);
      expect(browser.tabs.query).not.toHaveBeenCalled();
      expect(requests).toHaveLength(lookupsBefore);
      expect(mutations()).toEqual([]);
      expect(capturePageWithSingleFile).not.toHaveBeenCalled();
      expect(uploadSingleFileAsset).not.toHaveBeenCalled();
    },
  );

  it("cancels the old lookup when another tab becomes active in the target window", async () => {
    const oldLookup = deferred<unknown>();
    const original = respond;
    respond = (path, input, auth) =>
      path === "bookmarks.checkUrl" && input.url === url
        ? oldLookup.promise
        : original(path, input, auth);
    settings.autoSave = true;
    mount();
    await waitFor(() =>
      expect(requests.some((r) => r.path === "bookmarks.checkUrl")).toBe(true),
    );
    const nextUrl = "https://example.net/next-tab";
    browser.tabs.query.mockResolvedValue([
      { id: 2, windowId: 10, active: true, url: nextUrl },
    ]);
    await act(async () => {
      browser.tabs.onActivated.addListener.mock.calls[0][0]({
        tabId: 2,
        windowId: 10,
      });
    });
    expect(await screen.findByDisplayValue(saved.note)).toBeTruthy();
    expect(browser.tabs.query).toHaveBeenLastCalledWith({
      active: true,
      windowId: 10,
    });
    await act(async () => oldLookup.resolve({ bookmarkId: null }));
    expect(mutations()).toEqual([]);
    expect(capturePageWithSingleFile).not.toHaveBeenCalled();
  });

  it.each([
    { event: "updated", pending: "session read" },
    { event: "activated", pending: "session read" },
    { event: "updated", pending: "tab query and session read" },
    { event: "activated", pending: "tab query and session read" },
  ])(
    "uses the current target when it is $event during the initial $pending",
    async ({ event, pending }) => {
      const session = deferred<Record<string, never>>();
      const initialTab = deferred<(typeof currentTab)[]>();
      browser.storage.session.get.mockReturnValue(session.promise);
      if (pending === "tab query and session read") {
        browser.tabs.query.mockReturnValueOnce(initialTab.promise);
      }
      const original = respond;
      respond = (path, input, auth) =>
        path === "bookmarks.checkUrl" && input.url === url
          ? { bookmarkId: null }
          : original(path, input, auth);
      settings.autoSave = true;
      settings.useSingleFile = false;
      mount();
      await waitFor(() => expect(browser.tabs.query).toHaveBeenCalled());

      const next = {
        ...currentTab,
        id: event === "activated" ? 2 : currentTab.id,
        url: "https://example.net/already-saved",
        title: "Current target",
      };
      browser.tabs.query.mockResolvedValue([next]);
      await act(async () => {
        if (event === "updated") {
          browser.tabs.onUpdated.addListener.mock.calls[0][0](
            next.id,
            { url: next.url },
            next,
          );
        } else {
          browser.tabs.onActivated.addListener.mock.calls[0][0]({
            tabId: next.id,
            windowId: next.windowId,
          });
        }
        initialTab.resolve([currentTab]);
        session.resolve({});
      });
      await waitFor(() =>
        expect(requests.some((r) => r.path === "bookmarks.checkUrl")).toBe(
          true,
        ),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
      });
      expect(mutations()).toEqual([]);
      expect(
        requests
          .filter((r) => r.path === "bookmarks.checkUrl")
          .map((r) => r.input.url),
      ).toEqual([next.url]);
      expect(await screen.findByDisplayValue(saved.note)).toBeTruthy();
      expect(capturePageWithSingleFile).not.toHaveBeenCalled();
      expect(uploadSingleFileAsset).not.toHaveBeenCalled();
    },
  );

  it("preserves a draft on duplicate events for the current target", async () => {
    const original = respond;
    respond = (path, input, auth) =>
      path === "bookmarks.checkUrl"
        ? { bookmarkId: null }
        : original(path, input, auth);
    mount();
    const notes = await screen.findByPlaceholderText("Add notes...");
    const title = screen.getByPlaceholderText("Untitled");
    fireEvent.change(notes, { target: { value: "Keep this unsaved draft" } });
    fireEvent.change(title, { target: { value: "Edited draft title" } });
    const queriesBefore = browser.tabs.query.mock.calls.length;
    const lookupsBefore = requests.length;
    await act(async () => {
      browser.tabs.onUpdated.addListener.mock.calls[0][0](
        currentTab.id,
        { url },
        currentTab,
      );
      browser.tabs.onActivated.addListener.mock.calls[0][0]({
        tabId: currentTab.id,
        windowId: currentTab.windowId,
      });
    });
    expect(screen.getByDisplayValue("Keep this unsaved draft")).toBe(notes);
    expect(screen.getByDisplayValue("Edited draft title")).toBe(title);
    expect(browser.tabs.query).toHaveBeenCalledTimes(queriesBefore);
    expect(requests).toHaveLength(lookupsBefore);
    expect(mutations()).toEqual([]);
  });

  it.each(["apiKey", "address", "customHeaders"] as const)(
    "discards the old editor and cache when %s changes",
    async (field) => {
      mount();
      await screen.findByDisplayValue(saved.note);
      const original = respond;
      respond = (path, input, auth) => {
        if (path === "bookmarks.checkUrl")
          throw new Error("New account unavailable");
        return original(path, input, auth);
      };
      settings = {
        ...settings,
        [field]:
          field === "customHeaders"
            ? { "X-Account": "b" }
            : field === "address"
              ? "https://other.karakeep.test"
              : "account-b",
      };
      await act(async () => {
        for (const [listener] of browser.storage.sync.onChanged.addListener.mock
          .calls)
          listener({ settings: { newValue: settings } });
      });
      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(window.location.hash).toBe("#/");
      expect(screen.queryByDisplayValue(saved.note)).toBeNull();
      expect(mutations()).toEqual([]);
    },
  );

  it.each(["signin", "options"])(
    "preserves the %s route when server settings change",
    async (route) => {
      window.location.hash = `/${route}`;
      mount();
      await screen.findByText(
        route === "signin" ? "Sign in page" : "Options page",
      );
      settings = { ...settings, address: "https://other.karakeep.test" };
      await act(async () => {
        for (const [listener] of browser.storage.sync.onChanged.addListener.mock
          .calls)
          listener({ settings: { newValue: settings } });
      });
      expect(window.location.hash).toBe(`#/${route}`);
      expect(requests).toEqual([]);
    },
  );
});
