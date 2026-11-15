export const ANY = "any";
export const AGE_OPTIONS = ["<7d", "<30d", "<1y", ">30d", ">1y"] as const;

// Splits a query into its space separated terms, keeping quoted values whole.
export const tokenize = (query: string): string[] =>
  query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];

export const isNegated = (token: string) => /^[-!]/.test(token);

export const withoutNegation = (token: string) => token.replace(/^[-!]/, "");

export const unquote = (value: string) => value.replace(/^"|"$/g, "");

// Qualifiers the builder shows as a list of picked names. "#" is short for "tag:".
const NAMED = ["tag:", "list:", "#"];
// Qualifiers the builder shows as a single "contains" field.
const TEXT = ["title:", "url:"];

/**
 * Whether the builder's controls can show all of a query. Anything else, such as
 * free text, grouping or a second value for one control, needs the raw query.
 */
export function isQueryRepresentableInBuilder(query: string) {
  const seen = new Set<string>();
  return tokenize(query).every((token) => {
    const term = withoutNegation(token);
    const named = NAMED.find((prefix) => term.startsWith(prefix));
    if (named) {
      return unquote(term.slice(named.length)).length > 0;
    }
    const text = TEXT.find((prefix) => term.startsWith(prefix));
    if (text) {
      if (isNegated(token) || seen.has(text)) {
        return false;
      }
      seen.add(text);
      return unquote(term.slice(text.length)).trim().length > 0;
    }
    if (term.startsWith("age:")) {
      if (isNegated(token) || seen.has("age")) {
        return false;
      }
      seen.add("age");
      return term.length > "age:".length;
    }
    if (term === "is:fav" || term === "is:archived") {
      if (seen.has(term)) {
        return false;
      }
      seen.add(term);
      return true;
    }
    return false;
  });
}
