import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import type { Settings } from "./settings";
import { Providers } from "./providers";

const state = vi.hoisted(() => ({
  settings: {
    address: "https://bookmarks.example",
    theme: "system",
  } as Settings,
  provider: vi.fn(),
}));
vi.mock("./settings", () => ({
  default: () => ({ settings: state.settings, setSettings: vi.fn() }),
}));
vi.mock("@karakeep/shared-react/providers/trpc-provider", () => ({
  TRPCSettingsProvider: ({
    settings,
    children,
  }: {
    settings: Settings;
    children: React.ReactNode;
  }) => {
    state.provider(settings);
    return children;
  },
}));

beforeEach(() => {
  state.settings.browserSessionOrigin = undefined;
  state.provider.mockClear();
});

it.each([undefined, "https://bookmarks.example", "https://other.example"])(
  "passes the server-scoped cookie mode to the real popup provider (%s)",
  (browserSessionOrigin) => {
    state.settings.browserSessionOrigin = browserSessionOrigin;
    renderToStaticMarkup(
      <Providers>
        <span>Popup</span>
      </Providers>,
    );
    expect(state.provider).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials:
          browserSessionOrigin === state.settings.address
            ? "include"
            : undefined,
      }),
    );
  },
);
