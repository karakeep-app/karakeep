import { format } from "date-fns";

export function normalizeI18nLanguage(language: string | undefined) {
  if (!language) {
    return undefined;
  }

  if (language === "zhtw") {
    return "zh-TW";
  }

  return language.replace("_", "-");
}

export function formatLocalDate(
  date: Date,
  formatStr: string,
  language?: string,
) {
  const locale = normalizeI18nLanguage(language);

  const formatWithIntl = (options: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat(locale, options).format(date);
    } catch (error) {
      if (error instanceof RangeError) {
        return new Intl.DateTimeFormat(undefined, options).format(date);
      }

      throw error;
    }
  };

  if (formatStr === "PP, p") {
    return formatWithIntl({
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  if (formatStr === "PPP") {
    return formatWithIntl({
      dateStyle: "long",
    });
  }

  return format(date, formatStr);
}
