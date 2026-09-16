import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saved: "",
  handler: vi.fn(),
  draw: vi.fn(),
  background: vi.fn(),
  widgets: [
    { widgetName: "KarakeepSearch", widgetId: 1, height: 300, width: 300 },
  ],
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => mocks.saved),
  setItemAsync: vi.fn(async (_key: string, value: string) => {
    mocks.saved = value;
  }),
}));
vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_event: string, callback: unknown) => {
      mocks.background = callback as typeof mocks.background;
    },
  },
}));
vi.mock("react-native-android-widget", () => ({
  registerWidgetTaskHandler: (handler: unknown) => {
    mocks.handler = handler as typeof mocks.handler;
  },
  getWidgetInfo: async () => mocks.widgets,
  requestWidgetUpdateById: async ({
    renderWidget,
  }: {
    renderWidget: (info: unknown) => Promise<unknown>;
  }) => {
    mocks.draw(await renderWidget(mocks.widgets[0]));
  },
}));
vi.mock("./SearchWidget", () => ({ SearchWidget: () => null }));

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.widgets = [
    { widgetName: "KarakeepSearch", widgetId: 1, height: 300, width: 300 },
  ];
  mocks.saved = JSON.stringify({
    apiKey: "test-key",
    address: "https://example.com",
  });
  await import("./runtime.android");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function update(widgetAction = "WIDGET_UPDATE") {
  return mocks.handler({
    widgetInfo: mocks.widgets[0],
    widgetAction,
    renderWidget: mocks.draw,
  });
}

it("reads persisted settings in a headless task and provides both system themes", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ bookmarks: [] })),
  );
  await update();
  const widget = mocks.draw.mock.calls[0][0];
  expect(widget.light.props.dark).toBe(false);
  expect(widget.dark.props.dark).toBe(true);
  expect(widget.light.props.data.message).toBe("No matching bookmarks.");
});

it("clears the widget at logout and discards an older account's pending response", async () => {
  const { promise, resolve } = Promise.withResolvers<Response>();
  const fetchMock = vi.fn().mockReturnValue(promise);
  vi.stubGlobal("fetch", fetchMock);
  const pending = update();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  const { useSettings } = await import("../lib/settings");
  await useSettings
    .getState()
    .setSettings(useSettings.getState().settings.settings);
  await vi.waitFor(() => expect(mocks.draw).toHaveBeenCalledOnce());
  expect(mocks.draw.mock.calls[0][0].light.props.data.message).toBe(
    "Open Karakeep to sign in.",
  );
  resolve(
    Response.json({
      bookmarks: [
        {
          id: "private",
          title: "Private bookmark",
          tags: [],
          content: { type: "text" },
        },
      ],
    }),
  );
  await pending;
  expect(mocks.draw).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});

it("does not redraw a deleted widget after its request finishes", async () => {
  const { promise, resolve } = Promise.withResolvers<Response>();
  const fetchMock = vi.fn().mockReturnValue(promise);
  vi.stubGlobal("fetch", fetchMock);
  const pending = update();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  await update("WIDGET_DELETED");
  resolve(Response.json({ bookmarks: [] }));
  await pending;
  expect(mocks.draw).not.toHaveBeenCalled();
});

it("bounds failed network requests and displays a retry message", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    ),
  );
  const pending = update();
  await vi.advanceTimersByTimeAsync(10_000);
  await pending;
  expect(mocks.draw.mock.calls[0][0].light.props.data.message).toBe(
    "Couldn't load bookmarks. Tap refresh to retry.",
  );
});

it("makes no network requests on leaving the app when no widgets are installed", async () => {
  mocks.widgets = [];
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  mocks.background("background");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetchMock).not.toHaveBeenCalled();
});
