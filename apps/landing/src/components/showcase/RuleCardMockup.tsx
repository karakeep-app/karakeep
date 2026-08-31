import type { ComponentType, ReactNode } from "react";
import { Bookmark, Link2, List, Plus, Tag, Workflow } from "lucide-react";

import { MockupCard } from "./MockupCard";

function StepLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-bold tracking-[0.1em] text-neutral-500">
      {children}
    </span>
  );
}

function StepRow({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-2.5 rounded-[10px] border border-neutral-100 bg-neutral-50 px-3.5 py-2.5">
      <Icon className="size-[15px] shrink-0 text-neutral-500" />
      {children}
    </div>
  );
}

function StepConnector() {
  return <div className="ml-6 h-3.5 w-px bg-neutral-200" />;
}

/** Rule-engine mockup: an automation rule with trigger, condition, actions. */
export default function RuleCardMockup() {
  return (
    <MockupCard className="max-w-[440px] bg-white p-5">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-neutral-100">
          <Workflow className="size-4 text-neutral-700" />
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold text-neutral-900">
            Save Amazon finds to my wishlist
          </span>
          <span className="text-xs text-neutral-500">
            Shopping links get filed away automatically.
          </span>
        </div>
      </div>
      <div className="mt-4 flex flex-col">
        <StepLabel>WHENEVER</StepLabel>
        <StepRow icon={Bookmark}>
          <span className="text-sm text-neutral-900">A bookmark is added</span>
        </StepRow>
        <StepConnector />
        <StepLabel>IF</StepLabel>
        <StepRow icon={Link2}>
          <span className="text-sm text-neutral-900">URL contains</span>
          <span className="rounded-md border border-neutral-200 bg-white px-2 py-[3px] font-mono text-[12.5px] text-neutral-700">
            amazon.com
          </span>
        </StepRow>
        <StepConnector />
        <StepLabel>ACTIONS</StepLabel>
        <StepRow icon={Tag}>
          <span className="text-sm text-neutral-900">Add tag</span>
          <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-[3px] text-[12.5px] text-neutral-700">
            Shopping
          </span>
        </StepRow>
        <StepRow icon={List}>
          <span className="text-sm text-neutral-900">Add to list</span>
          <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-[3px] text-[12.5px] text-neutral-700">
            😍 Wishlist
          </span>
        </StepRow>
        <div className="mt-1.5 flex items-center justify-center gap-2 rounded-[10px] border border-dashed border-neutral-200 px-3.5 py-[9px]">
          <Plus className="size-3.5 text-neutral-400" />
          <span className="text-[13px] text-neutral-400">Add action</span>
        </div>
      </div>
    </MockupCard>
  );
}
