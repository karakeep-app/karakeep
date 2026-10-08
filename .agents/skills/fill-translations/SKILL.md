---
name: fill-translations
description: Find and fill missing or outdated translation strings in the web app's locales, using the English (en) strings as the source of truth. Use when asked to update, sync, fill or fix translations/i18n, or after adding or changing English strings in apps/web/lib/i18n/locales/en/translation.json.
---

# Filling missing and outdated translations

The web app's strings live in `apps/web/lib/i18n/locales/<locale>/translation.json` (nested i18next JSON). `en` is the source of truth. Features usually add keys to `en` only, so the other locales drift.

`i18n.mjs` in this directory compares every locale against `en` and reports three kinds of problem per key:

- **MISSING**: the key exists in `en` but is absent or empty in the locale.
- **OUTDATED**: the `en` value changed after the locale's value last changed. The script works this out from the git history of both files plus the working tree, so it also catches `en` edits you haven't committed yet.
- **OBSOLETE**: the key exists in the locale but no longer in `en` (usually a removed or renamed key).

Plurals follow i18next's `_one`/`_other` suffixes. For each plural group in `en`, the script expects the locale's own CLDR categories (from `Intl.PluralRules`). Arabic, for example, needs `_zero`, `_one`, `_two`, `_few`, `_many` and `_other`, and Japanese needs only `_other`.

## 1. Report

From the repo root:

```sh
node .agents/skills/fill-translations/i18n.mjs report                    # summary table + details
node .agents/skills/fill-translations/i18n.mjs report --locales de,fr    # subset
node .agents/skills/fill-translations/i18n.mjs report --json             # machine-readable
```

Each OUTDATED entry prints the current `en` value, the `en` value at the time the locale was last translated, and the current translation. Use the diff between the two `en` values to see what to change in the translation.

## 2. Translate

For each locale with work to do, write a flat JSON file of `"dotted.key": "translation"` to `$TMPDIR`, for example `$TMPDIR/i18n-de.json`. Include every MISSING and OUTDATED key. There are about 30 locales. When many need work, split them across parallel subagents, giving each a few locales and these rules:

- Translate from the **current** `en` value. Read the surrounding keys in the locale file and reuse the terms it already uses (e.g. its word for "bookmark", "list", "tag", "highlight"), its formality level (du/Sie, tu/vous) and its capitalization style.
- Keep `{{placeholders}}` exactly as they are, untranslated. Keep numbered tags like `<1>…</1>` and keep their contents translated. Keep product names (Karakeep), keyboard shortcuts and technical tokens (URL, API, RSS, OAuth) unchanged.
- Match the `en` punctuation style, e.g. `…` rather than `...` when `en` uses it.
- For OUTDATED keys, always write a value, even when the change is only punctuation or wording. A key whose value doesn't change stays flagged.
- For plural groups, write every form the report lists as missing for that locale, using the language's grammar for each category (not a copy of `_other`).
- `en_US` is an English variant. Copy the `en` values (with US spelling).
- `zhtw` is Traditional Chinese, `zh` is Simplified Chinese, and `nb_NO` is Norwegian Bokmål.
- For an OBSOLETE key, check whether it's a renamed key whose new name is MISSING. If the meaning didn't change, reuse the old translation for the new key.

## 3. Apply

```sh
node .agents/skills/fill-translations/i18n.mjs apply de $TMPDIR/i18n-de.json --prune
```

`apply` merges the values into the locale file and puts each new key next to its `en` sibling, so the diff stays small. It writes the file in the repo's format (2-space JSON with a trailing newline). `--prune` removes OBSOLETE keys. Before pruning, check that a key really is unused. A key built dynamically in code (e.g. ``t(`admin.background_jobs.${name}`)``) shows up as obsolete only if it was also removed from `en`, so `en` is the reference. If in doubt, grep `apps/web` for the key's last segment.

## 4. Verify

```sh
node .agents/skills/fill-translations/i18n.mjs report
git diff --stat apps/web/lib/i18n/locales
```

Every locale should report 0 missing and 0 obsolete. The only OUTDATED entries left should be ones where you deliberately kept the old value. Skim the diff for keys that were copied without being translated, and for broken placeholders. To list the placeholder mismatches:

```sh
node -e '
const fs=require("fs"),d="apps/web/lib/i18n/locales";
const flat=(o,p="",r={})=>{for(const[k,v]of Object.entries(o)){const q=p?p+"."+k:k;typeof v=="object"?flat(v,q,r):r[q]=v}return r};
const ph=s=>(s.match(/\{\{[^}]+\}\}|<\/?\d+>/g)||[]).sort().join(" ");
const en=flat(JSON.parse(fs.readFileSync(d+"/en/translation.json")));
for(const l of fs.readdirSync(d)){const f=d+"/"+l+"/translation.json";if(!fs.existsSync(f))continue;
 for(const[k,v]of Object.entries(flat(JSON.parse(fs.readFileSync(f))))){const e=en[k]??en[k.replace(/_(zero|one|two|few|many)$/,"_other")];
  if(e!==undefined&&ph(e)!==ph(v)&&!/_(zero|one)$/.test(k))console.log(l,k,JSON.stringify(v))}}'
```

(`_zero`/`_one` forms are skipped because they may legitimately drop `{{count}}`.)

Commit with an `i18n:` prefix, e.g. `i18n: fill missing translations`.
