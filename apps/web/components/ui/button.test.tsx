// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ButtonWithTooltip } from "./button";
import { TooltipProvider } from "./tooltip";

afterEach(cleanup);

describe("ButtonWithTooltip focus", () => {
  it("keeps restored pointer focus without reopening the tooltip", async () => {
    const onFocus = vi.fn();
    render(
      <TooltipProvider>
        <ButtonWithTooltip tooltip="Sort" onFocus={onFocus}>
          Sort bookmarks
        </ButtonWithTooltip>
      </TooltipProvider>,
    );
    const button = screen.getByRole("button", { name: "Sort bookmarks" });
    // jsdom does not track pointer/keyboard modality for :focus-visible.
    vi.spyOn(button, "matches").mockReturnValue(false);
    await act(async () => button.focus());

    expect(document.activeElement).toBe(button);
    expect(onFocus).toHaveBeenCalledOnce();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("continues to show the tooltip when keyboard focus reaches the button", async () => {
    render(
      <TooltipProvider>
        <ButtonWithTooltip tooltip="Sort">Sort bookmarks</ButtonWithTooltip>
      </TooltipProvider>,
    );
    const button = screen.getByRole("button", { name: "Sort bookmarks" });
    vi.spyOn(button, "matches").mockReturnValue(true);
    await act(async () => button.focus());

    expect(document.activeElement).toBe(button);
    expect(screen.getByRole("tooltip").textContent).toBe("Sort");
  });
});
