import { en, es, fr, ja, ko, pt_br, ru, vi, zh_cn, zh_tw } from "@nuxt/ui/locale";
import { normalizeLanguageCode } from "./language";

const uiLocales = { en, es, fr, ja, ko, pt_br, ru, vi, zh: zh_cn, zh_hant: zh_tw };
export function getUiLocale(language: string | null | undefined) {
  return uiLocales[normalizeLanguageCode(language)];
}
