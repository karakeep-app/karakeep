import { describe, expect, test } from "vitest";

import {
  GET as getApiCatalog,
  HEAD as headApiCatalog,
} from "./api-catalog/route";
import { GET as getChangePassword } from "./change-password/route";
import { GET as getSecurityTxt } from "./security.txt/route";

describe("well-known routes", () => {
  test("serves security.txt with the required fields", async () => {
    const response = getSecurityTxt();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(body).toContain("Contact: mailto:security@karakeep.app\n");
    expect(body).toContain("Expires: 2027-08-01T00:00:00Z\n");
    expect(body).toContain("Preferred-Languages: en\n");
  });

  test("redirects password managers to account security settings", () => {
    const response = getChangePassword();

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/settings/info#security");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("serves an RFC 9727 API catalog", async () => {
    const response = getApiCatalog();
    const body = (await response.json()) as {
      linkset: {
        anchor: string;
        item?: { href: string }[];
      }[];
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
    );
    expect(response.headers.get("Link")).toContain('rel="api-catalog"');
    expect(body.linkset[0]?.item?.[0]?.href).toBe(
      "http://localhost:3000/api/v1",
    );
  });

  test("serves API catalog headers for HEAD requests", async () => {
    const response = headApiCatalog();

    expect(response.status).toBe(200);
    expect(response.headers.get("Link")).toContain('rel="api-catalog"');
    expect(await response.text()).toBe("");
  });
});
