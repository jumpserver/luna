import { apiRequest } from "@/composables/useApiRequest";
import { LanguageCode } from "@/lion/utils/config";

export { default as date } from "./date";
export { message } from "./modules";
export { LanguageCode };

type LionTranslations = Record<string, Record<string, any>>;

const normalizedLangCode = LanguageCode.toLowerCase();
let remoteTranslationsPromise: Promise<LionTranslations> | null = null;

export const loadRemoteTranslations = () => {
  if (!remoteTranslationsPromise) {
    remoteTranslationsPromise = apiRequest<LionTranslations>({
      method: "GET",
      path: "/api/v1/settings/i18n/lion/",
      query: {
        lang: normalizedLangCode,
        flat: 0
      }
    }).catch((error) => {
      remoteTranslationsPromise = null;
      throw error;
    });
  }
  return remoteTranslationsPromise;
};
