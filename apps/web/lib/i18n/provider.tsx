import { i18n } from "@/lib/i18n/client";
import { I18nextProvider } from "react-i18next";

const CustomI18nextProvider = ({
  lang,
  children,
}: {
  lang: string;
  children: React.ReactNode;
}) => {
  if (i18n.language !== lang) {
    i18n.changeLanguage(lang);
  }

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
};

export default CustomI18nextProvider;
