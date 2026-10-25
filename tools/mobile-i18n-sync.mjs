#!/usr/bin/env node
/**
 * Syncs the shared web translation files into the mobile app.
 *
 * The mobile app reuses the web app's `translation` namespace so that keys
 * like `actions.save` or `common.tags` are translated identically (including
 * Polish) without maintaining a second copy by hand. Metro cannot reliably
 * bundle JSON from outside the mobile project root, so this script copies the
 * web locale files into `apps/mobile/lib/i18n/web-translations/`.
 *
 * The set of languages is derived from the committed mobile locale files
 * (`apps/mobile/lib/i18n/locales/*.json`), so a newly added language is
 * automatically synced and key-checked without editing this script.
 *
 * Usage:
 *   node tools/mobile-i18n-sync.mjs            # sync every shipped language
 *   node tools/mobile-i18n-sync.mjs --check    # CI: fail on stale copies or
 *                                              # en/<lang> key drift
 *   node tools/mobile-i18n-sync.mjs --lang fr  # sync a single language
 *
 * Adding a new language to mobile only requires:
 *   1. web locale exists at apps/web/lib/i18n/locales/<lang>/translation.json
 *   2. add apps/mobile/lib/i18n/locales/<lang>.json (the `mobile` namespace)
 *   3. run this script (copies the shared `translation` namespace)
 *   4. register <lang> in SUPPORTED_LANGUAGES (apps/mobile/lib/i18n/index.ts)
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webLocalesDir = join(root, "apps/web/lib/i18n/locales");
const mobileTargetDir = join(root, "apps/mobile/lib/i18n/web-translations");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const langFlagIndex = args.indexOf("--lang");
const onlyLang = langFlagIndex >= 0 ? args[langFlagIndex + 1] : undefined;

if (langFlagIndex >= 0 && !onlyLang) {
  console.error("error: --lang requires a language code argument");
  process.exit(2);
}

const mobileLocalesDir = join(root, "apps/mobile/lib/i18n/locales");

/**
 * Languages the mobile app ships, derived from the committed mobile locale
 * files. Deriving instead of hardcoding keeps `--check` (and CI) covering
 * every newly registered language automatically.
 */
function discoverMobileLanguages() {
  if (!existsSync(mobileLocalesDir)) {
    return [];
  }
  return readdirSync(mobileLocalesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .sort();
}

const mobileLanguages = discoverMobileLanguages();
const langs = onlyLang ? [onlyLang] : mobileLanguages;

if (langs.length === 0) {
  console.error(`error: no mobile locales found in ${mobileLocalesDir}`);
  process.exit(2);
}

mkdirSync(mobileTargetDir, { recursive: true });

let failed = false;
for (const lang of langs) {
  const src = join(webLocalesDir, lang, "translation.json");
  const dest = join(mobileTargetDir, `${lang}.json`);

  if (!existsSync(src)) {
    console.error(`error: missing web locale source: ${src}`);
    failed = true;
    continue;
  }

  // Validate that the source is parseable JSON before copying.
  try {
    JSON.parse(readFileSync(src, "utf8"));
  } catch (e) {
    console.error(`error: invalid JSON in ${src}: ${e.message}`);
    failed = true;
    continue;
  }

  if (checkOnly) {
    if (!existsSync(dest)) {
      console.error(`stale: ${dest} does not exist (run sync)`);
      failed = true;
      continue;
    }
    const srcContent = readFileSync(src, "utf8");
    const destContent = readFileSync(dest, "utf8");
    if (srcContent !== destContent) {
      console.error(
        `stale: ${dest} differs from ${src} (run: node tools/mobile-i18n-sync.mjs)`,
      );
      failed = true;
    } else {
      console.log(`ok: ${lang}.json is in sync`);
    }
    continue;
  }

  copyFileSync(src, dest);
  console.log(`synced: ${src} -> ${dest}`);
}

function flatKeys(obj, prefix = "") {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flatKeys(value, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

// The mobile-only `mobile` namespace must have identical keys in every
// shipped language, otherwise the UI falls back to English silently.
const referenceLang = "en";
const mobileReference = JSON.parse(
  readFileSync(join(mobileLocalesDir, `${referenceLang}.json`), "utf8"),
);
const mobileEnKeys = new Set(flatKeys(mobileReference));
for (const lang of mobileLanguages.filter((l) => l !== referenceLang)) {
  const path = join(mobileLocalesDir, `${lang}.json`);
  if (!existsSync(path)) {
    console.error(`error: missing mobile locale: ${path}`);
    failed = true;
    continue;
  }
  const keys = new Set(flatKeys(JSON.parse(readFileSync(path, "utf8"))));
  const missing = [...mobileEnKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !mobileEnKeys.has(k));
  if (missing.length > 0 || extra.length > 0) {
    for (const k of missing)
      console.error(`parity: ${lang}.json missing key: ${k}`);
    for (const k of extra)
      console.error(`parity: ${lang}.json extra key: ${k}`);
    failed = true;
  } else {
    console.log(`ok: mobile ${lang}.json key parity (${keys.size} keys)`);
  }
}

process.exit(failed ? 1 : 0);
