import { performance } from "node:perf_hooks";
import { setImmediate } from "node:timers/promises";
import { Tiktoken } from "tiktoken/lite";
import o200k from "tiktoken/encoders/o200k_base";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { constructSummaryPrompt } from "./prompts";
import { buildSummaryPrompt, buildTextPrompt } from "./prompts.server";

let enc: Tiktoken;

beforeAll(() => {
  enc = new Tiktoken(o200k.bpe_ranks, o200k.special_tokens, o200k.pat_str);
});

afterAll(() => {
  enc.free();
});

const count = (text: string) => enc.encode_ordinary(text).length;

const EMPTY_PROMPT = constructSummaryPrompt("english", [], "");

/** Truncates the content to a budget of `tokens`, returns what was kept. */
async function truncate(content: string, tokens: number): Promise<string> {
  const prompt = await buildSummaryPrompt(
    "english",
    [],
    content,
    count(EMPTY_PROMPT) + tokens,
  );
  expect(prompt.startsWith(EMPTY_PROMPT)).toBe(true);
  return prompt.slice(EMPTY_PROMPT.length);
}

const ENGLISH = "The quick brown fox jumps over the lazy dog, twice a day. ";
const CHINESE = "人工智能技术正在改变我们的生活方式和工作习惯";
const THAI = "การเรียนรู้ของเครื่องเป็นสาขาหนึ่งของปัญญาประดิษฐ์";

describe("prompts.server", () => {
  it("keeps content that fits as is", async () => {
    const content = ENGLISH.repeat(10);
    expect(await truncate(content, count(content))).toBe(content);
  });

  it("truncates to exactly the token budget", async () => {
    const content = ENGLISH.repeat(20);
    const expected = new TextDecoder().decode(
      enc.decode(enc.encode_ordinary(content).slice(0, 50)),
    );
    expect(await truncate(content, 50)).toBe(expected);
  });

  it("fills the budget when the content spans multiple chunks", async () => {
    const kept = await truncate(ENGLISH.repeat(1000), 2000);
    expect(ENGLISH.repeat(1000).startsWith(kept)).toBe(true);
    // Chunk boundaries may split a few tokens.
    expect(count(kept)).toBeLessThanOrEqual(2000);
    expect(count(kept)).toBeGreaterThan(1980);
  });

  it("drops the content when the prompt uses the whole context", async () => {
    expect(await buildSummaryPrompt("english", [], ENGLISH, 1)).toBe(
      EMPTY_PROMPT,
    );
  });

  it("truncates the content of the tagging prompt", async () => {
    const prompt = await buildTextPrompt(
      "english",
      [],
      ENGLISH.repeat(1000),
      2048,
      "as-generated",
    );
    expect(prompt).toContain(ENGLISH);
    expect(prompt).toContain("</TEXT_CONTENT>");
    expect(count(prompt)).toBeLessThanOrEqual(2048 + 5);
  });

  it("doesn't split characters that span multiple tokens", async () => {
    // Each of these takes multiple tokens per character.
    const content = "𓀀𓁐𓂀🧑🏽‍🚀鿿龘".repeat(10);
    for (let tokens = 1; tokens < 60; tokens++) {
      const kept = await truncate(content, tokens);
      expect(content.startsWith(kept)).toBe(true);
      expect(kept.isWellFormed()).toBe(true);
      expect(count(kept)).toBeLessThanOrEqual(tokens);
    }
  });

  it("doesn't split surrogate pairs between chunks", async () => {
    // The offset makes the pairs straddle the even chunk boundaries.
    const content = "a" + "😀".repeat(3000);
    expect(await truncate(content, 5000)).toBe(content);

    // The cap on the content's chars falls inside a pair.
    const cut = await truncate("a" + ENGLISH + "😀".repeat(100), 8);
    expect(cut.isWellFormed()).toBe(true);
  });

  it("keeps a byte order mark and replacement characters of the content", async () => {
    const content = "﻿hello � " + ENGLISH.repeat(10);
    const kept = await truncate(content, 20);
    expect(content.startsWith(kept)).toBe(true);
    expect(kept.startsWith("﻿hello � ")).toBe(true);
  });

  it("treats special tokens in the content as plain text", async () => {
    const content = "before <|endoftext|> middle <|endofprompt|> after";
    expect(await truncate(content, 100)).toBe(content);
    expect(count("<|endoftext|>")).toBeGreaterThan(1);
    // Truncating in the middle of a special token works too.
    const kept = await truncate("<|endoftext|>".repeat(100), 10);
    expect("<|endoftext|>".repeat(100).startsWith(kept)).toBe(true);
    expect(count(kept)).toBeLessThanOrEqual(10);
  });

  it("handles special tokens in custom prompts", async () => {
    const prompt = await buildSummaryPrompt(
      "english",
      ["<|endoftext|>"],
      "content",
      2048,
    );
    expect(prompt).toContain("- <|endoftext|>");
    expect(prompt).toContain("content");
  });

  it.each([
    ["unpunctuated Chinese", CHINESE.repeat(10_000)],
    ["unspaced Thai", THAI.repeat(5_000)],
    ["a single repeated character", "a".repeat(200_000)],
    ["emojis", "😀".repeat(100_000)],
  ])("doesn't block the event loop on %s", async (_name, content) => {
    // Load the encoding beforehand, so that its load isn't measured.
    await truncate("warm up", 10);

    let maxBlockedMs = 0;
    let done = false;
    const monitor = (async () => {
      let last = performance.now();
      while (!done) {
        await setImmediate();
        const now = performance.now();
        maxBlockedMs = Math.max(maxBlockedMs, now - last);
        last = now;
      }
    })();
    const kept = await truncate(content, 16_384);
    done = true;
    await monitor;

    expect(content.startsWith(kept)).toBe(true);
    expect(kept.length).toBeGreaterThan(8_192);
    // Takes ~10-20ms. Encoding it in one go takes multiple seconds.
    expect(maxBlockedMs).toBeLessThan(1_000);
  });
});
