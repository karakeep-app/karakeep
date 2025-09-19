import { beforeEach, describe, expect, test } from "vitest";

import { RuleEngineRule } from "@karakeep/shared/types/rules";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

describe("Rules Routes", () => {
  let tagId1: string;
  let tagId2: string;
  let otherUserTagId: string;

  let listId: string;
  let otherUserListId: string;

  beforeEach<CustomTestContext>(async (ctx) => {
    await defaultBeforeEach(true)(ctx);

    tagId1 = (
      await ctx.apiCallers[0].tags.create({
        name: "Tag 1",
      })
    ).id;

    tagId2 = (
      await ctx.apiCallers[0].tags.create({
        name: "Tag 2",
      })
    ).id;

    otherUserTagId = (
      await ctx.apiCallers[1].tags.create({
        name: "Tag 1",
      })
    ).id;

    listId = (
      await ctx.apiCallers[0].lists.create({
        name: "List 1",
        icon: "😘",
      })
    ).id;

    otherUserListId = (
      await ctx.apiCallers[1].lists.create({
        name: "List 1",
        icon: "😘",
      })
    ).id;
  });

  test<CustomTestContext>("create rule with valid data", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].rules;

    const validRuleInput: Omit<RuleEngineRule, "id"> = {
      name: "Valid Rule",
      description: "A test rule",
      enabled: true,
      event: { type: "bookmarkAdded" },
      condition: { type: "alwaysTrue" },
      actions: [
        { type: "addTag", tagId: tagId1 },
        { type: "addToList", listId: listId },
      ],
    };

    const createdRule = await api.create(validRuleInput);
    expect(createdRule).toMatchObject({
      name: "Valid Rule",
      description: "A test rule",
      enabled: true,
      event: validRuleInput.event,
      condition: validRuleInput.condition,
      actions: validRuleInput.actions,
    });
  });

  test<CustomTestContext>("create rule fails with invalid data (no actions)", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].rules;

    const invalidRuleInput: Omit<RuleEngineRule, "id"> = {
      name: "Invalid Rule",
      description: "Missing actions",
      enabled: true,
      event: { type: "bookmarkAdded" },
      condition: { type: "alwaysTrue" },
      actions: [], // Empty actions array - should fail validation
    };

    await expect(() => api.create(invalidRuleInput)).rejects.toThrow(
      /You must specify at least one action/,
    );
  });

  test<CustomTestContext>("create rule fails with invalid event (empty tagId)", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].rules;

    const invalidRuleInput: Omit<RuleEngineRule, "id"> = {
      name: "Invalid Rule",
      description: "Invalid event",
      enabled: true,
      event: { type: "tagAdded", tagId: "" }, // Empty tagId - should fail
      condition: { type: "alwaysTrue" },
      actions: [{ type: "addTag", tagId: tagId1 }],
    };

    await expect(() => api.create(invalidRuleInput)).rejects.toThrow(
      /You must specify a tag for this event type/,
    );
  });

  test<CustomTestContext>("create rule fails with invalid condition (empty tagId in hasTag)", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].rules;

    const invalidRuleInput: Omit<RuleEngineRule, "id"> = {
      name: "Invalid Rule",
      description: "Invalid condition",
      enabled: true,
      event: { type: "bookmarkAdded" },
      condition: { type: "hasTag", tagId: "" }, // Empty tagId - should fail
      actions: [{ type: "addTag", tagId: tagId1 }],
    };

    await expect(() => api.create(invalidRuleInput)).rejects.toThrow(
      /You must specify a tag for this condition type/,
    );
  });

  test<CustomTestContext>("update rule with valid data", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].rules;

    // First, create a rule
    const createdRule = await api.create({
      name: "Original Rule",
      description: "Original desc",
      enabled: true,
      event: { type: "bookmarkAdded" },
      condition: { type: "alwaysTrue" },
      actions: [{ type: "addTag", tagId: tagId1 }],
    });

    const validUpdateInput: RuleEngineRule = {
      id: createdRule.id,
      name: "Updated Rule",
      description: "Updated desc",
      enabled: false,
      event: { type: "bookmarkAdded" },
      condition: { type: "alwaysTrue" },
      actions: [{ type: "removeTag", tagId: tagId2 }],
    };

    const updatedRule = await api.update(validUpdateInput);
    expect(updatedRule).toMatchObject({
      id: createdRule.id,
      name: "Updated Rule",
      description: "Updated desc",
      enabled: false,
      event: validUpdateInput.event,
      condition: validUpdateInput.condition,
      actions: validUpdateInput.actions,
    });
  });

  test<CustomTestContext>("update rule fails with invalid data (empty action tagId)", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].rules;

    // First, create a rule
    const createdRule = await api.create({
      name: "Original Rule",
      description: "Original desc",
      enabled: true,
      event: { type: "bookmarkAdded" },
      condition: { type: "alwaysTrue" },
      actions: [{ type: "addTag", tagId: tagId1 }],
    });

    const invalidUpdateInput: RuleEngineRule = {
      id: createdRule.id,
      name: "Updated Rule",
      description: "Updated desc",
      enabled: true,
      event: { type: "bookmarkAdded" },
      condition: { type: "alwaysTrue" },
      actions: [{ type: "removeTag", tagId: "" }], // Empty tagId - should fail
    };

    await expect(() => api.update(invalidUpdateInput)).rejects.toThrow(
      /You must specify a tag for this action type/,
    );
  });

  test<CustomTestContext>("delete rule", async ({ apiCallers }) => {
    const api = apiCallers[0].rules;

    const createdRule = await api.create({
      name: "Rule to Delete",
      description: "",
      enabled: true,
      event: { type: "bookmarkAdded" },
      condition: { type: "alwaysTrue" },
      actions: [{ type: "addTag", tagId: tagId1 }],
    });

    await api.delete({ id: createdRule.id });

    // Attempt to fetch the rule should fail
    await expect(() =>
      api.update({ ...createdRule, name: "Updated" }),
    ).rejects.toThrow(/Rule not found/);
  });

  test<CustomTestContext>("list rules", async ({ apiCallers }) => {
    const api = apiCallers[0].rules;

    await api.create({
      name: "Rule 1",
      description: "",
      enabled: true,
      event: { type: "bookmarkAdded" },
      condition: { type: "alwaysTrue" },
      actions: [{ type: "addTag", tagId: tagId1 }],
    });

    await api.create({
      name: "Rule 2",
      description: "",
      enabled: true,
      event: { type: "bookmarkAdded" },
      condition: { type: "alwaysTrue" },
      actions: [{ type: "addTag", tagId: tagId2 }],
    });

    const rulesList = await api.list();
    expect(rulesList.rules.length).toBeGreaterThanOrEqual(2);
    expect(rulesList.rules.some((rule) => rule.name === "Rule 1")).toBeTruthy();
    expect(rulesList.rules.some((rule) => rule.name === "Rule 2")).toBeTruthy();
  });

  describe("privacy checks", () => {
    test<CustomTestContext>("cannot access or manipulate another user's rule", async ({
      apiCallers,
    }) => {
      const apiUserA = apiCallers[0].rules; // First user
      const apiUserB = apiCallers[1].rules; // Second user

      // User A creates a rule
      const createdRule = await apiUserA.create({
        name: "User A's Rule",
        description: "A rule for User A",
        enabled: true,
        event: { type: "bookmarkAdded" },
        condition: { type: "alwaysTrue" },
        actions: [{ type: "addTag", tagId: tagId1 }],
      });

      // User B tries to update User A's rule
      const updateInput: RuleEngineRule = {
        id: createdRule.id,
        name: "Trying to Update",
        description: "Unauthorized update",
        enabled: true,
        event: createdRule.event,
        condition: createdRule.condition,
        actions: createdRule.actions,
      };

      await expect(() => apiUserB.update(updateInput)).rejects.toThrow(
        /Rule not found/,
      );
    });

    test<CustomTestContext>("cannot create rule with event on another user's tag", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].rules; // First user trying to use second user's tag

      const invalidRuleInput: Omit<RuleEngineRule, "id"> = {
        name: "Invalid Rule",
        description: "Event with other user's tag",
        enabled: true,
        event: { type: "tagAdded", tagId: otherUserTagId }, // Other user's tag
        condition: { type: "alwaysTrue" },
        actions: [{ type: "addTag", tagId: tagId1 }],
      };

      await expect(() => api.create(invalidRuleInput)).rejects.toThrow(
        /Tag not found/, // Expect an error indicating lack of ownership
      );
    });

    test<CustomTestContext>("cannot create rule with condition on another user's tag", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].rules; // First user trying to use second user's tag

      const invalidRuleInput: Omit<RuleEngineRule, "id"> = {
        name: "Invalid Rule",
        description: "Condition with other user's tag",
        enabled: true,
        event: { type: "bookmarkAdded" },
        condition: { type: "hasTag", tagId: otherUserTagId }, // Other user's tag
        actions: [{ type: "addTag", tagId: tagId1 }],
      };

      await expect(() => api.create(invalidRuleInput)).rejects.toThrow(
        /Tag not found/,
      );
    });

    test<CustomTestContext>("cannot create rule with action on another user's tag", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].rules; // First user trying to use second user's tag

      const invalidRuleInput: Omit<RuleEngineRule, "id"> = {
        name: "Invalid Rule",
        description: "Action with other user's tag",
        enabled: true,
        event: { type: "bookmarkAdded" },
        condition: { type: "alwaysTrue" },
        actions: [{ type: "addTag", tagId: otherUserTagId }], // Other user's tag
      };

      await expect(() => api.create(invalidRuleInput)).rejects.toThrow(
        /Tag not found/,
      );
    });

    test<CustomTestContext>("cannot create rule with event on another user's list", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].rules; // First user trying to use second user's list

      const invalidRuleInput: Omit<RuleEngineRule, "id"> = {
        name: "Invalid Rule",
        description: "Event with other user's list",
        enabled: true,
        event: { type: "addedToList", listId: otherUserListId }, // Other user's list
        condition: { type: "alwaysTrue" },
        actions: [{ type: "addTag", tagId: tagId1 }],
      };

      await expect(() => api.create(invalidRuleInput)).rejects.toThrow(
        /List not found/,
      );
    });

    test<CustomTestContext>("cannot create rule with action on another user's list", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].rules; // First user trying to use second user's list

      const invalidRuleInput: Omit<RuleEngineRule, "id"> = {
        name: "Invalid Rule",
        description: "Action with other user's list",
        enabled: true,
        event: { type: "bookmarkAdded" },
        condition: { type: "alwaysTrue" },
        actions: [{ type: "addToList", listId: otherUserListId }], // Other user's list
      };

      await expect(() => api.create(invalidRuleInput)).rejects.toThrow(
        /List not found/,
      );
    });
  });
});
