"use client";

import { TagNamePicker } from "@/components/dashboard/tags/TagAutocomplete";
import { Badge } from "@/components/ui/badge";
import { ButtonWithTooltip } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";

import { ListNamePicker } from "./ListNamePicker";
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

// Quotes a value unless the query parser reads it as one bare word.
const quoteIfNeeded = (value: string) =>
  /^[^\s()"#!-][^\s()"]*$/.test(value)
    ? value
    : `"${value.replaceAll('"', "")}"`;

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
  listId,
}: {
  query: string;
  onChange: (query: string) => void;
  // The list being edited, which can't be one of its own conditions
  listId?: string;
}) {
  const { t } = useTranslation();
  const { data: lists } = useBookmarkLists();
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

  const namedTerms = (prefix: string) =>
    tokens
      .filter((tok) => withoutNegation(tok).startsWith(prefix))
      .map((tok) => ({
        token: tok,
        prefix,
        name: unquote(withoutNegation(tok).slice(prefix.length)),
        negated: isNegated(tok),
      }))
      .filter((term) => term.name.length > 0);
  const tags = namedTerms("tag:");
  const pickedLists = namedTerms("list:");

  const toggleNamed = (prefix: string, name: string) => {
    const existing = namedTerms(prefix).find((term) => term.name === name);
    if (existing) {
      replaceTokens((tok) => tok === existing.token, []);
    } else {
      replaceTokens(() => false, [`${prefix}${quoteIfNeeded(name)}`]);
    }
  };

  // Edited in place, so the term doesn't jump to the end while it's typed.
  const textIndex = (prefix: string) =>
    tokens.findIndex(
      (tok) =>
        tok.startsWith(prefix) &&
        unquote(tok.slice(prefix.length)).trim().length > 0,
    );
  const textValue = (prefix: string) => {
    const index = textIndex(prefix);
    return index === -1 ? "" : unquote(tokens[index].slice(prefix.length));
  };
  const setText = (prefix: string, value: string) => {
    const index = textIndex(prefix);
    const next = [...tokens];
    const term = value.trim()
      ? `${prefix}${quoteIfNeeded(value.replaceAll('"', ""))}`
      : undefined;
    if (index === -1) {
      if (term) {
        next.push(term);
      }
    } else if (term) {
      next[index] = term;
    } else {
      next.splice(index, 1);
    }
    onChange(next.join(" "));
  };

  const age =
    tokens
      .find((tok) => tok.startsWith("age:") && tok.length > "age:".length)
      ?.slice("age:".length) ?? ANY;
  const hasPresetAge =
    age === ANY || (AGE_OPTIONS as readonly string[]).includes(age);

  const listIcon = (name: string) =>
    lists?.data.find((list) => list.name === name && list.userRole === "owner")
      ?.icon;

  const stateOptions = (
    <>
      <SelectItem value={ANY}>{t("lists.builder.any")}</SelectItem>
      <SelectItem value="yes">{t("lists.builder.yes")}</SelectItem>
      <SelectItem value="no">{t("lists.builder.no")}</SelectItem>
    </>
  );

  const chips = [...tags, ...pickedLists];

  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
      <div className="space-y-1.5 max-sm:col-span-2">
        <Label htmlFor="smart-list-tags">{t("lists.builder.tags")}</Label>
        <TagNamePicker
          id="smart-list-tags"
          placeholder={t("lists.builder.tags_placeholder")}
          selectedNames={tags.map((tag) => tag.name)}
          onToggle={(name) => toggleNamed("tag:", name)}
          getTypedNameLabel={(name) => t("lists.builder.use_tag", { name })}
        />
      </div>
      <div className="space-y-1.5 max-sm:col-span-2">
        <Label htmlFor="smart-list-lists">{t("lists.builder.lists")}</Label>
        <ListNamePicker
          id="smart-list-lists"
          placeholder={t("lists.builder.lists_placeholder")}
          selectedNames={pickedLists.map((list) => list.name)}
          onToggle={(name) => toggleNamed("list:", name)}
          excludeListId={listId}
        />
      </div>
      {chips.length > 0 && (
        <ul className="col-span-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <li key={chip.token}>
              <Badge
                variant="secondary"
                className="flex items-center gap-1 pr-1 font-normal"
              >
                {chip.negated && t("lists.builder.not")}{" "}
                {chip.prefix === "list:" && listIcon(chip.name)} {chip.name}
                <ButtonWithTooltip
                  type="button"
                  tooltip={t("tags.remove_named", { name: chip.name })}
                  aria-label={t("tags.remove_named", { name: chip.name })}
                  variant="ghost"
                  size="none"
                  // The pseudo element is the hit area: 32px, or 44px at phone width.
                  className="relative flex size-5 items-center justify-center rounded-sm text-muted-foreground after:absolute after:-inset-1.5 after:content-[''] hover:bg-transparent hover:text-foreground max-sm:after:-inset-3"
                  onClick={() => replaceTokens((tok) => tok === chip.token, [])}
                >
                  <X className="size-4" />
                </ButtonWithTooltip>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-1.5 max-sm:col-span-2">
        <Label htmlFor="smart-list-title">{t("lists.builder.title")}</Label>
        <Input
          id="smart-list-title"
          value={textValue("title:")}
          onChange={(e) => setText("title:", e.target.value)}
          placeholder={t("lists.builder.title_placeholder")}
        />
      </div>
      <div className="space-y-1.5 max-sm:col-span-2">
        <Label htmlFor="smart-list-url">{t("lists.builder.url")}</Label>
        <Input
          id="smart-list-url"
          value={textValue("url:")}
          onChange={(e) => setText("url:", e.target.value)}
          placeholder={t("lists.builder.url_placeholder")}
        />
      </div>
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
  );
}
