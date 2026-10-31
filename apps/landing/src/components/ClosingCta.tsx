import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CLOUD_SIGNUP_LINK, DEMO_LINK } from "../constants";

export default function ClosingCta() {
  return (
    <section className="relative overflow-hidden bg-white px-4 py-16 sm:py-24">
      {/* Radial glow */}
      <div className="pointer-events-none absolute -bottom-64 left-1/2 h-[420px] w-[900px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(250,204,21,0.08),rgba(250,204,21,0.03),transparent)]" />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight text-neutral-900 sm:text-[44px] sm:leading-[1.15]">
          Start bookmarking{" "}
          <span className="bg-[linear-gradient(transparent_58%,#fde047_58%,#fde047_92%,transparent_92%)] [box-decoration-break:clone]">
            everything
          </span>
        </h2>
        <p className="mt-4 text-lg leading-[1.6] text-neutral-600">
          Free to try in the cloud, or self-host it with Docker.
        </p>
        <div className="mt-9 flex w-full flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href={CLOUD_SIGNUP_LINK}
            className={cn(
              "w-full px-9 shadow-[0_1px_2px_rgba(23,23,23,0.2),0_8px_24px_-8px_rgba(23,23,23,0.4)] sm:w-auto",
              buttonVariants({ variant: "brand", size: "lg" }),
            )}
          >
            Sign Up
          </a>
          <a
            href={DEMO_LINK}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "w-full px-9 sm:w-auto",
              buttonVariants({ variant: "outline", size: "lg" }),
            )}
          >
            Try Demo
          </a>
        </div>
      </div>
    </section>
  );
}
