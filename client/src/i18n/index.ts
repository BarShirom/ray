import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { he } from "./locales/he";

export const resources = { he: { translation: he } } as const;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: typeof resources.he;
    returnNull: false;
    strictKeyChecks: true;
    enableSelector: false;
  }
}

// Bundled resources initialize synchronously before React renders. No detection or loaders.
void i18next.use(initReactI18next).init({
  resources,
  lng: "he",
  fallbackLng: "he",
  supportedLngs: ["he"],
  defaultNS: "translation",
  initAsync: false,
  enableSelector: false,
  returnNull: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  parseMissingKeyHandler: () => he.errors.generic,
});

export const t = i18next.t.bind(i18next);

export function syncDocumentLocale(language = i18next.resolvedLanguage ?? "he", target = typeof document === "undefined" ? undefined : document) {
  if (!target) return;
  target.documentElement.lang = language;
  target.documentElement.dir = i18next.dir(language);
  target.title = t("common.title");
  target.querySelector('meta[name="description"]')?.setAttribute("content", t("common.description"));
}

syncDocumentLocale();
i18next.on("languageChanged", (language) => syncDocumentLocale(language));

export default i18next;
