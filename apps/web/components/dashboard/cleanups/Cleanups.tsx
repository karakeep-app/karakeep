"use client";

import { DuplicateTags } from "./DuplicateTags";
import { UnusedTags } from "./UnusedTags";

export function Cleanups() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3">
        <span className="text-2xl">Cleanups</span>
      </div>

      <DuplicateTags />

      <UnusedTags showAsCard={true} showCount={true} />
    </div>
  );
}
