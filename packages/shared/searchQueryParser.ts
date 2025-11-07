import {
  alt,
  alt_sc,
  apply,
  kleft,
  kmid,
  kright,
  lrec_sc,
  opt,
  rule,
  seq,
  str,
  tok,
  Token,
  TokenPosition,
} from "typescript-parsec";
import { z } from "zod";

import { BookmarkTypes } from "./types/bookmarks";
import { Matcher } from "./types/search";
import { parseRelativeDate } from "./utils/relativeDateUtils";

enum TokenType {
  And = "AND",
  Or = "OR",

  Qualifier = "QUALIFIER",
  Ident = "IDENT",
  StringLiteral = "STRING_LITERAL",

  LParen = "LPAREN",
  RParen = "RPAREN",
  Space = "SPACE",
  Hash = "HASH",
  Minus = "MINUS",
}

// Rules are in order of priority
const lexerRules: [RegExp, TokenType][] = [
  [/^\s+and/i, TokenType.And],
  [/^\s+or/i, TokenType.Or],

  [/^#/, TokenType.Hash],
  [/^(is|url|list|after|before|age|feed|title):/, TokenType.Qualifier],

  [/^"([^"]+)"/, TokenType.StringLiteral],

  [/^\(/, TokenType.LParen],
  [/^\)/, TokenType.RParen],
  [/^\s+/, TokenType.Space],
  [/^-/, TokenType.Minus],

  // This needs to be last as it matches a lot of stuff
  [/^[^ )(]+/, TokenType.Ident],
] as const;

class LexerToken implements Token<TokenType> {
  private constructor(
    private readonly input: string,
    public kind: TokenType,
    public text: string,
    public pos: TokenPosition,
  ) {}

  public static from(input: string): Token<TokenType> | undefined {
    const tok = new LexerToken(
      input,
      /* Doesn't matter */ TokenType.Ident,
      "",
      {
        index: 0,
        rowBegin: 1,
        rowEnd: 1,
        columnBegin: 0,
        columnEnd: 0,
      },
    );
    return tok.next;
  }

  public get next(): Token<TokenType> | undefined {
    if (!this.input.length) {
      return undefined;
    }

    for (const [regex, tokenType] of lexerRules) {
      const matchRes = regex.exec(this.input);
      if (!matchRes) {
        continue;
      }
      const match = matchRes[0];
      return new LexerToken(this.input.slice(match.length), tokenType, match, {
        index: this.pos.index + match.length,
        columnBegin: this.pos.index + 1,
        columnEnd: this.pos.index + 1 + match.length,
        // Our strings are always only one line
        rowBegin: 1,
        rowEnd: 1,
      });
    }
    // No match
    throw new Error(
      `Failed to tokenize the token at position ${this.pos.index}: ${this.input[0]}`,
    );
  }
}

export interface TextAndMatcher {
  text: string;
  matcher?: Matcher;
}

const MATCHER = rule<TokenType, TextAndMatcher>();
const EXP = rule<TokenType, TextAndMatcher>();

MATCHER.setPattern(
  alt_sc(
    apply(
      seq(opt(str("-")), kright(str("is:"), tok(TokenType.Ident))),
      ([minus, ident]) => {
        switch (ident.text) {
          case "fav":
            return {
              text: "",
              matcher: { type: "favourited", favourited: !minus },
            };
          case "archived":
            return {
              text: "",
              matcher: { type: "archived", archived: !minus },
            };
          case "tagged":
            return {
              text: "",
              matcher: { type: "tagged", tagged: !minus },
            };
          case "inlist":
            return {
              text: "",
              matcher: { type: "inlist", inList: !minus },
            };
          case "link":
            return {
              text: "",
              matcher: {
                type: "type",
                typeName: BookmarkTypes.LINK,
                inverse: !!minus,
              },
            };
          case "text":
            return {
              text: "",
              matcher: {
                type: "type",
                typeName: BookmarkTypes.TEXT,
                inverse: !!minus,
              },
            };
          case "media":
            return {
              text: "",
              matcher: {
                type: "type",
                typeName: BookmarkTypes.ASSET,
                inverse: !!minus,
              },
            };
          default:
            // If the token is not known, emit it as pure text
            return {
              text: `${minus?.text ?? ""}is:${ident.text}`,
              matcher: undefined,
            };
        }
      },
    ),
    apply(
      seq(
        opt(str("-")),
        alt(tok(TokenType.Qualifier), tok(TokenType.Hash)),
        alt(
          apply(tok(TokenType.Ident), (tok) => {
            return tok.text;
          }),
          apply(tok(TokenType.StringLiteral), (tok) => {
            return tok.text.slice(1, -1);
          }),
        ),
      ),
      ([minus, qualifier, ident]) => {
        switch (qualifier.text) {
          case "url:":
            return {
              text: "",
              matcher: { type: "url", url: ident, inverse: !!minus },
            };
          case "title:":
            return {
              text: "",
              matcher: { type: "title", title: ident, inverse: !!minus },
            };
          case "#":
            return {
              text: "",
              matcher: { type: "tagName", tagName: ident, inverse: !!minus },
            };
          case "list:":
            return {
              text: "",
              matcher: { type: "listName", listName: ident, inverse: !!minus },
            };
          case "feed:":
            return {
              text: "",
              matcher: {
                type: "rssFeedName",
                feedName: ident,
                inverse: !!minus,
              },
            };
          case "after:":
            try {
              return {
                text: "",
                matcher: {
                  type: "dateAfter",
                  dateAfter: z.coerce.date().parse(ident),
                  inverse: !!minus,
                },
              };
            } catch {
              return {
                // If parsing the date fails, emit it as pure text
                text: (minus?.text ?? "") + qualifier.text + ident,
                matcher: undefined,
              };
            }
          case "before:":
            try {
              return {
                text: "",
                matcher: {
                  type: "dateBefore",
                  dateBefore: z.coerce.date().parse(ident),
                  inverse: !!minus,
                },
              };
            } catch {
              return {
                // If parsing the date fails, emit it as pure text
                text: (minus?.text ?? "") + qualifier.text + ident,
                matcher: undefined,
              };
            }
          case "age:":
            try {
              const { direction, amount, unit } = parseRelativeDate(ident);
              return {
                text: "",
                matcher: {
                  type: "age",
                  relativeDate: { direction, amount, unit },
                },
              };
            } catch {
              return {
                // If parsing the relative time fails, emit it as pure text
                text: (minus?.text ?? "") + qualifier.text + ident,
                matcher: undefined,
              };
            }
          default:
            // If the token is not known, emit it as pure text
            return {
              text: (minus?.text ?? "") + qualifier.text + ident,
              matcher: undefined,
            };
        }
      },
    ),
    // Ident or an incomlete qualifier
    apply(alt(tok(TokenType.Ident), tok(TokenType.Qualifier)), (toks) => {
      return {
        text: toks.text,
        matcher: undefined,
      };
    }),
    kmid(tok(TokenType.LParen), EXP, tok(TokenType.RParen)),
  ),
);

