import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, ExternalLink } from "lucide-react";

import type { BillingPeriod, PricingTier } from "./pricing-data";
import {
  PRICING_FAQS,
  PRICING_TIERS,
  YEARLY_SAVINGS_PERCENT,
} from "./pricing-data";

const CONSUMER_TIERS = PRICING_TIERS.filter(
  (tier) => tier.name !== "Corporate",
);
const CORPORATE_TIER = PRICING_TIERS.find((tier) => tier.name === "Corporate");

function PricingHeader({
  billingPeriod,
  setBillingPeriod,
}: {
  billingPeriod: BillingPeriod;
  setBillingPeriod: (period: BillingPeriod) => void;
}) {
  return (
    <div className="relative mx-auto flex max-w-[760px] flex-col items-center text-center">
      <span className="bg-gradient-to-r from-[#7c3aed] to-[#db2777] bg-clip-text text-xs font-bold tracking-[0.14em] text-transparent">
        PRICING
      </span>
      <h1 className="font-display mt-4 text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-neutral-900 sm:text-[52px]">
        Simple pricing
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-[1.6] text-neutral-600">
        Free to try in the cloud, $4 a month for serious collectors — and always
        free to self-host.
      </p>
      <div className="mt-8 inline-flex items-center rounded-[10px] bg-neutral-100 p-1">
        <button
          onClick={() => setBillingPeriod("monthly")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            billingPeriod === "monthly"
              ? "bg-white text-neutral-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
              : "text-neutral-600 hover:text-neutral-900",
          )}
        >
          Monthly
        </button>
        <button
          onClick={() => setBillingPeriod("yearly")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            billingPeriod === "yearly"
              ? "bg-white text-neutral-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
              : "text-neutral-600 hover:text-neutral-900",
          )}
        >
          Yearly
          <span className="ml-1.5 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            Save {YEARLY_SAVINGS_PERCENT}%
          </span>
        </button>
      </div>
    </div>
  );
}

function PricingCard({
  tier,
  billingPeriod,
}: {
  tier: PricingTier;
  billingPeriod: BillingPeriod;
}) {
  const price =
    billingPeriod === "yearly" ? tier.yearlyPrice : tier.monthlyPrice;
  const period =
    billingPeriod === "yearly" && tier.yearlyPeriod
      ? tier.yearlyPeriod
      : tier.period;
  const hasYearlyPlan =
    tier.monthlyPrice !== tier.yearlyPrice && Boolean(tier.yearlyPeriod);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border bg-white",
        tier.popular
          ? "border-[#7c3aed]/35 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-12px_rgba(124,58,237,0.18),0_16px_40px_-12px_rgba(15,23,42,0.12)]"
          : "border-neutral-200 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_40px_-16px_rgba(15,23,42,0.08)]",
      )}
    >
      {tier.popular && (
        <div className="h-[3px] shrink-0 bg-gradient-to-r from-[#7c3aed] to-[#db2777]" />
      )}
      <div className="flex grow flex-col p-8">
        <h3 className="text-base font-semibold text-neutral-900">
          {tier.name}
        </h3>
        <p className="mt-1 text-sm text-neutral-500">{tier.description}</p>
        <div className="mt-5 flex items-baseline gap-1.5">
          <span className="font-display text-[44px] font-bold leading-none tracking-[-0.02em] text-neutral-900">
            {price}
          </span>
          {period && (
            <span className="text-[15px] text-neutral-500">{period}</span>
          )}
        </div>
        {billingPeriod === "yearly" && hasYearlyPlan && (
          <p className="mt-2 text-[13px] text-green-700">
            ${(Number(tier.yearlyPrice.replace("$", "")) / 12).toFixed(2)}/mo
            equivalent
          </p>
        )}
        {billingPeriod === "monthly" && hasYearlyPlan && (
          <p className="mt-2 text-[13px] text-green-700">
            or {tier.yearlyPrice}/year — save {YEARLY_SAVINGS_PERCENT}%
          </p>
        )}
        <div className="mt-6 border-t border-neutral-100" />
        <ul className="mt-6 flex grow flex-col gap-[13px]">
          {tier.features.map((feature) => (
            <li key={feature} className="flex items-center gap-3">
              <Check className="size-4 shrink-0 stroke-[2.5] text-[#7c3aed]" />
              <span className="text-[14.5px] text-neutral-700">{feature}</span>
            </li>
          ))}
        </ul>
        <a
          href={tier.buttonHref}
          target={tier.buttonTarget}
          rel={tier.buttonTarget === "_blank" ? "noreferrer" : undefined}
          className={cn(
            "mt-8 flex w-full items-center justify-center",
            tier.showExternalIcon && "gap-2",
            tier.popular &&
              "shadow-[0_1px_2px_rgba(28,22,56,0.2),0_8px_24px_-8px_rgba(28,22,56,0.4)]",
            buttonVariants({
              variant: tier.popular ? "brand" : "outline",
              size: "lg",
            }),
          )}
        >
          {tier.showExternalIcon ? <ExternalLink className="size-4" /> : null}
          {tier.buttonText}
        </a>
      </div>
    </div>
  );
}

