import * as fs from "fs";
import * as path from "path";

const pdfFixturePath = path.join(__dirname, "..", "fixtures", "test.pdf");
const pdfContent = fs.readFileSync(pdfFixturePath);

export function createTestPdfFile(fileName = "test.pdf"): File {
  return new File([pdfContent], fileName, {
    type: "application/pdf",
  });
}

export function createTestVideoFile(fileName = "test.mp4"): File {
  return new File([new Uint8Array([0, 0, 0, 0])], fileName, {
    type: "video/mp4",
  });
}
