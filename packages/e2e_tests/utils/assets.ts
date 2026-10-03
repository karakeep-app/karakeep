import * as fs from "fs";
import * as path from "path";

const pdfFixturePath = path.join(__dirname, "..", "fixtures", "test.pdf");
const pdfContent = fs.readFileSync(pdfFixturePath);

export function createTestPdfFile(fileName = "test.pdf"): File {
  return new File([pdfContent], fileName, {
    type: "application/pdf",
  });
}

const pdfWithTextFixturePath = path.join(
  __dirname,
  "..",
  "fixtures",
  "test-with-text.pdf",
);
const pdfWithTextContent = fs.readFileSync(pdfWithTextFixturePath);

/**
 * A PDF that actually carries extractable text, so asset preprocessing has
 * something to put in `bookmarkAssets.content`. `test.pdf` has an empty page.
 */
export function createTestPdfFileWithText(
  fileName = "test-with-text.pdf",
): File {
  return new File([pdfWithTextContent], fileName, {
    type: "application/pdf",
  });
}
