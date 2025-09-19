import { beforeEach, describe, expect, test } from "vitest";
import { z } from "zod";

import { zNewPromptSchema } from "@karakeep/shared/types/prompts";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("Prompts Routes", () => {
  test<CustomTestContext>("create prompt", async ({ apiCallers }) => {
    const api = apiCallers[0].prompts;
    const newPromptInput: z.infer<typeof zNewPromptSchema> = {
      text: "Test prompt text",
      appliesTo: "summary",
    };

    const createdPrompt = await api.create({ ...newPromptInput });

    expect(createdPrompt).toMatchObject({
      text: newPromptInput.text,
      appliesTo: newPromptInput.appliesTo,
      enabled: true,
    });

    const prompts = await api.list();
    const promptFromList = prompts.find((p) => p.id === createdPrompt.id);
    expect(promptFromList).toBeDefined();
    expect(promptFromList?.text).toEqual(newPromptInput.text);
  });

  test<CustomTestContext>("update prompt", async ({ apiCallers }) => {
    const api = apiCallers[0].prompts;

    // First, create a prompt
    const createdPrompt = await api.create({
      text: "Original text",
      appliesTo: "summary",
    });

    // Update it
    const updatedPrompt = await api.update({
      promptId: createdPrompt.id,
      text: "Updated text",
      appliesTo: "summary",
      enabled: false,
    });

    expect(updatedPrompt.text).toEqual("Updated text");
    expect(updatedPrompt.appliesTo).toEqual("summary");
    expect(updatedPrompt.enabled).toEqual(false);

    // Instead of api.getPrompt, use api.list() to verify
    const prompts = await api.list();
    const promptFromList = prompts.find((p) => p.id === createdPrompt.id);
    expect(promptFromList).toBeDefined();
    expect(promptFromList?.text).toEqual("Updated text");
    expect(promptFromList?.enabled).toEqual(false);

    // Test updating a non-existent prompt
    await expect(() =>
      api.update({
        promptId: "non-existent-id",
        text: "Should fail",
        appliesTo: "summary",
        enabled: true, // Assuming this matches the schema
      }),
    ).rejects.toThrow(/Prompt not found/);
  });

  test<CustomTestContext>("list prompts", async ({ apiCallers }) => {
    const api = apiCallers[0].prompts;

    const emptyPrompts = await api.list();
    expect(emptyPrompts).toEqual([]);

    const prompt1Input: z.infer<typeof zNewPromptSchema> = {
      text: "Prompt 1",
      appliesTo: "summary",
    };
    await api.create(prompt1Input);

    const prompt2Input: z.infer<typeof zNewPromptSchema> = {
      text: "Prompt 2",
      appliesTo: "summary",
    };
    await api.create(prompt2Input);

    const prompts = await api.list();
    expect(prompts.length).toEqual(2);
    expect(prompts.some((p) => p.text === "Prompt 1")).toBeTruthy();
    expect(prompts.some((p) => p.text === "Prompt 2")).toBeTruthy();
  });

  test<CustomTestContext>("delete prompt", async ({ apiCallers }) => {
    const api = apiCallers[0].prompts;

    // Create a prompt
    const createdPromptInput: z.infer<typeof zNewPromptSchema> = {
      text: "To be deleted",
      appliesTo: "summary",
    };
    const createdPrompt = await api.create(createdPromptInput);

    // Delete it
    await api.delete({ promptId: createdPrompt.id });

    // Instead of api.getPrompt, use api.list() to verify
    const prompts = await api.list();
    expect(prompts.some((p) => p.id === createdPrompt.id)).toBeFalsy();
  });

  test<CustomTestContext>("privacy for prompts", async ({ apiCallers }) => {
    const user1PromptInput: z.infer<typeof zNewPromptSchema> = {
      text: "User 1 prompt",
      appliesTo: "summary",
    };
    const user1Prompt = await apiCallers[0].prompts.create(user1PromptInput);

    const user2PromptInput: z.infer<typeof zNewPromptSchema> = {
      text: "User 2 prompt",
      appliesTo: "summary",
    };
    const user2Prompt = await apiCallers[1].prompts.create(user2PromptInput);

    // User 1 should not access User 2's prompt
    await expect(() =>
      apiCallers[0].prompts.delete({ promptId: user2Prompt.id }),
    ).rejects.toThrow(/User is not allowed to access resource/);

    // List should only show the correct user's prompts
    const user1Prompts = await apiCallers[0].prompts.list();
    expect(user1Prompts.length).toEqual(1);
    expect(user1Prompts[0].id).toEqual(user1Prompt.id);

    const user2Prompts = await apiCallers[1].prompts.list();
    expect(user2Prompts.length).toEqual(1);
    expect(user2Prompts[0].id).toEqual(user2Prompt.id);
  });
});
