import { beforeEach, describe, expect, it, vi } from "vitest";

import { USER_LOCAL_SETTINGS_COOKIE_NAME } from "./types";
import {
  getUserLocalSettings,
  updateGridColumns,
  updateShowNewItemCard,
} from "./userLocalSettings";

const cookieStore = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { value };
    },
    set: ({ name, value }: { name: string; value: string }) => {
      cookieStore.set(name, value);
    },
  }),
}));

describe("new item card preference", () => {
  beforeEach(() => cookieStore.clear());

  it("shows the card with an existing settings cookie", async () => {
    cookieStore.set(
      USER_LOCAL_SETTINGS_COOKIE_NAME,
      JSON.stringify({ bookmarkGridLayout: "list", showNotes: true }),
    );

    expect(await getUserLocalSettings()).toMatchObject({
      bookmarkGridLayout: "list",
      showNotes: true,
      showNewItemCard: true,
    });
  });

  it("persists both values alongside the other display settings", async () => {
    await updateShowNewItemCard(false);
    await updateGridColumns(4);
    expect(await getUserLocalSettings()).toMatchObject({
      gridColumns: 4,
      showNewItemCard: false,
    });

    await updateShowNewItemCard(true);
    expect(await getUserLocalSettings()).toMatchObject({
      gridColumns: 4,
      showNewItemCard: true,
    });
  });
});