EXP.setPattern(
  lrec_sc(
    MATCHER,
    seq(
      alt(
        tok(TokenType.Space),
        kleft(tok(TokenType.And), tok(TokenType.Space)),
        kleft(tok(TokenType.Or), tok(TokenType.Space)),
      ),
      MATCHER,
    ),
    (toks, next) => {
      switch (next[0].kind) {
        case TokenType.Space:
        case TokenType.And:
          return {
            text: [toks.text, next[1].text].join(" ").trim(),
            matcher:
              !!toks.matcher || !!next[1].matcher
                ? {
                    type: "and",
                    matchers: [toks.matcher, next[1].matcher].filter(
                      (a) => !!a,
                    ),
                  }
                : undefined,
          };
        case TokenType.Or:
          return {
            text: [toks.text, next[1].text].join(" ").trim(),
            matcher:
              !!toks.matcher || !!next[1].matcher
                ? {
                    type: "or",
                    matchers: [toks.matcher, next[1].matcher].filter(
                      (a) => !!a,
                    ),
                  }
                : undefined,
          };
      }
    },
  ),
);

function flattenAndsAndOrs(matcher: Matcher): Matcher {
  switch (matcher.type) {
    case "and":
    case "or": {
      if (matcher.matchers.length == 1) {
        return flattenAndsAndOrs(matcher.matchers[0]);
      }
      const flattened: Matcher[] = [];
      for (let m of matcher.matchers) {
        // If inside the matcher is another matcher of the same type, flatten it
        m = flattenAndsAndOrs(m);
        if (m.type == matcher.type) {
          flattened.push(...m.matchers);
        } else {
          flattened.push(m);
        }
      }
      matcher.matchers = flattened;
      return matcher;
    }
    default:
      return matcher;
  }
}

export function _parseAndPrintTokens(query: string) {
  console.log(`PARSING: ${query}`);
  let tok = LexerToken.from(query);
  do {
    console.log(tok?.kind, tok?.text);
    tok = tok?.next;
  } while (tok);
  console.log("DONE");
}

function consumeTokenStream(token: Token<TokenType>) {
  let str = "";
  let tok: Token<TokenType> | undefined = token;
  do {
    str += tok.text;
    tok = tok.next;
  } while (tok);
  return str;
}

export function parseSearchQuery(
  query: string,
): TextAndMatcher & { result: "full" | "partial" | "invalid" } {
  // _parseAndPrintTokens(query); // Uncomment to debug tokenization
  const parsed = EXP.parse(LexerToken.from(query.trim()));
  if (!parsed.successful || parsed.candidates.length != 1) {
    // If the query is not valid, return the whole query as pure text
    return {
      text: query,
      result: "invalid",
    };
  }

  const parseCandidate = parsed.candidates[0];
  if (parseCandidate.result.matcher) {
    parseCandidate.result.matcher = flattenAndsAndOrs(
      parseCandidate.result.matcher,
    );
  }
  if (parseCandidate.nextToken) {
    // Parser failed to consume the whole query. This usually happen
    // when the user is still typing the query. Return the partial
    // result and the remaining query as pure text
    return {
      text: (
        parseCandidate.result.text +
        consumeTokenStream(parseCandidate.nextToken)
      ).trim(),
      matcher: parseCandidate.result.matcher,
      result: "partial",
    };
  }

  return {
    text: parseCandidate.result.text,
    matcher: parseCandidate.result.matcher,
    result: "full",
  };
}
