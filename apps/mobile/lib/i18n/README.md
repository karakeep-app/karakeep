# Mobile internationalization (i18n)

The mobile app (`apps/mobile`) is localized with English as the source and
fallback language. Every other language is an entry in the `LANGUAGES` list
in `index.ts`, so adding one is a small, mechanical task.

## Architecture

- **Runtime:** [`i18next`](https://www.i18next.com/) +
  [`react-i18next`](https://react.i18next.com/) — the same libraries the web
  app uses (`apps/web/lib/i18n`), so concepts, ICU-style interpolation
  (`{{name}}`, `{{count}}`) and plural handling behave identically.
- **Two namespaces:**
  - `translation` — the web app's locale files, reused verbatim. Keys like
    `actions.save`, `common.tags`, `dialogs.bookmarks.*` or `toasts.*`
    render exactly the same wording on web and mobile, including the
    community translations from Weblate.
  - `mobile` — strings that only exist in the mobile app
    (`apps/mobile/lib/i18n/locales/<lang>.json`).
- **Shared files, static imports.** The `translation` namespace is imported
  directly from `apps/web/lib/i18n/locales/<lang>/translation.json`, so web
  and Weblate updates reach mobile with no copy step. Metro can bundle it
  because `metro.config.js` adds the workspace root to `watchFolders`. The
  web's `i18next-resources-to-backend` dynamic `import()` pattern does not
  work under Metro, so every resource is statically imported in
  `apps/mobile/lib/i18n/index.ts`.

## Key files

| Path                                             | Purpose                                                     |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `apps/mobile/lib/i18n/index.ts`                  | `LANGUAGES` list, i18next singleton, language detection     |
| `apps/mobile/lib/i18n/hooks.ts`                  | `useTranslation`, `useAppTranslation`, shared-key helpers   |
| `apps/mobile/lib/i18n/provider.tsx`              | `I18nProvider` — applies the stored/OS language on startup |
| `apps/mobile/lib/i18n/types.d.ts`                | Typed `t()` keys for both namespaces (from the `en` files) |
| `apps/mobile/lib/i18n/locales/en.json`           | English source strings (`mobile` namespace)                 |
| `apps/mobile/lib/i18n/locales/<lang>.json`       | Translations of `en.json` (`mobile` namespace)              |
| `apps/web/lib/i18n/locales/*/translation.json`   | Shared `translation` namespace (owned by the web app)       |
| `apps/mobile/app/dashboard/settings/language.tsx`| In-app language picker (System + every shipped language)   |

## Language resolution

1. The user override is stored in the existing app settings (`language` key
   in `apps/mobile/lib/settings.ts`): `"system"` (default) or a language
   code from `LANGUAGES`.
2. `"system"` follows the OS preferred locales via
   `expo-localization`'s `getLocales()`, best-matched against
   `SUPPORTED_LANGUAGES` (exact tag → base language → English fallback).
3. `I18nProvider` (mounted in `apps/mobile/lib/providers.tsx`) applies the
   resolved language at startup and on every override change.

## Usage in components

```tsx
import { useTranslation } from "@/lib/i18n/hooks";

// Mobile-only string (default `mobile` namespace):
const { t } = useTranslation();
t("settings.theme"); // "Theme", or its translation

// Shared web concept (explicit hook for the `translation` namespace):
import { useSharedTranslation } from "@/lib/i18n/hooks";
const { t: tShared } = useSharedTranslation();
tShared("actions.save"); // same wording as the web app

// Shared-concept helpers (less prefix noise):
import { useCommonActions, useCommonStrings } from "@/lib/i18n/hooks";
const { save, cancel } = useCommonActions();
const { somethingWentWrong } = useCommonStrings();
```

Rules:

- **New user-visible string?** Add it to `locales/en.json` and to every
  other `locales/<lang>.json` (CI checks key parity), then use
  `t("section.key")`. Plural keys use the categories each language needs:
  `_one`/`_other` in English, whatever `Intl.PluralRules` reports elsewhere.
- **String already exists on web?** Reuse it via `useSharedTranslation()` /
  `useCommonActions()` / `useCommonStrings()` instead of duplicating it —
  check `apps/web/lib/i18n/locales/en/translation.json` first. Do **not**
  call `t("translation:...")` on the default `mobile` function: with typed
  resources this is a type error (and historically crashed the TS checker).
- **Static navigation `options` above `<Providers>`?** Use
  `useAppTranslation()` from `@/lib/i18n/hooks` (binds the shared singleton
  explicitly).
- **Non-component code** (`lib/*.ts`, e.g. `shareBookmark`,
  `offlineLibrary`)? Use the `i18n.t(...)` singleton from `@/lib/i18n`.
- **Native menu actions** (`MenuView`, toolbar registry): build titles inside
  the component body with `t(...)` so they re-render on language change.

## Adding a new language

1. Make sure the web locale exists:
   `apps/web/lib/i18n/locales/<lang>/translation.json`.
2. Create `apps/mobile/lib/i18n/locales/<lang>.json` with the same keys as
   `en.json`, translated.
3. In `apps/mobile/lib/i18n/index.ts`, import that file, the web
   `translation.json` and the date-fns locale, and add a `LANGUAGES` entry.
   The settings screen, OS-locale matching and the tests pick it up.
4. Run `pnpm test` in `apps/mobile`.

## Checks

`apps/mobile/lib/i18n/__tests__/language.test.ts` runs the same checks on
every language in `LANGUAGES`: the same keys as `en.json`, exactly the plural
forms the language uses, no empty strings, and matching date and number
locales. It runs with the other mobile unit tests in CI (`pnpm test` in
`apps/mobile`).
