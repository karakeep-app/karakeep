import { DuplicateTags } from "@/components/dashboard/cleanups/DuplicateTags";
import { UnusedTags } from "@/components/dashboard/cleanups/UnusedTags";

export default function Cleanups() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3">
        <span className="text-2xl">Cleanups</span>
      </div>

      <DuplicateTags />

      <UnusedTags showCount={true} />
    </div>
  );
}
