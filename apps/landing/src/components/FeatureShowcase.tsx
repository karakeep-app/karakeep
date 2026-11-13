import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

// Pastel backgrounds for the panel behind each showcase visual.
const tints = {
  lavender: "bg-[#f3edf9]",
  peach: "bg-[#fcf2e9]",
  mint: "bg-[#edf7ef]",
  sky: "bg-[#eef2fb]",
};

export type ShowcaseTint = keyof typeof tints;

export interface FeatureBullet {
  icon: ComponentType<{ className?: string }>;
  text: string;
}

interface FeatureShowcaseProps {
  label: string;
  headline: string;
  description: string;
  bullets: FeatureBullet[];
  tint: ShowcaseTint;
  reverse?: boolean;
  children: ReactNode;
}

export default function FeatureShowcase({
  label,
  headline,
  description,
  bullets,
  tint,
  reverse = false,
  children,
}: FeatureShowcaseProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-3xl border border-neutral-200 bg-white p-3 lg:flex-row",
        reverse && "lg:flex-row-reverse",
      )}
    >
      {/* Text side */}
      <div className="flex flex-1 flex-col justify-center gap-[18px] px-3 py-7 sm:px-9 sm:py-10 lg:px-[52px]">
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
      <div
        className={cn(
          "flex w-full flex-1 items-center justify-center rounded-2xl px-5 py-10 sm:px-12 sm:py-14",
          tints[tint],
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface FeatureShowcaseHalfProps {
  label: string;
  headline: string;
  description: string;
  tint: ShowcaseTint;
  children: ReactNode;
}

/** Half-width showcase panel: text on top, visual below. */
export function FeatureShowcaseHalf({
  label,
  headline,
  description,
  tint,
  children,
}: FeatureShowcaseHalfProps) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-neutral-200 bg-white p-3">
      <div className="flex flex-col gap-[18px] px-3 pb-4 pt-7 sm:px-9 sm:pt-9">
        <span className="text-xs font-bold tracking-[0.14em] text-neutral-500">
          {label}
        </span>
        <h3 className="font-display text-2xl font-bold tracking-[-0.02em] text-neutral-900 sm:text-[28px] sm:leading-[1.2]">
          {headline}
        </h3>
        <p className="text-base leading-[1.65] text-neutral-500">
          {description}
        </p>
      </div>
      <div
        className={cn(
          "flex w-full grow items-center justify-center rounded-2xl px-5 py-8 sm:px-10 sm:py-10",
          tints[tint],
        )}
      >
        {children}
      </div>
    </div>
  );
}
