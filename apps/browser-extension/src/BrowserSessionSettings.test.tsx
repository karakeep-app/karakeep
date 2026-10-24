// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Settings } from "./utils/settings";
import BrowserSessionSettings from "./BrowserSessionSettings";

const state = vi.hoisted(() => ({
  settings: { address: "https://bookmarks.example/karakeep" } as Settings,
  save: vi.fn(),
  request: vi.fn<() => Promise<boolean>>(),
  openTab: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("./utils/settings", async () => {
  const { useState } = await import("react");
  return {
    default: function usePluginSettings() {
      const [settings, setState] = useState(state.settings);
      return {
        settings,
        setSettings: async (update: (settings: Settings) => Settings) => {
          const next = update(settings);
          state.save(next);
          setState(next);
        },
      };
    },
  };
});

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  state.settings = {
    address: "https://bookmarks.example/karakeep",
  } as Settings;
  state.save.mockReset();
  state.request.mockReset();
  state.openTab.mockReset();
  state.remove.mockReset();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("chrome", {
    permissions: { request: state.request, remove: state.remove },
    tabs: { create: state.openTab },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render() {
  await act(async () => root.render(<BrowserSessionSettings />));
  return container.querySelector<HTMLButtonElement>('[role="switch"]')!;
}

it("starts off, has an associated label, and explains the server session", async () => {
  const toggle = await render();
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(container.querySelector("label")!.htmlFor).toBe(toggle.id);
  expect(
    document.getElementById(toggle.getAttribute("aria-describedby")!)!
      .textContent,
  ).toContain("Your Karakeep login is still required");
  expect(state.request).not.toHaveBeenCalled();
});

it("leaves storage unchanged and explains a denied host permission", async () => {
  state.request.mockResolvedValue(false);
  const toggle = await render();
  await act(async () => toggle.click());
  expect(state.request).toHaveBeenCalledExactlyOnceWith({
    origins: ["https://bookmarks.example/*"],
  });
  expect(state.save).not.toHaveBeenCalled();
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(container.querySelector('[role="alert"]')!.textContent).toContain(
    "not granted",
  );
});

it("stores only the origin after a grant, opens the server, and can turn cookie inclusion off", async () => {
  state.request.mockResolvedValue(true);
  const toggle = await render();
  await act(async () => toggle.click());
  expect(state.save).toHaveBeenLastCalledWith(
    expect.objectContaining({
      browserSessionOrigin: "https://bookmarks.example",
    }),
  );
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  const openButton = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((b) => b.textContent === "Open server to sign in")!;
  await act(async () => openButton.click());
  expect(state.openTab).toHaveBeenCalledWith({
    url: "https://bookmarks.example/karakeep",
  });
  await act(async () => toggle.click());
  expect(state.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ browserSessionOrigin: undefined }),
  );
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  // Shared host permissions (e.g. crawling) must not be revoked here.
  expect(state.remove).not.toHaveBeenCalled();
});

it("handles a permission API error without saving the opt-in", async () => {
  state.request.mockRejectedValue(new Error("Test permission failure"));
  const toggle = await render();
  await act(async () => toggle.click());
  expect(state.save).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')!.textContent).toContain(
    "Could not update",
  );
  expect(toggle.disabled).toBe(false);
});

it("disables the switch for an invalid server address", async () => {
  state.settings.address = "file:///tmp/bookmarks";
  const toggle = await render();
  expect(toggle.disabled).toBe(true);
  expect(state.request).not.toHaveBeenCalled();
});

it("does not show another server's saved opt-in as enabled", async () => {
  state.settings.browserSessionOrigin = "https://other.example";
  const toggle = await render();
  expect(toggle.getAttribute("aria-checked")).toBe("false");
});

it("reports a storage failure when disabling and keeps the last saved mode", async () => {
  state.settings.browserSessionOrigin = "https://bookmarks.example";
  state.save.mockImplementationOnce(() => {
    throw new Error("Test storage failure");
  });
  const toggle = await render();
  await act(async () => toggle.click());
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(toggle.disabled).toBe(false);
  expect(container.querySelector('[role="alert"]')!.textContent).toContain(
    "Could not update",
  );
  expect(state.request).not.toHaveBeenCalled();
});
