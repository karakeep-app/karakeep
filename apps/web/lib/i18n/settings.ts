import { supportedLangs } from "@karakeep/shared/langs";

export const fallbackLng = "en";
export const languages = supportedLangs;
export const defaultNS = "translation";
export const cookieName = "i18next";

export function getOptions(lng: string = fallbackLng, ns: string = defaultNS) {
  return {
    supportedLngs: languages,
    fallbackLng,
    lng,
    fallbackNS: defaultNS,
    defaultNS,
    ns,
  };
}