function CorporateBand({ tier }: { tier: PricingTier }) {
  return (
    <div className="mx-auto mt-8 max-w-[1248px]">
      <div className="flex flex-col gap-10 rounded-3xl bg-[#151221] px-10 py-12 sm:px-14 lg:flex-row lg:items-center lg:gap-[72px]">
        <div className="flex flex-1 flex-col gap-[18px]">
          <span className="bg-gradient-to-r from-[#a78bfa] to-[#f0abfc] bg-clip-text text-xs font-bold tracking-[0.14em] text-transparent">
            CORPORATE
          </span>
          <h3 className="font-display text-2xl font-bold tracking-[-0.02em] text-white sm:text-[28px]">
            Karakeep for your team
          </h3>
          <p className="text-base leading-[1.65] text-[#a39db8]">
            A managed deployment for teams and organizations, priced per seat.
          </p>
          <div className="mt-1 flex flex-wrap gap-2.5">
            {tier.features.map((feature) => (
              <span
                key={feature}
                className="rounded-full border border-[#2b2540] bg-white/[0.04] px-3.5 py-1.5 text-[13px] text-[#cfcae0]"
              >
                {feature}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-6 lg:items-end">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-4xl font-bold tracking-[-0.02em] text-white">
              {tier.monthlyPrice}
            </span>
            <span className="text-[15px] text-[#a39db8]">{tier.period}</span>
          </div>
          <a
            href={tier.buttonHref}
            className="inline-flex h-12 items-center justify-center whitespace-nowrap rounded-lg bg-white px-8 text-base font-medium text-neutral-900 transition-colors hover:bg-neutral-100"
          >
            {tier.buttonText}
          </a>
        </div>
      </div>
    </div>
  );
}

function FAQ() {
  return (
    <div className="mx-auto max-w-4xl py-24">
      <h2 className="font-display text-center text-3xl font-bold tracking-[-0.02em] text-neutral-900 sm:text-[36px]">
        Frequently asked questions
      </h2>
      <div className="mt-14 grid gap-x-14 gap-y-10 md:grid-cols-2">
        {PRICING_FAQS.map((faq) => (
          <div key={faq.question}>
            <h3 className="text-base font-semibold text-neutral-900">
              {faq.question}
            </h3>
            <p className="mt-2 text-[14.5px] leading-[1.65] text-neutral-500">
              {faq.answer}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Pricing() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");

  return (
    <div className="relative overflow-hidden bg-white px-4 pt-16 sm:pt-24">
      {/* Radial glow */}
      <div className="pointer-events-none absolute -top-56 left-1/2 h-[520px] w-[980px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(124,58,237,0.10),rgba(219,39,119,0.06),transparent)]" />
      <div className="relative">
        <PricingHeader
          billingPeriod={billingPeriod}
          setBillingPeriod={setBillingPeriod}
        />
        <div className="mx-auto mt-14 grid max-w-[1248px] grid-cols-1 gap-6 lg:grid-cols-3">
          {CONSUMER_TIERS.map((tier) => (
            <PricingCard
              key={tier.name}
              tier={tier}
              billingPeriod={billingPeriod}
            />
          ))}
        </div>
        {CORPORATE_TIER && <CorporateBand tier={CORPORATE_TIER} />}
        <FAQ />
      </div>
    </div>
  );
}
