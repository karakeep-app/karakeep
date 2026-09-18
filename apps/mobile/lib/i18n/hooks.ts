import { useMemo } from "react";
import type { TFunction } from "i18next";
import { useTranslation as useTranslationOrg } from "react-i18next";

import { i18n } from "./index";

/**
 * Typed translation hook for the mobile app.
 *
 * Mirrors the web app's `useTranslation` (react-i18next bound to the shared
 * i18next instance), defaulting to the `mobile` namespace. For shared web
 * concepts use {@link useSharedTranslation} (or the `useCommonActions` /
 * `useCommonStrings` helpers below) instead of prefixing keys with
 * `translation:` -- cross-namespace keys do not typecheck on the default
 * `mobile` function.
 */
export const useTranslation = useTranslationOrg;

/**
 * Translation hook bound to the shared web `translation` namespace, e.g.
 * `t("actions.save")`, `t("common.tags")`. Same wording as the web app.
 */
export function useSharedTranslation() {
  return useTranslationOrg("translation");
}

/** `t` function type for the shared web namespace (for passing as a prop). */
export type SharedTFunction = TFunction<"translation", undefined>;

/** `t` function type for the `mobile` namespace (for passing as a prop). */
export type MobileTFunction = TFunction<"mobile", undefined>;

/**
 * Same as {@link useTranslation}, but safe to call above <I18nProvider>
 * (e.g. in the root layout): it subscribes to the shared i18n singleton
 * explicitly so static navigation `options` still re-render on language
 * change.
 */
export function useAppTranslation() {
  return useTranslationOrg(undefined, { i18n });
}

/**
 * Convenience accessor for the shared web `actions.*` keys
 * ("Save", "Delete", "Cancel", ...) so call sites stay in sync with the
 * web wording without repeating the namespace.
 */
export function useCommonActions() {
  const { t } = useSharedTranslation();
  return useMemo(
    () => ({
      t,
      save: t("actions.save"),
      add: t("actions.add"),
      create: t("actions.create"),
      edit: t("actions.edit"),
      rename: t("actions.rename"),
      confirm: t("actions.confirm"),
      cancel: t("actions.cancel"),
      close: t("actions.close"),
      delete: t("actions.delete"),
      remove: t("actions.remove"),
      archive: t("actions.archive"),
      unarchive: t("actions.unarchive"),
      favorite: t("actions.favorite"),
      unfavorite: t("actions.unfavorite"),
      refresh: t("actions.refresh"),
      retry: t("actions.refresh"),
      more: t("actions.more"),
      manageLists: t("actions.manage_lists"),
      removeFromList: t("actions.remove_from_list"),
      editTags: t("actions.edit_tags"),
      editNotes: t("actions.edit_notes"),
      copyLink: t("actions.copy_link"),
      signOut: t("actions.sign_out"),
      summarizeWithAI: t("actions.summarize_with_ai"),
      download: t("actions.download"),
      select: t("actions.select"),
      selectAll: t("actions.select_all"),
      unselectAll: t("actions.unselect_all"),
    }),
    [t],
  );
}

/**
 * Convenience accessor for the shared web `common.*` keys
 * ("Tags", "Search", "Something went wrong", ...).
 */
export function useCommonStrings() {
  const { t } = useSharedTranslation();
  return useMemo(
    () => ({
      t,
      tags: t("common.tags"),
      home: t("common.home"),
      search: t("common.search"),
      highlights: t("common.highlights"),
      name: t("common.name"),
      email: t("common.email"),
      password: t("common.password"),
      title: t("common.title"),
      description: t("common.description"),
      summary: t("common.summary"),
      note: t("common.note"),
      bookmarks: t("common.bookmarks"),
      bookmark: t("common.bookmarks"),
      somethingWentWrong: t("common.something_went_wrong"),
      archive: t("common.archive"),
      source: t("common.source"),
      screenshot: t("common.screenshot"),
      type: t("common.type"),
      unknown: t("common.unknown", { defaultValue: "Unknown" }),
    }),
    [t],
  );
}
