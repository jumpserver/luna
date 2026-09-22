import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";
import { baseCompile } from "@intlify/message-compiler";
import fr from "../../i18n/locales/fr.json";
import { frGridLocale } from "../chen/locales/fr";
import { formatWebProxyMessage, webProxyMessages } from "../../packages/web-proxy/src/i18n";
import { getUiLocale } from "../../i18n/ui";
import { normalizeLanguageCode } from "../../i18n/language";

function checkMessages(messages: Record<string, unknown>) {
  for (const value of Object.values(messages)) {
    if (typeof value === "string") {
      baseCompile(value, {
        onError: (error) => {
          throw error;
        }
      });
    } else {
      checkMessages(value as Record<string, unknown>);
    }
  }
}

describe("French component messages", () => {
  it("compiles all application messages including literal interpolation and plurals", () => {
    checkMessages(fr);
    const { t } = createI18n<{ message: typeof fr }, "fr", false>({
      legacy: false,
      locale: "fr",
      messages: { fr }
    }).global;
    expect(t("koko.fileManagement.selectedFiles", 2)).toBe("2 fichiers sélectionnés");
  });

  it.each([
    ["fr-CA", "fr"],
    ["en-US", "en"],
    ["zh-CN", "zh-CN"],
    ["zh-Hant-HK", "zh-TW"],
    ["ja-JP", "ja"],
    ["pt_BR", "pt-BR"],
    ["es-MX", "es"],
    ["ko-KR", "ko"],
    ["ru-RU", "ru"],
    ["vi-VN", "vi"],
    ["de-DE", "en"]
  ])("maps %s to the shared UI locale %s", (language, expected) => {
    expect(getUiLocale(language).code).toBe(expected);
  });

  it("uses stable keys and matching placeholders in every Web Proxy catalog", () => {
    const reference = webProxyMessages.en.WebProxy;
    for (const messages of Object.values(webProxyMessages)) {
      expect(Object.keys(messages.WebProxy).sort()).toEqual(Object.keys(reference).sort());
      checkMessages(messages);
      for (const [key, value] of Object.entries(messages.WebProxy)) {
        expect(key).toMatch(/^[A-Za-z]+$/);
        expect([...value.matchAll(/\{\w+\}/g)].map(([match]) => match).sort()).toEqual(
          [...reference[key as keyof typeof reference].matchAll(/\{\w+\}/g)].map(([match]) => match).sort()
        );
      }
    }
  });

  it("formats bridge message codes in the active locale, with English fallback", () => {
    const { t, locale } = createI18n<{}, "en" | "fr" | "zh" | "ja", false>({
      legacy: false,
      locale: normalizeLanguageCode("fr-CA"),
      fallbackLocale: "en",
      missingWarn: false,
      fallbackWarn: false,
      messages: { ...webProxyMessages, ja: {} }
    }).global;
    expect(formatWebProxyMessage("WebProxy.EstablishingSecureLogin", t)).toBe(
      "Établissement d’une session de connexion sécurisée"
    );
    expect(formatWebProxyMessage("WebProxy.PageLoadFailed: ERR_CONNECTION_REFUSED", t)).toBe(
      "Échec du chargement de la page : ERR_CONNECTION_REFUSED"
    );
    expect(
      formatWebProxyMessage("Error: Error invoking remote method 'web-proxy:invoke': Error: WebProxy.ViewClosed", t)
    ).toBe("La vue Web Proxy est fermée");
    expect(formatWebProxyMessage("remote error details", t)).toBe("remote error details");
    expect(formatWebProxyMessage("WebProxy.UnknownCode", t)).toBe("WebProxy.UnknownCode");
    expect(t("WebProxy.WaitedSeconds", { seconds: 3 })).toBe("Attente depuis 3 secondes");
    locale.value = "zh";
    expect(formatWebProxyMessage("WebProxy.EstablishingSecureLogin", t)).toBe("正在建立安全登录会话");
    locale.value = "en";
    expect(formatWebProxyMessage("WebProxy.EstablishingSecureLogin", t)).toBe("Establishing a secure login session");
    locale.value = "ja";
    expect(formatWebProxyMessage("WebProxy.EstablishingSecureLogin", t)).toBe("Establishing a secure login session");
  });

  it("localizes grid filters and keeps AG Grid variable placeholders", () => {
    expect(frGridLocale.noRowsToShow).toBe("Aucune ligne à afficher");
    expect(frGridLocale.contains).toBe("Contient");
    expect(frGridLocale.minDateValidation).toContain(`\${variable}`);
  });
});
