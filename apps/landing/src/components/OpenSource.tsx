import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Github } from "lucide-react";

import { DOCS_LINK, GITHUB_LINK } from "../constants";
import TerminalCard from "./TerminalCard";

export default function OpenSource() {
  return (
    <section className="bg-[#151221] px-4 py-16 sm:py-[104px]">
      <div className="mx-auto max-w-4xl text-center">
        <Github className="mx-auto size-12 text-white" />
        <h2 className="font-display mt-7 text-3xl font-bold tracking-tight text-white sm:text-[40px] sm:leading-[1.15]">
          Open Source & Self-Hostable
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-[1.6] text-neutral-400">
          Karakeep is fully open source. Run it on your own server with Docker,
          keep full control of your data, and contribute to the project.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href={GITHUB_LINK}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "gap-2 bg-white px-8 text-neutral-900 hover:bg-neutral-100",
              buttonVariants({ size: "lg" }),
            )}
          >
            <Github className="size-5" /> View on GitHub
          </a>
          <a
            href={`${DOCS_LINK}/installation/docker`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-[#4a4162] px-8 text-base font-medium text-white transition-colors hover:bg-white/5"
          >
            Self-hosting docs
          </a>
        </div>

        <TerminalCard
          lines={["docker compose up -d"]}
          className="mx-auto mt-12 max-w-[560px]"
        />

        <div className="mt-14 flex flex-wrap items-center justify-center gap-10 text-sm">
          <div className="text-center">
            <div className="font-display text-[32px] font-bold text-white">
              28k+
            </div>
            <div className="mt-1 text-neutral-400">GitHub Stars</div>
          </div>
          <div className="h-9 w-px bg-neutral-700" />
          <div className="text-center">
            <div className="font-display text-[32px] font-bold text-white">
              150+
            </div>
            <div className="mt-1 text-neutral-400">Contributors</div>
          </div>
        </div>
      </div>
    </section>
  );
}
