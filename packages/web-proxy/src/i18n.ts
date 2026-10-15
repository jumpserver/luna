import en from "./locales/en.json";
import fr from "./locales/fr.json";
import zh from "./locales/zh.json";

export const webProxyMessages = { en, fr, zh };
type Translate = (key: string, params?: Record<string, string | number>) => string;

// Electron serializes Error.message as text. Only decode our known message codes;
// preserve diagnostic details from Chromium, proxies and remote sites verbatim.
export function formatWebProxyMessage(message: string, t: Translate): string {
  const match =
    /^(?:Error: )?(?:Error invoking remote method '[^']+': Error: )?WebProxy\.([A-Za-z]+)(?:: ([\s\S]*))?$/.exec(
      message
    );
  if (!match || !Object.hasOwn(en.WebProxy, match[1]!)) return message;
  const translated = t(`WebProxy.${match[1]}`);
  return match[2]
    ? t("WebProxy.ErrorWithDetail", { message: translated, detail: formatWebProxyMessage(match[2], t) })
    : translated;
}
