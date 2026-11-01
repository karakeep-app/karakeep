# Mobile internationalization (i18n)

The mobile app (`apps/mobile`) is fully localized with English as the source
language and Polish as the second supported language. The system is designed
so that adding another language is a small, mechanical task.

## Architecture

- **Runtime:** [`i18next`](https://www.i18next.com/) +
  [`react-i18next`](https://react.i18next.com/) — the same libraries the web
  app uses (`apps/web/lib/i18n`), so concepts, ICU-style interpolation
  (`{{name}}`, `{{count}}`) and plural handling behave identically.
- **Two namespaces:**
  - `translation` — the web app's locale files, reused verbatim. Keys like
    `actions.save`, `common.tags`, `dialogs.bookmarks.*` or `toasts.*`
    render exactly the same wording on web and mobile, including the
    community-maintained Polish translations.
  - `mobile` — strings that only exist in the mobile app
    (`apps/mobile/lib/i18n/locales/{en,pl}.json`).
- **Why a sync script instead of importing web JSON directly?** Metro must
  statically resolve every bundled file. It cannot reliably bundle JSON from
  outside the mobile project root, and the web's
  `i18next-resources-to-backend` dynamic `import()` pattern does not work
  under Metro either. All resources are therefore statically imported in
  `apps/mobile/lib/i18n/index.ts`.

## Key files

| Path                                             | Purpose                                                     |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `apps/mobile/lib/i18n/index.ts`                  | i18next singleton, resources, language matching/detection   |
| `apps/mobile/lib/i18n/hooks.ts`                  | `useTranslation`, `useAppTranslation`, shared-key helpers   |
| `apps/mobile/lib/i18n/provider.tsx`              | `I18nProvider` — applies the stored/OS language on startup |
| `apps/mobile/lib/i18n/types.d.ts`                | Typed `t()` keys for both namespaces (from the `en` files) |
| `apps/mobile/lib/i18n/locales/en.json`           | English source strings (`mobile` namespace)                 |
| `apps/mobile/lib/i18n/locales/pl.json`           | Polish translations (`mobile` namespace)                    |
| `apps/mobile/lib/i18n/web-translations/*.json`   | Synced copies of the web `translation` namespace            |
| `tools/mobile-i18n-sync.mjs`                     | Syncs web locales into mobile                               |
| `apps/mobile/app/dashboard/settings/language.tsx`| In-app language picker (System / English / Polish)         |

## Language resolution

1. The user override is stored in the existing app settings (`language` key
   in `apps/mobile/lib/settings.ts`): `"system"` (default), `"en"`, `"pl"`.
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
t("settings.theme"); // "Motyw" when the app runs in Polish

// Shared web concept (explicit hook for the `translation` namespace):
import { useSharedTranslation } from "@/lib/i18n/hooks";
const { t: tShared } = useSharedTranslation();
tShared("actions.save"); // "Zapisz", same as the web app

// Shared-concept helpers (less prefix noise):
import { useCommonActions, useCommonStrings } from "@/lib/i18n/hooks";
const { save, cancel } = useCommonActions();
const { somethingWentWrong } = useCommonStrings();
```

Rules:

- **New user-visible string?** Add it to `locales/en.json` **and**
  `locales/pl.json` (CI checks key parity), then use `t("section.key")`.
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
2. Sync it into mobile:
   `node tools/mobile-i18n-sync.mjs --lang <lang>`.
3. Create `apps/mobile/lib/i18n/locales/<lang>.json` with the same keys as
   `en.json`, translated.
4. Register `<lang>` in `SUPPORTED_LANGUAGES`
   (`apps/mobile/lib/i18n/index.ts`). The settings screen and
   `getSystemLanguage()` pick it up automatically.
5. Run `node tools/mobile-i18n-sync.mjs --check` and the locale parity check
   (see below) to verify.

## Checks

```bash
# Web `translation` copies are up to date:
node tools/mobile-i18n-sync.mjs --check

# en/pl `mobile` namespaces have identical keys:
node -e "
const f = (l) => Object.keys(require('./apps/mobile/lib/i18n/locales/' + l + '.json'));
"
```

Both checks should run in CI for every PR touching `apps/mobile/lib/i18n`
or `apps/web/lib/i18n/locales`.
