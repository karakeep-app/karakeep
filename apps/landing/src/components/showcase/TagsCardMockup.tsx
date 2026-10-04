import { Calendar, Sparkles, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { MockupCard } from "./MockupCard";

function TagChip({ label, ai = false }: { label: string; ai?: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center gap-[7px] rounded-lg px-3 py-[7px] text-sm",
        ai ? "bg-[#a855f7] text-white" : "bg-[#f1f3f5] text-neutral-900",
      )}
    >
      {ai && <Sparkles className="size-[13px]" />}
      {label}
      <X className={cn("size-[11px]", !ai && "text-neutral-500")} />
    </span>
  );
}

const manualTags = ["Travel", "Japan", "Planning"];
const aiTags = [
  "Itinerary",
  "Budget Travel",
  "Street Food",
  "Rail Passes",
  "Cherry Blossom Season",
  "Day Trips",
];

/** Bookmark side-panel mockup showing manual and AI-suggested tags. */
export default function TagsCardMockup() {
  return (
    <MockupCard className="max-w-[420px] bg-neutral-50 p-6">
      <span className="text-[21px] font-bold text-neutral-900">
        Two Weeks in Japan on a Budget
      </span>
      <div className="mt-4 border-t border-[#ececec]" />
      <div className="mt-4 flex items-center gap-[9px]">
        <Calendar className="size-4 text-neutral-500" />
        <span className="text-sm text-neutral-600">9 days ago</span>
      </div>
      <div className="mt-4 border-t border-[#ececec]" />
      <span className="mt-4 block text-xs font-semibold tracking-[0.06em] text-neutral-500">
        TAGS
      </span>
      <div className="mt-2.5 flex flex-wrap gap-2 rounded-xl border border-[#ececec] bg-white p-3.5">
        {manualTags.map((tag) => (
          <TagChip key={tag} label={tag} />
        ))}
        {aiTags.map((tag) => (
          <TagChip key={tag} label={tag} ai />
        ))}
      </div>
    </MockupCard>
  );
}
