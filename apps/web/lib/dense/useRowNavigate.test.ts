// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { shouldIgnoreRowClick } from "./useRowNavigate";

/** Builds a row containing a title link, a tag link and a button. */
function buildRow() {
  const row = document.createElement("div");
  row.innerHTML = `
    <div class="content">
      <a class="title" href="/dashboard/preview/abc">A bookmark title</a>
      <p class="summary">Some summary text.</p>
      <a class="tag" href="/dashboard/tags/xyz">a-tag</a>
      <button class="fav" aria-label="Favourite"><svg></svg></button>
    </div>
  `;
  document.body.appendChild(row);
  return row;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("shouldIgnoreRowClick", () => {
  it("navigates on a click on the row's own padding", () => {
    const row = buildRow();
    expect(shouldIgnoreRowClick(row, row, false)).toBe(false);
  });

  it("navigates on a click on non-interactive text inside the row", () => {
    const row = buildRow();
    const summary = row.querySelector(".summary")!;
    expect(shouldIgnoreRowClick(row, summary, false)).toBe(false);
  });

  it("ignores a click on the title link, letting the link navigate itself", () => {
    const row = buildRow();
    const title = row.querySelector(".title")!;
    expect(shouldIgnoreRowClick(row, title, false)).toBe(true);
  });

  it("ignores a click on a tag link so it goes to the tag, not the bookmark", () => {
    const row = buildRow();
    const tag = row.querySelector(".tag")!;
    expect(shouldIgnoreRowClick(row, tag, false)).toBe(true);
  });

  it("ignores a click on an icon nested inside a button", () => {
    const row = buildRow();
    const icon = row.querySelector(".fav svg")!;
    expect(shouldIgnoreRowClick(row, icon, false)).toBe(true);
  });

  it("ignores the mouse-up that ends a text drag-selection", () => {
    const row = buildRow();
    const summary = row.querySelector(".summary")!;
    expect(shouldIgnoreRowClick(row, summary, true)).toBe(true);
  });

  // The regression this hook shipped with: the row's overflow menu renders
  // Radix Edit/Delete dialogs, which portal to <body> but remain React
  // children of the row — so their clicks bubble here through the React
  // tree. Clicking dialog padding or the backdrop used to navigate away and
  // tear the dialog down mid-edit.
  it("ignores clicks from portaled content rendered outside the row", () => {
    const row = buildRow();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.innerHTML = `<input class="field" /><h2>Edit Bookmark</h2>`;
    document.body.appendChild(dialog);

    expect(shouldIgnoreRowClick(row, dialog, false)).toBe(true);
    expect(shouldIgnoreRowClick(row, dialog.querySelector("h2")!, false)).toBe(
      true,
    );
    expect(
      shouldIgnoreRowClick(row, dialog.querySelector(".field")!, false),
    ).toBe(true);
  });

  it("ignores a click on a portaled backdrop", () => {
    const row = buildRow();
    const overlay = document.createElement("div");
    document.body.appendChild(overlay);
    expect(shouldIgnoreRowClick(row, overlay, false)).toBe(true);
  });
});
