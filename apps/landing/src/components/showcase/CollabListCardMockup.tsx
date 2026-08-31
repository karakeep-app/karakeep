import { Plus } from "lucide-react";

import { MockupCard } from "./MockupCard";

const collaborators = [
  {
    initial: "Y",
    name: "You",
    role: "Owner",
    color: "bg-violet-100 text-violet-700",
  },
  {
    initial: "L",
    name: "Layla",
    role: "Editor",
    color: "bg-pink-100 text-pink-700",
  },
  {
    initial: "T",
    name: "Tom",
    role: "Viewer",
    color: "bg-amber-100 text-amber-700",
  },
];

/** Shared-list mockup: a list with collaborators and their roles. */
export default function CollabListCardMockup() {
  return (
    <MockupCard className="max-w-[420px] bg-white p-5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold text-neutral-900">
          📚 Book Club Picks
        </span>
        <span className="text-xs text-neutral-500">
          Shared list · 24 bookmarks
        </span>
      </div>
      <div className="mt-2 flex flex-col divide-y divide-neutral-100">
        {collaborators.map((person) => (
          <div key={person.name} className="flex items-center gap-3 py-3">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${person.color}`}
            >
              {person.initial}
            </div>
            <span className="grow text-[13.5px] font-medium text-neutral-900">
              {person.name}
            </span>
            <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-[11px] font-medium text-neutral-600">
              {person.role}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 rounded-[10px] border border-dashed border-neutral-200 py-2.5">
        <Plus className="size-3.5 text-neutral-400" />
        <span className="text-[13px] text-neutral-400">
          Invite collaborator
        </span>
      </div>
    </MockupCard>
  );
}
