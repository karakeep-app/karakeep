import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_WIDGET_QUERY, searchWidgetBookmarks } from "./search";

const settings = {
  address: "https://example.com/karakeep/",
  apiKey: "test-token",
  customHeaders: { "CF-Access-Client-Id": "test-client" },
  widgetSearchQuery: DEFAULT_WIDGET_QUERY,
};

afterEach(() => vi.unstubAllGlobals());

describe("widget search", () => {
  it("preserves server subpaths, credentials, custom headers and arbitrary queries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ bookmarks: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    const query = 'is:fav -is:archived age:<1w #café "a & b"';
    await searchWidgetBookmarks(
      { ...settings, widgetSearchQuery: query },
      signal,
    );
    const [url, options] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toBe("/karakeep/api/v1/bookmarks/search");
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({
      q: query,
      limit: "50",
      includeContent: "false",
    });
    expect(options).toEqual({
      signal,
      headers: {
        Authorization: "Bearer test-token",
        "CF-Access-Client-Id": "test-client",
      },
    });
  });

  it("uses the default query and permits an empty query to search all bookmarks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ bookmarks: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await searchWidgetBookmarks(settings, new AbortController().signal);
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("q")).toBe(
      "-is:archived",
    );
    fetchMock.mockResolvedValue(Response.json({ bookmarks: [] }));
    await searchWidgetBookmarks(
      { ...settings, widgetSearchQuery: "" },
      new AbortController().signal,
    );
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("q")).toBe("");
  });

  it("shows titles, domains and tags for links, text and assets in API order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          bookmarks: [
            {
              id: "link",
              title: "My title",
              createdAt: "2026-09-01T12:00:00Z",
              tags: [{ name: "read" }],
              content: {
                type: "link",
                url: "https://docs.example.com/a",
                title: "Page title",
              },
            },
            { id: "text", title: null, tags: [], content: { type: "text" } },
            {
              id: "asset",
              title: null,
              tags: [{ name: "pdf" }],
              content: { type: "asset", fileName: "paper.pdf" },
            },
            {
              id: "bad-url",
              title: "",
              tags: [],
              content: { type: "link", title: "Fallback", url: "invalid" },
            },
          ],
        }),
      ),
    );
    expect(
      await searchWidgetBookmarks(settings, new AbortController().signal),
    ).toEqual({
      bookmarks: [
        { id: "link", title: "My title", metadata: "docs.example.com · #read" },
        { id: "text", title: "Text bookmark", metadata: "" },
        { id: "asset", title: "paper.pdf", metadata: "#pdf" },
        { id: "bad-url", title: "Fallback", metadata: "" },
      ],
    });
  });

  it("does not send a request while signed out", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await searchWidgetBookmarks(
        { ...settings, apiKey: undefined },
        new AbortController().signal,
      ),
    ).toEqual({
      bookmarks: [],
      message: "Open Karakeep to sign in.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [400, "Check the search query in widget settings."],
    [401, "Open Karakeep to check your sign-in and server access."],
    [403, "Open Karakeep to check your sign-in and server access."],
    [500, "Couldn't load bookmarks. Tap refresh to retry."],
  ])(
    "handles HTTP %s without exposing the response body",
    async (status, message) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response("private server diagnostic", { status }),
          ),
      );
      expect(
        await searchWidgetBookmarks(settings, new AbortController().signal),
      ).toEqual({ bookmarks: [], message });
    },
  );
});
