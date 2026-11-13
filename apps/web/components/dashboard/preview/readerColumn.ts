import type { ZReaderFontFamily } from "@karakeep/shared/types/users";

/**
 * The widest the reading column gets, which comes to about 68 characters a line.
 * A ch is the width of a "0", and running text in a proportional font averages
 * about three quarters of that, so 68ch would fit around 90 characters. Being in
 * ch, these still follow the reader's font and size settings.
 */
const COLUMN_WIDTH_BY_FONT: Record<ZReaderFontFamily, string> = {
  serif: "51ch",
  sans: "50ch",
  mono: "68ch",
};

export function readerColumnWidth(fontFamily: ZReaderFontFamily) {
  return COLUMN_WIDTH_BY_FONT[fontFamily];
}
