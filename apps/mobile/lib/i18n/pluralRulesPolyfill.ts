// Hermes has no Intl.PluralRules, which i18next needs to pick _one/_other keys.
// It must load before i18next initializes.
import "intl-pluralrules";

type PluralRulesConstructor = typeof Intl.PluralRules & { polyfill?: boolean };

const PluralRules = Intl.PluralRules as PluralRulesConstructor;

// intl-pluralrules 2.0.1 formats the number with digit grouping ("1,003")
// before handing it to its CLDR rules, which then misread it: Arabic and
// Romanian pick `other` instead of `few` for 1003. It passes our options on to
// that formatter, so turn grouping off.
if (PluralRules.polyfill) {
  class UngroupedPluralRules extends PluralRules {
    constructor(
      locales?: string | readonly string[],
      options?: Intl.PluralRulesOptions,
    ) {
      super(
        locales as string | string[] | undefined,
        {
          ...options,
          useGrouping: false,
        } as Intl.PluralRulesOptions,
      );
    }
  }
  Object.assign(Intl, { PluralRules: UngroupedPluralRules });
}
