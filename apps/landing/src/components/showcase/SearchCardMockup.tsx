import type { ComponentType } from "react";
import {
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Play,
  Search,
  Sparkles,
  Utensils,
} from "lucide-react";

import { MockupCard } from "./MockupCard";

interface SearchResult {
  title: string;
  tag: string;
  meta: string;
  tileClassName: string;
  tileIcon: ComponentType<{ className?: string }>;
  tileIconClassName: string;
}

const results: SearchResult[] = [
  {
    title: "Midnight Pasta with Crispy Garlic",
    tag: "Recipes",
    meta: "weeknightkitche... • Aug 22",
    tileClassName: "bg-[#e9ddcc]",
    tileIcon: Utensils,
    tileIconClassName: "size-[22px] text-[#8a6a45]",
  },
  {
    title: "Garlic confit, three ways",
    tag: "Cooking",
    meta: "youtube.com • Aug 22",
    tileClassName: "bg-neutral-900",
    tileIcon: Play,
    tileIconClassName: "size-5 fill-white text-white",
  },
  {
    title: "Nonna's pasta notes",
    tag: "Family",
    meta: "Note • Aug 22",
    tileClassName: "bg-[#ede9dd]",
    tileIcon: FileText,
    tileIconClassName: "size-5 text-[#857c5e]",
  },
  {
    title: "Sunday sauce, from scratch",
    tag: "Recipes",
    meta: "Image • Aug 22",
    tileClassName: "bg-[#ddc7bd]",
    tileIcon: ImageIcon,
    tileIconClassName: "size-5 text-[#8c6355]",
  },
];

/** Semantic search mockup: query bar plus a grid of matching bookmarks. */
export default function SearchCardMockup() {
  return (
    <MockupCard className="flex max-w-[440px] flex-col gap-3 bg-[#f4f5f7] p-4">
      {/* Search bar */}
      <div className="flex items-center gap-2.5 rounded-[10px] border border-neutral-200 bg-white px-3.5 py-[11px]">
        <Search className="size-4 shrink-0 text-neutral-500" />
        <span className="min-w-0 grow truncate text-sm text-neutral-900">
          that pasta recipe with the crispy garlic bits
        </span>
        <div className="flex shrink-0 items-center gap-[5px] rounded-[7px] bg-[#f1f3f5] px-[9px] py-1">
          <Sparkles className="size-3 text-[#7c3aed]" />
          <span className="text-xs font-medium text-neutral-900">Semantic</span>
          <ChevronDown className="size-2.5 text-neutral-500" />
        </div>
      </div>
      {/* Results grid */}
      <div className="grid grid-cols-2 gap-3">
        {results.map((result) => (
          <div
            key={result.title}
            className="overflow-hidden rounded-xl border border-[#ececec] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          >
            <div
              className={`flex h-[86px] items-center justify-center ${result.tileClassName}`}
            >
              <result.tileIcon className={result.tileIconClassName} />
            </div>
            <div className="flex flex-col gap-[7px] px-3 pb-[11px] pt-2.5">
              <span className="text-[13.5px] font-semibold leading-[1.35] text-neutral-900">
                {result.title}
              </span>
              <div className="flex items-center">
                <span className="rounded-full bg-[#f1f3f5] px-[9px] py-0.5 text-[11.5px] text-neutral-700">
                  {result.tag}
                </span>
              </div>
              <span className="truncate text-[11.5px] text-neutral-500">
                {result.meta}
              </span>
            </div>
          </div>
        ))}
      </div>
    </MockupCard>
  );
}
