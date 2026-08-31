import type { LucideIcon } from "lucide-react";
import { FileText, KeyRound, Sparkles, Terminal } from "lucide-react";

import TerminalCard from "./TerminalCard";

interface MiniFeature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const miniFeatures: MiniFeature[] = [
  {
    icon: Sparkles,
    title: "Agentic skills",
    description:
      "Teach AI assistants to search, save, and organize through natural conversation.",
  },
  {
    icon: Terminal,
    title: "MCP server & CLI",
    description:
      "A first-party MCP server and a full CLI for scripts and agents.",
  },
  {
    icon: KeyRound,
    title: "Scoped API keys",
    description:
      "Per-scope permissions: no access, read-only, or read & write.",
  },
  {
    icon: FileText,
    title: "Markdown-first content",
    description: "Saved pages are served as clean markdown through the API.",
  },
];

export default function LlmReady() {
  return (
    <section className="bg-white px-4 pb-24">
      <div className="mx-auto flex max-w-[1248px] flex-col gap-10 rounded-3xl bg-[#151221] p-8 sm:p-12 lg:flex-row lg:items-center lg:gap-[72px] lg:p-16">
        <div className="flex flex-[1.2] flex-col gap-[18px]">
          <span className="bg-gradient-to-r from-[#a78bfa] to-[#f0abfc] bg-clip-text text-xs font-bold tracking-[0.14em] text-transparent">
            LLM-READY
          </span>
          <h3 className="font-display text-2xl font-bold tracking-[-0.02em] text-white sm:text-[32px] sm:leading-[1.2]">
            Works with your AI assistant
          </h3>
          <p className="text-base leading-[1.65] text-[#a39db8]">
            Skills, a first-party MCP server, a CLI, and a markdown-first API
            with granular permissions. Everything an agent needs to search and
            save on your behalf.
          </p>
          <div className="mt-3 grid gap-6 sm:grid-cols-2">
            {miniFeatures.map((feature) => (
              <div key={feature.title} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <feature.icon className="size-4 text-[#a78bfa]" />
                  <span className="text-[15px] font-semibold text-white">
                    {feature.title}
                  </span>
                </div>
                <span className="text-[13.5px] leading-[1.55] text-[#a39db8]">
                  {feature.description}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="w-full flex-1">
          <TerminalCard
            lines={[
              "npx skills add karakeep-app/karakeep",
              "karakeep bookmarks list --json",
            ]}
          />
        </div>
      </div>
    </section>
  );
}
