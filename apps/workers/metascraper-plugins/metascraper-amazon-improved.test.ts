import metascraper from "metascraper";
import { describe, expect, test } from "vitest";

import metascraperAmazonImproved from "./metascraper-amazon-improved";

describe("metascraperAmazonImproved", () => {
  const parser = metascraper([metascraperAmazonImproved()]);

  test("cleans storefront wrapper text from Amazon product bylines", async () => {
    const cases = [
      ["Visit the Apple Store", "Apple"],
      ["Besuche den Niorasen-Store", "Niorasen"],
      ["Visit the アイメディア(Aimedia) Store", "アイメディア(Aimedia)"],
      ["Brand: Anker", "Anker"],
      ["Visiter la boutique Sony", "Sony"],
      ["Bezoek de Philips winkel", "Philips"],
      ["Visite a loja Logitech", "Logitech"],
      ["Samsung Mağazasını ziyaret edin", "Samsung"],
    ];

    for (const [byline, expected] of cases) {
      const meta = await parser({
        url: "https://www.amazon.com/dp/B0GJTXVN9Z",
        html: `<html><body><a id="bylineInfo">${byline}</a></body></html>`,
        validateUrl: false,
      });
      expect(meta.author).toBe(expected);
    }
  });

  test("extracts clean book authors and prefers primary authors over translators", async () => {
    const meta = await parser({
      url: "https://www.amazon.com/dp/0735211299",
      html: `
        <html><body>
          <div id="bylineInfo">
            by <span class="author"><a href="/author/james-clear">James Clear</a> (Author)</span>,
            <span class="author"><a href="/author/someone">Jane Smith</a> (Translator)</span>
            <span>Format: Hardcover</span>
          </div>
        </body></html>
      `,
      validateUrl: false,
    });
    expect(meta.author).toBe("James Clear");
  });
});
