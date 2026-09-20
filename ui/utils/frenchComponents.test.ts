import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";
import { baseCompile } from "@intlify/message-compiler";
import fr from "../../i18n/locales/fr.json";
import { frGridLocale } from "../chen/locales/fr";
import { translateWebProxy } from "../../packages/web-proxy/src/i18n";

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

  it("translates shared web proxy status, errors and regional French locales", () => {
    expect(translateWebProxy("正在建立安全登录会话", "fr-CA")).toBe(
      "Établissement d’une session de connexion sécurisée"
    );
    expect(translateWebProxy("页面加载失败：ERR_CONNECTION_REFUSED", "fr")).toBe(
      "Échec du chargement de la page : ERR_CONNECTION_REFUSED"
    );
    expect(translateWebProxy("remote error details", "fr")).toBe("remote error details");
    expect(translateWebProxy("正在建立安全登录会话", "zh")).toBe("正在建立安全登录会话");
  });

  it("localizes grid filters and keeps AG Grid variable placeholders", () => {
    expect(frGridLocale.noRowsToShow).toBe("Aucune ligne à afficher");
    expect(frGridLocale.contains).toBe("Contient");
    expect(frGridLocale.minDateValidation).toContain(`\${variable}`);
  });
});
