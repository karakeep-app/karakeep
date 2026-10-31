import { readFile } from "node:fs/promises";
import { expect } from "playwright/test";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { createWebTestUser, it, signIn } from "../../utils/browser";

it("attaches multiple generic files through the web picker and downloads identical bytes", async ({
  page,
}) => {
  const { trpc, email } = await createWebTestUser();
  const bookmark = await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    text: "Files for a printing project",
    note: "Preserve this note",
  });
  await signIn(page, email);
  await page.goto(`/dashboard/preview/${bookmark.id}`);
  const binaryStl = Buffer.alloc(134);
  binaryStl.writeUInt32LE(1, 80);
  const files = [
    {
      name: "ascii.stl",
      mimeType: "model/stl",
      buffer: Buffer.from("solid triangle\nendsolid triangle\n"),
    },
    { name: "binary.stl", mimeType: "model/stl", buffer: binaryStl },
    {
      name: "triangle.3mf",
      mimeType: "model/3mf",
      buffer: await readFile(
        new URL("../../fixtures/triangle.3mf", import.meta.url),
      ),
    },
    {
      name: "archive.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(
        "UEsDBBQAAAAAAAAAIVAMfn/YBAAAAAQAAAAIAAAAdGVzdC50eHR0ZXN0UEsBAhQDFAAAAAAAAAAhUAx+f9gEAAAABAAAAAgAAAAAAAAAAAAAAIABAAAAAHRlc3QudHh0UEsFBgAAAAABAAEANgAAACoAAAAAAA==",
        "base64",
      ),
    },
    {
      name: "unknown.bin",
      mimeType: "application/octet-stream",
      buffer: Buffer.from([0, 255, 19, 128]),
    },
  ];
  const picker = page
    .getByTitle("Upload File", { exact: true })
    .filter({ visible: true })
    .locator("..")
    .locator('input[type="file"]');
  await picker.setInputFiles(files);
  for (const file of files) {
    const link = page
      .getByRole("link", { name: file.name, exact: true })
      .filter({ visible: true });
    await expect(link).toBeVisible();
    const response = await page.request.get((await link.getAttribute("href"))!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"]).toMatch(/^attachment;/);
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(await response.body()).toEqual(file.buffer);
  }
  const after = await trpc.bookmarks.getBookmark.query({
    bookmarkId: bookmark.id,
  });
  expect(after.note).toBe(bookmark.note);
  expect(after.content).toEqual(bookmark.content);
  expect(after.assets).toHaveLength(files.length);
});
