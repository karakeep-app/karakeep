import type { LucideIcon } from "lucide-react";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export default function FeaturesGrid({ features }: { features: Feature[] }) {
  return (
    <section className="bg-neutral-50 px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-neutral-900 sm:text-[40px] sm:leading-[1.15]">
            Everything you need
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-[1.6] text-neutral-600">
            A complete toolkit for saving, organizing, and rediscovering your
            content.
          </p>
        </div>
        <div className="mt-14 overflow-hidden rounded-2xl border border-neutral-200 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="grid grid-cols-1 gap-px bg-neutral-200 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="flex flex-col gap-2.5 bg-white p-7"
              >
                <feature.icon className="size-[22px] text-neutral-800" />
                <h3 className="text-[15px] font-semibold text-neutral-900">
                  {feature.title}
                </h3>
                <p className="text-[13.5px] leading-[1.55] text-neutral-500">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
