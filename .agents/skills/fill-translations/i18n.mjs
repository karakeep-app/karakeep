#!/usr/bin/env node
// Finds missing, outdated and obsolete translation keys in the web app's
// locales (using `en` as the source of truth), and merges translations back.
//
//   node .agents/skills/fill-translations/i18n.mjs report [--locales de,fr] [--json]
//   node .agents/skills/fill-translations/i18n.mjs apply <locale> <file.json> [--prune]
//
// "Outdated" means the English value of a key changed (in git history, or in
// the working tree) after the last time the locale's value for that key
// changed.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const LOCALES_REL = "apps/web/lib/i18n/locales";
const LOCALES_DIR = path.join(REPO, LOCALES_REL);
const SOURCE = "en";
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const PLURAL_ORDER = ["zero", "one", "two", "few", "many", "other"];

const fileRel = (locale) => `${LOCALES_REL}/${locale}/translation.json`;
const fileAbs = (locale) => path.join(REPO, fileRel(locale));

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

// Returns [{ ts, flat }] from oldest to newest, ending with the working tree.
function history(locale) {
  const rel = fileRel(locale);
  const log = execFileSync(
    "git",
    ["log", "--reverse", "--format=%H %ct", "--", rel],
    { cwd: REPO, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, ts] = l.split(" ");
      return { sha, ts: Number(ts) };
    });

  const res = spawnSync("git", ["cat-file", "--batch"], {
    cwd: REPO,
    input: log.map((c) => `${c.sha}:${rel}\n`).join(""),
    maxBuffer: 1024 * 1024 * 1024,
  });
  const buf = res.stdout;
  const snapshots = [];
  let pos = 0;
  for (const c of log) {
    const nl = buf.indexOf(10, pos);
    const header = buf.subarray(pos, nl).toString();
    pos = nl + 1;
    if (header.endsWith("missing")) continue; // file deleted in this commit
    const size = Number(header.split(" ")[2]);
    const content = buf.subarray(pos, pos + size).toString();
    pos += size + 1;
    try {
      snapshots.push({ ts: c.ts, flat: flatten(JSON.parse(content)) });
    } catch {
      // Unparseable historical version; skip it.
    }
  }
  if (fs.existsSync(fileAbs(locale))) {
    snapshots.push({
      ts: Math.floor(Date.now() / 1000),
      flat: flatten(JSON.parse(fs.readFileSync(fileAbs(locale), "utf8"))),
    });
  }
  return snapshots;
}

// For every key in the latest snapshot: its current value, and the full list
// of (ts, value) changes.
function keyTimeline(snapshots) {
  const changes = {};
  let prev = {};
  for (const { ts, flat } of snapshots) {
    for (const [k, v] of Object.entries(flat)) {
      if (prev[k] !== v) (changes[k] ??= []).push({ ts, value: v });
    }
    prev = flat;
  }
  return { current: prev, changes };
}

const lastChange = (tl, key) => tl.changes[key]?.at(-1)?.ts ?? 0;
const valueAt = (tl, key, ts) => {
  let v;
  for (const c of tl.changes[key] ?? []) if (c.ts <= ts) v = c.value;
  return v;
};

function bcp47(locale) {
  if (locale === "zhtw") return "zh-TW";
  return locale.replace("_", "-");
}

function pluralCategories(locale) {
  try {
    return new Intl.PluralRules(bcp47(locale)).resolvedOptions()
      .pluralCategories;
  } catch {
    return ["one", "other"];
  }
}

function listLocales() {
  return fs
    .readdirSync(LOCALES_DIR)
    .filter(
      (d) =>
        d !== SOURCE &&
        fs.existsSync(path.join(LOCALES_DIR, d, "translation.json")),
    )
    .sort();
}

// The keys a locale is expected to have, mapped to the en key they mirror.
// Plural groups (foo_one/foo_other in en) expand to the locale's own CLDR
// plural categories.
function expectedKeys(enFlat, locale) {
  const expected = {};
  const pluralBases = new Set();
  for (const k of Object.keys(enFlat)) {
    const m = k.match(PLURAL_SUFFIX);
    if (m && `${k.slice(0, -m[0].length)}_other` in enFlat) {
      pluralBases.add(k.slice(0, -m[0].length));
    } else {
      expected[k] = k;
    }
  }
  const cats = pluralCategories(locale);
  for (const base of pluralBases) {
    for (const cat of cats) {
      const k = `${base}_${cat}`;
      expected[k] = k in enFlat ? k : `${base}_other`;
    }
  }
  return { expected, pluralBases };
}

function analyze(locale, en) {
  const tl = keyTimeline(history(locale));
  const { expected, pluralBases } = expectedKeys(en.current, locale);
  const missing = [];
  const outdated = [];
  const obsolete = [];

  for (const [key, enKey] of Object.entries(expected)) {
    const value = tl.current[key];
    if (value === undefined || value === "") {
      missing.push({ key, en: en.current[enKey] });
      continue;
    }
    const enTs = lastChange(en, enKey);
    const locTs = lastChange(tl, key);
    if (enTs > locTs) {
      outdated.push({
        key,
        en: en.current[enKey],
        enWhenTranslated: valueAt(en, enKey, locTs) ?? null,
        current: value,
      });
    }
  }

  for (const [key, value] of Object.entries(tl.current)) {
    if (key in expected) continue;
    const m = key.match(PLURAL_SUFFIX);
    // Extra plural forms of a known plural group are harmless.
    if (m && pluralBases.has(key.slice(0, -m[0].length))) continue;
    obsolete.push({ key, value });
  }

  return { locale, missing, outdated, obsolete };
}

