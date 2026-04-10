import type { LucideIcon } from "lucide-react";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export default function FeaturesGrid({ features }: { features: Feature[] }) {
  return (
    <section className="bg-gray-50 px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
            A complete toolkit for saving, organizing, and rediscovering your
            content.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-xl border border-gray-200 bg-white p-6 transition-all hover:border-purple-200 hover:shadow-lg"
            >
              <feature.icon className="mb-4 size-6 text-gray-800" />
              <h3 className="mb-2 font-semibold text-gray-900">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
