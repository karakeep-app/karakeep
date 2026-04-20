import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, ExternalLink } from "lucide-react";

import { CLOUD_SIGNUP_LINK, GITHUB_LINK } from "./constants";

const CONTACT_EMAIL = "mailto:support@karakeep.app";

const pricingTiers = [
  {
    name: "Free",
    monthlyPrice: "$0",
    yearlyPrice: "$0",
    period: "",
    description: "Trying Karakeep out",
    features: [
      "10 bookmarks",
      "20MB storage",
      "Mobile & web apps",
      "Browser extensions",
    ],
    buttonText: "Get Started",
    buttonVariant: "outline" as const,
    popular: false,
  },
  {
    name: "Pro",
    monthlyPrice: "$4",
    yearlyPrice: "$40",
    period: "per month",
    yearlyPeriod: "per year",
    description: "For serious bookmark collectors",
    features: [
      "50,000 bookmarks",
      "50GB storage",
      "AI-powered tagging",
      "Full-text search",
      "Mobile & web apps",
      "Browser extensions",
    ],
    buttonText: "Get Started",
    buttonVariant: "default" as const,
    popular: true,
  },
  {
    name: "Self-Hosted",
    monthlyPrice: "Free",
    yearlyPrice: "Free",
    period: "forever",
    description: "Complete control and privacy",
    features: [
      "Unlimited bookmarks",
      "Unlimited storage",
      "Complete data control",
      "Mobile & web apps",
      "Browser extensions",
      "Community support",
    ],
    buttonText: "View on GitHub",
    buttonVariant: "outline" as const,
    popular: false,
    isGitHub: true,
  },
  {
    name: "Corporate",
    monthlyPrice: "Custom",
    yearlyPrice: "Custom",
    period: "per seat",
    description: "For teams and organizations",
    features: [
      "Everything in Pro",
      "Custom deployment & domain",
      "Single Sign-On (SSO)",
      "User management",
      "Priority support",
    ],
    buttonText: "Contact Us",
    buttonVariant: "outline" as const,
    popular: false,
    isContact: true,
  },
];

function PricingHeader({
  billingPeriod,
  setBillingPeriod,
}: {
  billingPeriod: "monthly" | "yearly";
  setBillingPeriod: (period: "monthly" | "yearly") => void;
}) {
  return (
    <div className="text-center">
      <h1 className="text-4xl font-bold sm:text-6xl">Simple Pricing</h1>
      <p className="mt-4 text-lg text-gray-600">
        Choose the plan that works best for you
      </p>
      <div className="mt-8 inline-flex items-center rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setBillingPeriod("monthly")}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition-colors",
            billingPeriod === "monthly"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900",
          )}
        >
          Monthly
        </button>
        <button
          onClick={() => setBillingPeriod("yearly")}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition-colors",
            billingPeriod === "yearly"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900",
          )}
        >
          Yearly
          <span className="ml-1.5 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            Save 17%
          </span>
        </button>
      </div>
    </div>
  );
}

function PricingCards({
  billingPeriod,
}: {
  billingPeriod: "monthly" | "yearly";
}) {
  const renderCard = (tier: (typeof pricingTiers)[number]) => {
    const price =
      billingPeriod === "yearly" ? tier.yearlyPrice : tier.monthlyPrice;
    const period =
      billingPeriod === "yearly" && tier.yearlyPeriod
        ? tier.yearlyPeriod
        : tier.period;

    return (
      <div
        key={tier.name}
        className={cn(
          "relative rounded-2xl border bg-white p-8 shadow-sm",
          tier.popular && "border-purple-500 shadow-lg",
        )}
      >
        <div className="text-center">
          <h3 className="text-xl font-semibold">{tier.name}</h3>
          <div className="mt-4 flex items-baseline justify-center">
            <span className="text-4xl font-bold">{price}</span>
            {period && <span className="ml-1 text-gray-500">/{period}</span>}
          </div>
          {billingPeriod === "yearly" &&
            tier.monthlyPrice !== tier.yearlyPrice &&
            tier.yearlyPeriod && (
              <p className="mt-1 text-sm text-green-600">
                ${(Number(tier.yearlyPrice.replace("$", "")) / 12).toFixed(2)}
                /mo equivalent
              </p>
            )}
          <p className="mt-2 text-gray-600">{tier.description}</p>
        </div>

        <ul className="mt-8 space-y-3">
          {tier.features.map((feature) => (
            <li key={feature} className="flex items-center">
              <Check className="h-5 w-5 text-green-500" />
              <span className="ml-3 text-gray-700">{feature}</span>
            </li>
          ))}
        </ul>

        <div className="mt-8">
          {tier.isContact ? (
            <a
              href={CONTACT_EMAIL}
              className={cn(
                "flex w-full items-center justify-center",
                buttonVariants({ variant: tier.buttonVariant, size: "lg" }),
              )}
            >
              {tier.buttonText}
            </a>
          ) : tier.isGitHub ? (
            <a
              href={GITHUB_LINK}
              target="_blank"
              className={cn(
                "flex w-full items-center justify-center gap-2",
                buttonVariants({ variant: tier.buttonVariant, size: "lg" }),
              )}
              rel="noreferrer"
            >
              <ExternalLink className="h-4 w-4" />
              {tier.buttonText}
            </a>
          ) : (
            <a
              href={CLOUD_SIGNUP_LINK}
              target="_blank"
              className={cn(
                "flex w-full items-center justify-center",
                buttonVariants({ variant: tier.buttonVariant, size: "lg" }),
              )}
              rel="noreferrer"
            >
              {tier.buttonText}
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto mt-16 px-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {pricingTiers.map(renderCard)}
      </div>
    </div>
  );
}

function FAQ() {
  const faqs = [
    {
      question: "What happens to my data if I cancel?",
      answer:
        "Your data will be available for 30 days after cancellation. You can export your bookmarks at any time.",
    },
    {
      question: "Are there any restrictions in the self-hosted version?",
      answer:
        "No. The selhosted version is completely free, fully-featured, and open source. You just need to provide your own hosting infrastructure.",
    },
    {
      question: "Do you offer refunds?",
      answer: "Yes, we offer a 7-day money-back guarantee for all paid plans.",
    },
    {
      question: "How should I contact you if I have any questions?",
      answer: "You can reach us at support@karakeep.app",
    },
  ];

  return (
    <div className="mx-auto mt-24 max-w-4xl px-6">
      <h2 className="text-center text-3xl font-bold">
        Frequently Asked Questions
      </h2>
      <div className="mt-12 grid gap-8 md:grid-cols-2">
        {faqs.map((faq) => (
          <div key={faq.question}>
            <h3 className="text-lg font-semibold">{faq.question}</h3>
            <p className="mt-2 text-gray-600">{faq.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Pricing() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">(
    "monthly",
  );

  return (
    <div className="container mx-auto">
      <div className="py-16">
        <PricingHeader
          billingPeriod={billingPeriod}
          setBillingPeriod={setBillingPeriod}
        />
        <PricingCards billingPeriod={billingPeriod} />
        <FAQ />
      </div>
    </div>
  );
}
