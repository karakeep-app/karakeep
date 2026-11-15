import "i18next";

import enMobile from "./locales/en.json";
import enWeb from "../../../web/lib/i18n/locales/en/translation.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "mobile";
    resources: {
      mobile: typeof enMobile;
      translation: typeof enWeb;
    };
  }
}
