import {
  PRICING_FAQS,
  PRICING_TIERS,
  YEARLY_SAVINGS_PERCENT,
} from "./pricing-data";

function formatPrice(price: string, period?: string) {
  return period ? `${price} ${period}` : price;
}

export function renderPricingMarkdown() {
  const lines = [
    "# Karakeep pricing",
    "",
    "> Plans for Karakeep Cloud, self-hosting, and corporate deployments.",
    "",
    `Yearly Pro billing saves ${YEARLY_SAVINGS_PERCENT}% compared with monthly billing. Prices are in US dollars.`,
  ];

  for (const tier of PRICING_TIERS) {
    lines.push("", `## ${tier.name}`, "", tier.description, "");

    if (tier.monthlyPrice === tier.yearlyPrice) {
      lines.push(`- Price: ${formatPrice(tier.monthlyPrice, tier.period)}`);
    } else {
      lines.push(
        `- Monthly: ${formatPrice(tier.monthlyPrice, tier.period)}`,
        `- Yearly: ${formatPrice(
          tier.yearlyPrice,
          tier.yearlyPeriod ?? tier.period,
        )}`,
      );
    }

    lines.push(
      "",
      "### Included",
      "",
      ...tier.features.map((feature) => `- ${feature}`),
      "",
      `[${tier.buttonText}](${tier.buttonHref})`,
    );
  }

  lines.push("", "## Frequently asked questions");

  for (const faq of PRICING_FAQS) {
    lines.push("", `### ${faq.question}`, "", faq.answer);
  }

  return `${lines.join("\n")}\n`;
}