function report(args) {
  const json = args.includes("--json");
  const li = args.indexOf("--locales");
  const locales =
    li >= 0 ? args[li + 1].split(",").map((s) => s.trim()) : listLocales();

  const en = keyTimeline(history(SOURCE));
  const results = locales.map((l) => analyze(l, en));

  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log("locale   missing  outdated  obsolete");
  for (const r of results) {
    console.log(
      `${r.locale.padEnd(8)} ${String(r.missing.length).padStart(7)} ${String(r.outdated.length).padStart(9)} ${String(r.obsolete.length).padStart(9)}`,
    );
  }
  for (const r of results) {
    if (!r.missing.length && !r.outdated.length && !r.obsolete.length) continue;
    console.log(`\n## ${r.locale}`);
    for (const m of r.missing)
      console.log(`MISSING  ${m.key}: ${JSON.stringify(m.en)}`);
    for (const o of r.outdated) {
      console.log(`OUTDATED ${o.key}`);
      console.log(`    en now:             ${JSON.stringify(o.en)}`);
      console.log(
        `    en when translated: ${JSON.stringify(o.enWhenTranslated)}`,
      );
      console.log(`    current:            ${JSON.stringify(o.current)}`);
    }
    for (const o of r.obsolete)
      console.log(`OBSOLETE ${o.key}: ${JSON.stringify(o.value)}`);
  }
}

// Sets `value` at `parts` in `obj`, inserting new keys right after their
// closest preceding sibling in the en file so diffs stay local.
function setOrdered(obj, enObj, parts, value) {
  const [head, ...rest] = parts;
  const child = rest.length
    ? obj[head] && typeof obj[head] === "object"
      ? obj[head]
      : {}
    : value;
  if (rest.length) setOrdered(child, enObj?.[head] ?? {}, rest, value);

  if (head in obj) {
    obj[head] = child;
    return obj;
  }
  const enKeys = enObj ? Object.keys(enObj) : [];
  const idx = enKeys.indexOf(head);
  let after = null;
  for (let i = idx - 1; i >= 0; i--) {
    if (enKeys[i] in obj) {
      after = enKeys[i];
      break;
    }
  }
  const entries = Object.entries(obj);
  let pos =
    after === null
      ? idx < 0
        ? entries.length
        : 0
      : entries.findIndex(([k]) => k === after) + 1;
  // For plural forms that en doesn't have (e.g. foo_few), keep CLDR order
  // (zero, one, two, few, many, other) among the sibling forms.
  const m = idx < 0 && head.match(PLURAL_SUFFIX);
  if (m) {
    const base = head.slice(0, -m[0].length);
    const order = PLURAL_ORDER.indexOf(m[1]);
    const siblings = entries
      .map(([k], i) => ({
        i,
        form: k.startsWith(`${base}_`)
          ? PLURAL_ORDER.indexOf(k.slice(base.length + 1))
          : -1,
      }))
      .filter((s) => s.form >= 0);
    const next = siblings.find((s) => s.form > order);
    if (next) pos = next.i;
    else if (siblings.length) pos = siblings.at(-1).i + 1;
  }
  entries.splice(pos, 0, [head, child]);
  for (const k of Object.keys(obj)) delete obj[k];
  for (const [k, v] of entries) obj[k] = v;
  return obj;
}

function deletePath(obj, parts) {
  const [head, ...rest] = parts;
  if (!(head in obj)) return;
  if (!rest.length) {
    delete obj[head];
    return;
  }
  deletePath(obj[head], rest);
  if (
    obj[head] &&
    typeof obj[head] === "object" &&
    !Object.keys(obj[head]).length
  )
    delete obj[head];
}

function apply(args) {
  const [locale, input] = args;
  if (!locale || !input) {
    console.error("usage: apply <locale> <translations.json> [--prune]");
    process.exit(1);
  }
  const enObj = JSON.parse(fs.readFileSync(fileAbs(SOURCE), "utf8"));
  const target = fs.existsSync(fileAbs(locale))
    ? JSON.parse(fs.readFileSync(fileAbs(locale), "utf8"))
    : {};
  const translations = flatten(JSON.parse(fs.readFileSync(input, "utf8")));

  for (const [key, value] of Object.entries(translations)) {
    if (typeof value !== "string" || !value) {
      console.error(`skipping ${key}: empty or non-string value`);
      continue;
    }
    setOrdered(target, enObj, key.split("."), value);
  }

  let pruned = 0;
  if (args.includes("--prune")) {
    const { expected, pluralBases } = expectedKeys(flatten(enObj), locale);
    for (const key of Object.keys(flatten(target))) {
      if (key in expected) continue;
      const m = key.match(PLURAL_SUFFIX);
      if (m && pluralBases.has(key.slice(0, -m[0].length))) continue;
      deletePath(target, key.split("."));
      pruned++;
    }
  }

  fs.mkdirSync(path.dirname(fileAbs(locale)), { recursive: true });
  fs.writeFileSync(fileAbs(locale), JSON.stringify(target, null, 2) + "\n");
  console.log(
    `${locale}: wrote ${Object.keys(translations).length} keys${pruned ? `, pruned ${pruned} obsolete keys` : ""}`,
  );
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "report") report(rest);
else if (cmd === "apply") apply(rest);
else {
  console.error(
    "usage:\n  i18n.mjs report [--locales de,fr] [--json]\n  i18n.mjs apply <locale> <translations.json> [--prune]",
  );
  process.exit(1);
}
