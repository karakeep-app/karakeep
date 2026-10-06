import type { ZBookmarkTags } from "@karakeep/shared/types/tags";

export interface DeferredTag {
  tagId?: string;
  tagName: string;
}

export interface DeferredTagChanges {
  attach: DeferredTag[];
  detach: { tagId: string }[];
}

export function createEmptyDeferredTagChanges(): DeferredTagChanges {
  return { attach: [], detach: [] };
}

function refersToSameTag(left: DeferredTag, right: DeferredTag): boolean {
  return (
    (!!left.tagId && left.tagId === right.tagId) ||
    left.tagName === right.tagName
  );
}

export function stageTagAttachment(
  changes: DeferredTagChanges,
  initialTags: readonly ZBookmarkTags[],
  tag: DeferredTag,
): DeferredTagChanges {
  const wasInitiallyAttached =
    !!tag.tagId && initialTags.some((initial) => initial.id === tag.tagId);

  if (wasInitiallyAttached) {
    return {
      attach: changes.attach,
      detach: changes.detach.filter(({ tagId }) => tagId !== tag.tagId),
    };
  }

  if (changes.attach.some((pending) => refersToSameTag(pending, tag))) {
    return changes;
  }

  return {
    attach: [...changes.attach, tag],
    detach: changes.detach,
  };
}

export function stageTagDetachment(
  changes: DeferredTagChanges,
  tag: DeferredTag & { tagId: string },
): DeferredTagChanges {
  const pendingAttachment = changes.attach.find((pending) =>
    refersToSameTag(pending, tag),
  );

  if (pendingAttachment) {
    return {
      attach: changes.attach.filter(
        (pending) => !refersToSameTag(pending, tag),
      ),
      detach: changes.detach,
    };
  }

  if (changes.detach.some(({ tagId }) => tagId === tag.tagId)) {
    return changes;
  }

  return {
    attach: changes.attach,
    detach: [...changes.detach, { tagId: tag.tagId }],
  };
}

export function hasDeferredTagChanges(changes: DeferredTagChanges): boolean {
  return changes.attach.length > 0 || changes.detach.length > 0;
}

export async function persistBookmarkEdits<T>({
  saveDetails,
  saveTags,
  tagChanges,
}: {
  saveDetails: () => Promise<T>;
  saveTags: (changes: DeferredTagChanges) => Promise<unknown>;
  tagChanges: DeferredTagChanges;
}): Promise<T> {
  const updatedBookmark = await saveDetails();

  if (hasDeferredTagChanges(tagChanges)) {
    await saveTags(tagChanges);
  }

  return updatedBookmark;
}
