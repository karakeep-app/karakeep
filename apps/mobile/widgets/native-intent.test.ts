import { afterEach, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  OS: "android",
  url: null as string | null,
}));
vi.mock("react-native", () => ({ Platform: native }));
vi.mock("expo-linking", () => ({ getLinkingURL: () => native.url }));

import { redirectSystemPath } from "../app/+native-intent";

afterEach(() => {
  native.OS = "android";
  native.url = null;
});

it("recovers a widget link delivered while Android restores a killed app", () => {
  native.url = "karakeep:///dashboard/bookmarks/article?view=reader";
  expect(redirectSystemPath({ path: "/", initial: true })).toBe(native.url);
});

it("keeps normal startup and subsequent links unchanged", () => {
  expect(redirectSystemPath({ path: "/", initial: true })).toBe("/");
  native.url = "karakeep:///dashboard/bookmarks/older?view=reader";
  expect(
    redirectSystemPath({ path: "/dashboard/settings", initial: false }),
  ).toBe("/dashboard/settings");
});

it("preserves iOS initial-link handling", () => {
  native.OS = "ios";
  native.url = "karakeep:///dashboard/bookmarks/older?view=reader";
  expect(redirectSystemPath({ path: "/sharing", initial: true })).toBe(
    "/sharing",
  );
});
