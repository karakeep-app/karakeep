// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";

import SortOrderToggle from "./SortOrderToggle";

vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/hooks/bookmark-search", () => ({
  useBookmarkSearchState: () => ({ effectiveSearchMode: "fts" }),
}));

afterEach(cleanup);

describe("SortOrderToggle tooltip", () => {
  it("does not reopen after selecting an option, but still appears on subsequent keyboard focus", async () => {
    render(
      <TooltipProvider>
        <SortOrderToggle />
      </TooltipProvider>,
    );
    const trigger = screen.getByRole("button");
    await act(async () => trigger.focus());
    expect(screen.getByRole("tooltip").textContent).toBe("actions.sort.title");
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: "actions.sort.oldest_first",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(useSortOrderStore.getState().sortOrder).toBe("asc");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.getByRole("button", { name: "actions.sort.title" })).toBe(
      trigger,
    );

    await act(async () => trigger.blur());
    await act(async () => trigger.focus());
    expect(screen.getByRole("tooltip").textContent).toBe("actions.sort.title");
  });
});
