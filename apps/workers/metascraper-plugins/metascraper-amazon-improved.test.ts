import metascraper from "metascraper";
import { describe, expect, test } from "vitest";

import metascraperAmazonImproved from "./metascraper-amazon-improved";

describe("metascraperAmazonImproved", () => {
  const parser = metascraper([metascraperAmazonImproved()]);

  test("cleans storefront wrapper text from Amazon product bylines", async () => {
    const cases = [
      ["Visit the Acme Store", "Acme"],
      ["Besuche den Beispiel-Store", "Beispiel"],
      ["Visit the サンプル商店 Store", "サンプル商店"],
      ["Brand: Contoso", "Contoso"],
      ["Visiter la boutique Example", "Example"],
      ["Bezoek de Voorbeeld winkel", "Voorbeeld"],
      ["Visite a loja Exemplo", "Exemplo"],
      ["Örnek Mağazasını ziyaret edin", "Örnek"],
    ];

    for (const [byline, expected] of cases) {
      const meta = await parser({
        url: "https://www.amazon.com/dp/B000000001",
        html: `<html><body><a id="bylineInfo">${byline}</a></body></html>`,
        validateUrl: false,
      });
      expect(meta.author).toBe(expected);
    }
  });

  test("extracts clean book authors and prefers primary authors over translators", async () => {
    const meta = await parser({
      url: "https://www.amazon.com/dp/0000000001",
      html: `
        <html><body>
          <div id="bylineInfo">
            by <span class="author"><a href="/author/alex-rivera">Alex Rivera</a> (Author)</span>,
            <span class="author"><a href="/author/someone">Jane Smith</a> (Translator)</span>
            <span>Format: Hardcover</span>
          </div>
        </body></html>
      `,
      validateUrl: false,
    });
    expect(meta.author).toBe("Alex Rivera");
  });
});
