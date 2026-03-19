import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Github } from "lucide-react";

import { DOCS_LINK, GITHUB_LINK } from "../constants";

export default function OpenSource() {
  return (
    <section className="bg-gray-900 px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-4xl text-center">
        <Github className="mx-auto size-12 text-white" />
        <h2 className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Open Source & Self-Hostable
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-400">
          Karakeep is fully open source. Run it on your own server with Docker,
          keep full control of your data, and contribute to the project.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href={GITHUB_LINK}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "gap-2 bg-white px-8 text-gray-900 hover:bg-gray-100",
              buttonVariants({ size: "lg" }),
            )}
          >
            <Github className="size-5" /> View on GitHub
          </a>
          <a
            href={`${DOCS_LINK}/installation/docker`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-gray-600 px-8 text-base font-medium text-white transition-colors hover:bg-gray-800"
          >
            Self-hosting docs
          </a>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-sm">
          <div className="text-center">
            <div className="text-3xl font-bold text-white">24k+</div>
            <div className="mt-1 text-gray-400">GitHub Stars</div>
          </div>
          <div className="h-8 w-px bg-gray-700" />
          <div className="text-center">
            <div className="text-3xl font-bold text-white">150+</div>
            <div className="mt-1 text-gray-400">Contributors</div>
          </div>
        </div>
      </div>
    </section>
  );
}
