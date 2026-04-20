import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface FeatureBullet {
  icon: LucideIcon;
  text: string;
}

interface FeatureShowcaseProps {
  label: string;
  title: string;
  headline: string;
  description: string;
  bullets: FeatureBullet[];
  screenshot: string;
  screenshotAlt: string;
  reverse?: boolean;
}

export default function FeatureShowcase({
  label,
  headline,
  description,
  bullets,
  screenshot,
  screenshotAlt,
  reverse = false,
}: FeatureShowcaseProps) {
  return (
    <section className="px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-6xl rounded-2xl bg-gray-50/80 px-6 py-10 sm:px-12 sm:py-14">
        <div
          className={cn(
            "flex flex-col items-center gap-10 lg:flex-row lg:gap-14",
            reverse && "lg:flex-row-reverse",
          )}
        >
          {/* Text side */}
          <div className="flex flex-1 flex-col justify-center space-y-5">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
              {label}
            </span>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {headline}
            </h2>
            <p className="text-base font-medium text-gray-500">{description}</p>
            <ul className="space-y-3 pt-2">
              {bullets.map((bullet) => (
                <li key={bullet.text} className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-gray-100 p-1.5">
                    <bullet.icon className="size-4 text-gray-500" />
                  </div>
                  <span className="text-gray-700">{bullet.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Screenshot side */}
          <div className="flex flex-1 items-center justify-center">
            <div className="relative p-4">
              {/* Glow behind card */}
              <div className="absolute inset-2 rounded-2xl bg-gradient-to-br from-gray-200/40 via-gray-100/30 to-transparent blur-2xl" />
              <div className="relative overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-lg">
                <img src={screenshot} alt={screenshotAlt} className="w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
