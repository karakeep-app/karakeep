// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditBrokenLinkDialog } from "./EditBrokenLinkDialog";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  onSuccess: () => undefined,
  onError: (_error: Error) => undefined,
}));

vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/clientConfig", () => ({
  useClientConfig: () => ({ demoMode: false }),
}));
vi.mock("@karakeep/shared-react/trpc", () => ({
  useTRPC: () => ({
    bookmarks: {
      getBrokenLinks: { pathFilter: () => ({ queryKey: ["broken-links"] }) },
    },
  }),
}));
vi.mock("@karakeep/shared-react/hooks/bookmarks", () => ({
  useUpdateBookmark: (options: Pick<typeof mocks, "onSuccess" | "onError">) => {
    mocks.onSuccess = options.onSuccess;
    mocks.onError = options.onError;
    return { mutate: mocks.mutate, isPending: false };
  },
}));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

function setup() {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <EditBrokenLinkDialog
        bookmarkId="broken-1"
        url="https://example.com/dead"
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "actions.edit" }));
  return {
    invalidate,
    input: screen.getByLabelText("common.url") as HTMLInputElement,
  };
}

describe("EditBrokenLinkDialog", () => {
  it("saves only the URL for the selected bookmark and refreshes broken links", async () => {
    const { input, invalidate } = setup();
    expect(input.value).toBe("https://example.com/dead");
    fireEvent.change(input, {
      target: { value: "https://example.com/repaired" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "bookmark_editor.save_changes" }),
    );
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        bookmarkId: "broken-1",
        url: "https://example.com/repaired",
      }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    act(() => mocks.onSuccess());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["broken-links"] });
  });

  it.each(["not a URL", "javascript:alert(1)"])(
    "rejects invalid bookmark URL %s",
    async (url) => {
      const { input } = setup();
      fireEvent.change(input, { target: { value: url } });
      fireEvent.click(
        screen.getByRole("button", { name: "bookmark_editor.save_changes" }),
      );
      await waitFor(() =>
        expect(input.getAttribute("aria-invalid")).toBe("true"),
      );
      expect(mocks.mutate).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeTruthy();
    },
  );

  it("retains the edited URL and shows a server error when saving fails", async () => {
    const { input, invalidate } = setup();
    fireEvent.change(input, {
      target: { value: "https://example.com/repaired" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "bookmark_editor.save_changes" }),
    );
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled());
    act(() => mocks.onError(new Error("This URL is already bookmarked")));
    expect(screen.getByRole("alert").textContent).toBe(
      "This URL is already bookmarked",
    );
    expect(input.value).toBe("https://example.com/repaired");
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("discards unsaved changes when canceled and reopened", async () => {
    const { input } = setup();
    fireEvent.change(input, {
      target: { value: "https://example.com/unsaved" },
    });
    fireEvent.click(screen.getByRole("button", { name: "actions.cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "actions.edit" }));
    expect(
      (screen.getByLabelText("common.url") as HTMLInputElement).value,
    ).toBe("https://example.com/dead");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
