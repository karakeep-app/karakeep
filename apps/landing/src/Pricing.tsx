import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, ExternalLink } from "lucide-react";

import { CLOUD_SIGNUP_LINK, DOCS_LINK, GITHUB_LINK } from "./constants";
import NavBar from "./Navbar";

const CONTACT_EMAIL = "mailto:support@karakeep.app";

const pricingTiers = [
  {
    name: "Free",
    price: "$0",
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
    price: "$4",
    period: "per month",
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
    price: "Free",
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
    price: "Custom",
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

function PricingHeader() {
  return (
    <div className="text-center">
      <h1 className="text-4xl font-bold sm:text-6xl">
        Simple{" "}
        <span className="bg-gradient-to-r from-purple-600 to-red-600 bg-clip-text text-transparent">
          Pricing
        </span>
      </h1>
      <p className="mt-4 text-lg text-gray-600">
        Choose the plan that works best for you
      </p>
    </div>
  );
}

function PricingCards() {
  const renderCard = (tier: (typeof pricingTiers)[number]) => (
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
          <span className="text-4xl font-bold">{tier.price}</span>
          {tier.period && (
            <span className="ml-1 text-gray-500">/{tier.period}</span>
          )}
        </div>
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

  return (
    <div className="mx-auto mt-16 max-w-6xl px-6">
      {/* First 3 tiers */}
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {pricingTiers.slice(0, 3).map(renderCard)}
      </div>

      {/* Corporate tier - centered below */}
      <div className="mt-8 flex justify-center">
        <div className="w-full md:max-w-sm">{renderCard(pricingTiers[3])}</div>
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

function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <div className="mt-24 flex items-center justify-between bg-gray-100 px-10 py-6 text-sm">
      <div>
        © 2024-{currentYear}{" "}
        <a href="https://localhostlabs.co.uk" target="_blank" rel="noreferrer">
          Localhost Labs Ltd
        </a>
      </div>
      <div className="flex items-center gap-6">
        <a
          href={DOCS_LINK}
          target="_blank"
          className="flex justify-center gap-2 text-center"
          rel="noreferrer"
        >
          Docs
        </a>
        <a
          href={GITHUB_LINK}
          target="_blank"
          className="flex justify-center gap-2 text-center"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>
    </div>
  );
}

export default function Pricing() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto">
        <NavBar />
        <div className="py-16">
          <PricingHeader />
          <PricingCards />
          <FAQ />
        </div>
      </div>
      <Footer />
    </div>
  );
}
