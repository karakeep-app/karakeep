import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CLOUD_SIGNUP_LINK, DEMO_LINK } from "../constants";

export default function CallToAction() {
  return (
    <section className="px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 to-red-600 px-8 py-16 text-center shadow-2xl sm:px-16">
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Start hoarding today
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-purple-100">
          Join thousands of users who trust Karakeep to save and organize their
          digital life.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href={CLOUD_SIGNUP_LINK}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "w-full gap-2 bg-white px-8 text-purple-700 hover:bg-gray-100 sm:w-auto",
              buttonVariants({ size: "lg" }),
            )}
          >
            Get Started Free
          </a>
          <a
            href={DEMO_LINK}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "w-full gap-2 border-white/30 px-8 text-white hover:bg-white/10 sm:w-auto",
              buttonVariants({ variant: "outline", size: "lg" }),
            )}
          >
            Try the Demo
          </a>
        </div>
      </div>
    </section>
  );
}
