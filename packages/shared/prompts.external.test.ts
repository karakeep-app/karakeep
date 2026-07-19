import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as defaultPrompts from "./prompts";
import * as externalPrompts from "./prompts.external";

describe("prompts.external", () => {
  let dir: string;
  let savedPromptsDir: string | undefined;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "karakeep-prompts-"));
    savedPromptsDir = process.env.PROMPTS_DIR;
    process.env.PROMPTS_DIR = dir;
  });

  afterEach(() => {
    if (savedPromptsDir === undefined) {
      delete process.env.PROMPTS_DIR;
    } else {
      process.env.PROMPTS_DIR = savedPromptsDir;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to the built-in prompts when no override files exist", () => {
    expect(
      externalPrompts.constructTextTaggingPrompt(
        "english",
        ["be brief"],
        "some content",
        "lowercase-hyphens",
        ["tech", "news"],
      ),
    ).toEqual(
      defaultPrompts.constructTextTaggingPrompt(
        "english",
        ["be brief"],
        "some content",
        "lowercase-hyphens",
        ["tech", "news"],
      ),
    );
    expect(
      externalPrompts.constructSummaryPrompt("english", [], "some content"),
    ).toEqual(
      defaultPrompts.constructSummaryPrompt("english", [], "some content"),
    );
    expect(
      externalPrompts.buildImagePrompt("english", [], "as-generated"),
    ).toEqual(defaultPrompts.buildImagePrompt("english", [], "as-generated"));
    expect(externalPrompts.buildOCRPrompt()).toEqual(
      defaultPrompts.buildOCRPrompt(),
    );
  });

  it("renders an override template with placeholders substituted", () => {
    fs.writeFileSync(
      path.join(dir, "text-tagging.txt"),
      "Tag in {{lang}}:\n{{customPrompts}}\n<C>{{content}}</C>",
    );
    expect(
      externalPrompts.constructTextTaggingPrompt(
        "german",
        ["rule one", "rule two"],
        "hello world",
        "as-generated",
      ),
    ).toEqual("Tag in german:\n- rule one\n- rule two\n<C>hello world</C>");
  });

  it("substitutes tag style and curated tags instructions", () => {
    fs.writeFileSync(
      path.join(dir, "image-tagging.txt"),
      "{{tagStyle}}|{{curatedTags}}",
    );
    const prompt = externalPrompts.buildImagePrompt(
      "english",
      [],
      "lowercase-hyphens",
      ["tech"],
    );
    expect(prompt).toContain("lowercase letters with hyphens");
    expect(prompt).toContain("ONLY use tags from this predefined list: [tech]");
  });

  it("uses the ocr override verbatim", () => {
    fs.writeFileSync(path.join(dir, "ocr.txt"), "Extract the text.");
    expect(externalPrompts.buildOCRPrompt()).toEqual("Extract the text.");
  });

  it("leaves unknown placeholders intact", () => {
    fs.writeFileSync(
      path.join(dir, "summary.txt"),
      "Summarize in {{lang}} {{unknownVar}}: {{content}}",
    );
    expect(
      externalPrompts.constructSummaryPrompt("english", [], "abc"),
    ).toEqual("Summarize in english {{unknownVar}}: abc");
  });

  it("picks up changes to an override file", () => {
    const file = path.join(dir, "ocr.txt");
    fs.writeFileSync(file, "version one");
    expect(externalPrompts.buildOCRPrompt()).toEqual("version one");

    fs.writeFileSync(file, "version two");
    // Force a distinct mtime in case both writes land in the same tick.
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(file, future, future);
    expect(externalPrompts.buildOCRPrompt()).toEqual("version two");
  });

  it("lists override templates, with null for missing ones", () => {
    fs.writeFileSync(path.join(dir, "summary.txt"), "custom summary");
    fs.writeFileSync(path.join(dir, "ocr.txt"), "custom ocr");
    expect(externalPrompts.getExternalPromptTemplates()).toEqual({
      textTagging: null,
      imageTagging: null,
      summary: "custom summary",
      ocr: "custom ocr",
    });
  });

  it("falls back again when an override file is removed", () => {
    const file = path.join(dir, "ocr.txt");
    fs.writeFileSync(file, "override");
    expect(externalPrompts.buildOCRPrompt()).toEqual("override");
    fs.rmSync(file);
    expect(externalPrompts.buildOCRPrompt()).toEqual(
      defaultPrompts.buildOCRPrompt(),
    );
  });
});
