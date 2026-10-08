import { describe, expect, it } from "vitest";

import { getReadOnlyModeError } from "./readOnlyMode";

describe("getReadOnlyModeError", () => {
  it("returns no error when writes are allowed", () => {
    expect(
      getReadOnlyModeError({ demoMode: undefined, degradedMode: false }),
    ).toBeNull();
  });

  it("returns the demo mode error", () => {
    expect(getReadOnlyModeError({ demoMode: {}, degradedMode: false })).toBe(
      "Mutations are not allowed in demo mode",
    );
  });

  it("returns the degraded mode error", () => {
    expect(
      getReadOnlyModeError({ demoMode: undefined, degradedMode: true }),
    ).toBe("Karakeep is degraded and in read-only mode");
  });
});
