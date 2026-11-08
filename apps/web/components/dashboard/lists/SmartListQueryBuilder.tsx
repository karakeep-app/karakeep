"use client";

import { TagNamePicker } from "@/components/dashboard/tags/TagAutocomplete";
import { Badge } from "@/components/ui/badge";
import { ButtonWithTooltip } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n/client";
import { X } from "lucide-react";

import {
  AGE_OPTIONS,
  ANY,
  isNegated,
  tokenize,
  unquote,
  withoutNegation,
} from "./smartListBuilderQuery";

// Translation keys can't contain the comparison signs the query uses
const AGE_LABEL_KEYS = {
  "<7d": "last_7_days",
  "<30d": "last_30_days",
  "<1y": "last_year",
  ">30d": "over_30_days",
  ">1y": "over_a_year",
} as const;

const quoteIfNeeded = (value: string) =>
  /^[\w-]+$/.test(value) ? value : `"${value.replaceAll('"', "")}"`;

function qualifierState(tokens: string[], term: string) {
  const token = tokens.find((tok) => withoutNegation(tok) === term);
  if (!token) {
    return ANY;
  }
  return isNegated(token) ? "no" : "yes";
}

/**
 * Builds the simple cases of a smart list query. The query string stays the
 * source of truth: every control reads its value from it and only rewrites its
 * own terms, so anything typed by hand next to them is left alone.
 */
export function SmartListQueryBuilder({
  query,
  onChange,
}: {
  query: string;
  onChange: (query: string) => void;
}) {
  const { t } = useTranslation();
  const tokens = tokenize(query);

  const replaceTokens = (
    shouldRemove: (token: string) => boolean,
    added: string[],
  ) => {
    onChange(
      [...tokens.filter((tok) => !shouldRemove(tok)), ...added].join(" "),
    );
  };

  const setQualifier = (term: string, value: string) => {
    replaceTokens(
      (tok) => withoutNegation(tok) === term,
      value === ANY ? [] : [value === "no" ? `-${term}` : term],
    );
  };

  const tags = tokens
    .filter((tok) => withoutNegation(tok).startsWith("tag:"))
    .map((tok) => ({
      token: tok,
      name: unquote(withoutNegation(tok).slice("tag:".length)),
      negated: isNegated(tok),
    }))
    .filter((tag) => tag.name.length > 0);

  const toggleTag = (name: string) => {
    const existing = tags.find((tag) => tag.name === name);
    if (existing) {
      replaceTokens((tok) => tok === existing.token, []);
    } else {
      replaceTokens(() => false, [`tag:${quoteIfNeeded(name)}`]);
    }
  };

  const age =
    tokens.find((tok) => tok.startsWith("age:"))?.slice("age:".length) ?? ANY;
  const hasPresetAge =
    age === ANY || (AGE_OPTIONS as readonly string[]).includes(age);

  const stateOptions = (
    <>
      <SelectItem value={ANY}>{t("lists.builder.any")}</SelectItem>
      <SelectItem value="yes">{t("lists.builder.yes")}</SelectItem>
      <SelectItem value="no">{t("lists.builder.no")}</SelectItem>
    </>
  );

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="smart-list-favourited">
            {t("lists.builder.favourited")}
          </Label>
          <Select
            value={qualifierState(tokens, "is:fav")}
            onValueChange={(value) => setQualifier("is:fav", value)}
          >
            <SelectTrigger id="smart-list-favourited">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{stateOptions}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="smart-list-archived">
            {t("lists.builder.archived")}
          </Label>
          <Select
            value={qualifierState(tokens, "is:archived")}
            onValueChange={(value) => setQualifier("is:archived", value)}
          >
            <SelectTrigger id="smart-list-archived">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{stateOptions}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 max-sm:col-span-2">
          <Label htmlFor="smart-list-tags">{t("lists.builder.tags")}</Label>
          <TagNamePicker
            id="smart-list-tags"
            placeholder={t("lists.builder.tags_placeholder")}
            selectedNames={tags.map((tag) => tag.name)}
            onToggle={toggleTag}
            getTypedNameLabel={(name) => t("lists.builder.use_tag", { name })}
          />
        </div>
        <div className="space-y-1.5 max-sm:col-span-2">
          <Label htmlFor="smart-list-age">{t("lists.builder.age")}</Label>
          <Select
            value={age}
            onValueChange={(value) =>
              replaceTokens(
                (tok) => tok.startsWith("age:"),
                value === ANY ? [] : [`age:${value}`],
              )
            }
          >
            <SelectTrigger id="smart-list-age">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("lists.builder.any")}</SelectItem>
              {AGE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`lists.builder.age_options.${AGE_LABEL_KEYS[option]}`)}
                </SelectItem>
              ))}
              {!hasPresetAge && <SelectItem value={age}>{age}</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      </div>
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag.token}>
              <Badge
                variant="secondary"
                className="flex items-center gap-1 pr-1 font-normal"
              >
                {tag.negated && t("lists.builder.not")} {tag.name}
                <ButtonWithTooltip
                  type="button"
                  tooltip={t("tags.remove_named", { name: tag.name })}
                  aria-label={t("tags.remove_named", { name: tag.name })}
                  variant="ghost"
                  size="none"
                  // The pseudo element is the hit area: 32px, or 44px at phone width.
                  className="relative flex size-5 items-center justify-center rounded-sm text-muted-foreground after:absolute after:-inset-1.5 after:content-[''] hover:bg-transparent hover:text-foreground max-sm:after:-inset-3"
                  onClick={() => replaceTokens((tok) => tok === tag.token, [])}
                >
                  <X className="size-4" />
                </ButtonWithTooltip>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
