import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface FeatureBullet {
  icon: ComponentType<{ className?: string }>;
  text: string;
}

interface FeatureShowcaseProps {
  label: string;
  headline: string;
  description: string;
  bullets: FeatureBullet[];
  reverse?: boolean;
  children: ReactNode;
}

export default function FeatureShowcase({
  label,
  headline,
  description,
  bullets,
  reverse = false,
  children,
}: FeatureShowcaseProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-10 rounded-3xl bg-neutral-50 px-6 py-10 sm:px-12 sm:py-14 lg:flex-row lg:gap-[72px] lg:px-16",
        reverse && "lg:flex-row-reverse",
      )}
    >
      {/* Text side */}
      <div className="flex flex-1 flex-col gap-[18px]">
        <span className="text-xs font-bold tracking-[0.14em] text-neutral-500">
          {label}
        </span>
        <h3 className="font-display text-2xl font-bold tracking-[-0.02em] text-neutral-900 sm:text-[32px] sm:leading-[1.2]">
          {headline}
        </h3>
        <p className="text-base leading-[1.65] text-neutral-500">
          {description}
        </p>
        <ul className="mt-2 flex flex-col gap-3.5">
          {bullets.map((bullet) => (
            <li key={bullet.text} className="flex items-center gap-3">
              <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white">
                <bullet.icon className="size-[15px] text-neutral-500" />
              </span>
              <span className="text-[15px] text-neutral-700">
                {bullet.text}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Visual side */}
      <div className="flex w-full flex-1 items-center justify-center">
        {children}
      </div>
    </div>
  );
}
