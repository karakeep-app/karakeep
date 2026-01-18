import * as fs from "fs";
import * as path from "path";

const pdfFixturePath = path.join(__dirname, "..", "fixtures", "test.pdf");
const pdfContent = fs.readFileSync(pdfFixturePath);

export function createTestPdfFile(fileName = "test.pdf"): File {
  return new File([pdfContent], fileName, {
    type: "application/pdf",
  });
}
