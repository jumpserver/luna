export type LangType = "zh" | "zh_hant" | "en" | "fr" | "ja" | "pt_br" | "es" | "ru" | "ko" | "vi";

const INTL_LOCALE_BY_LANGUAGE: Record<LangType, string> = {
  zh: "zh-CN",
  zh_hant: "zh-TW",
  en: "en",
  fr: "fr",
  ja: "ja",
  pt_br: "pt-BR",
  es: "es",
  ru: "ru",
  ko: "ko",
  vi: "vi"
};

/**
 * @description 获取操作系统的语言
 */
export function normalizeLanguageCode(lang: string | null | undefined): LangType {
  const normalized = (lang || "").trim().toLowerCase().replaceAll("_", "-");
  if (!normalized) return "en";

  if (normalized.startsWith("zh")) {
    return /(?:^|-)hant(?:$|-)|^zh-(?:tw|hk|mo)(?:-|$)/.test(normalized) ? "zh_hant" : "zh";
  }

  const primary = normalized.split("-")[0] || "";
  if (primary === "pt") return "pt_br";
  if (["en", "fr", "ja", "es", "ru", "ko", "vi"].includes(primary)) return primary as LangType;
  return "en";
}

export function toDjangoLanguageCode(lang: LangType) {
  if (lang === "zh") return "zh-hans";
  return lang.replaceAll("_", "-");
}

export function toIntlLocale(lang: string | null | undefined) {
  return INTL_LOCALE_BY_LANGUAGE[normalizeLanguageCode(lang)];
}
