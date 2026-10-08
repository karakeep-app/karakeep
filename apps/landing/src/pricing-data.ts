import { CLOUD_SIGNUP_LINK, GITHUB_LINK } from "./constants";

export type BillingPeriod = "monthly" | "yearly";

export interface PricingTier {
  name: string;
  monthlyPrice: string;
  yearlyPrice: string;
  period: string;
  yearlyPeriod?: string;
  description: string;
  features: readonly string[];
  buttonText: string;
  buttonHref: string;
  buttonTarget?: "_blank";
  popular: boolean;
  showExternalIcon?: boolean;
}

export const PRICING_META_DESCRIPTION =
  "Simple, transparent pricing for Karakeep. Free plan available. Pro plan at $4/month or $40/year with AI tagging, full-text search, and 50GB storage. Self-hosted option is free forever.";

export const YEARLY_SAVINGS_PERCENT = 17;

export const PRICING_TIERS: readonly PricingTier[] = [
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
    buttonHref: CLOUD_SIGNUP_LINK,
    buttonTarget: "_blank",
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
    buttonHref: CLOUD_SIGNUP_LINK,
    buttonTarget: "_blank",
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
    buttonHref: GITHUB_LINK,
    buttonTarget: "_blank",
    popular: false,
    showExternalIcon: true,
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
    buttonHref: "mailto:support@karakeep.app",
    popular: false,
  },
];

export const PRICING_FAQS = [
  {
    question: "What happens to my data if I cancel?",
    answer:
      "Your data will be available for 30 days after cancellation. You can export your bookmarks at any time.",
  },
  {
    question: "Are there any restrictions in the self-hosted version?",
    answer:
      "No. The self-hosted version is free, includes all features, and is open source. You provide the hosting infrastructure.",
  },
  {
    question: "Do you offer refunds?",
    answer: "Yes, we offer a 7-day money-back guarantee for all paid plans.",
  },
  {
    question: "How should I contact you if I have any questions?",
    answer: "You can reach us at support@karakeep.app.",
  },
] as const;
