import type { AssetItem, LangType, PermedProtocol, RawAssetData } from "~/types/index";
import { desktopOs } from "~/shared/desktop/bridge";

const INTL_LOCALE_BY_LANGUAGE: Record<LangType, string> = {
  zh: "zh-CN",
  zh_hant: "zh-TW",
  en: "en",
  ja: "ja",
  pt_br: "pt-BR",
  es: "es",
  ru: "ru",
  ko: "ko",
  vi: "vi"
};

const PROTOCOL_PRIORITY: Record<string, number> = {
  ssh: 0,
  sftp: 1
};

function protocolPriority(protocol?: string) {
  const normalized = (protocol || "").trim().toLowerCase();
  return PROTOCOL_PRIORITY[normalized] ?? 2;
}

export function sortProtocolNames(protocols: string[]) {
  return [...protocols].sort((left, right) => protocolPriority(left) - protocolPriority(right));
}

export function sortPermedProtocols(protocols: PermedProtocol[]) {
  return [...protocols].sort((left, right) => protocolPriority(left?.name) - protocolPriority(right?.name));
}

export function transformAssetData(rawData: RawAssetData): AssetItem {
  const item: AssetItem = {
    id: rawData.id,
    name: rawData.name || "-",
    address: rawData.address || "-",
    zone: rawData.zone?.name || "-",
    comment: rawData.comment || "-",
    type: rawData.type?.value || "-",
    platform: rawData.platform?.name || "-",
    category: rawData.category?.value || "-",
    isActive: rawData.is_active ?? false,
    permedAccounts: rawData.permedAccounts || [],
    permedProtocols: rawData.permedProtocols || []
  };

  return item;
}

export function transformAssetDetail(assetId: string, detail: Record<string, any>): AssetItem {
  return {
    id: assetId,
    name: detail.name || assetId,
    address: detail.address || "-",
    platform: detail.platform?.name || detail.platform || "",
    zone: detail.zone?.name || detail.zone || "",
    isActive: true,
    category: detail.category?.value || detail.category || "",
    type: detail.type?.value || detail.type || "",
    permedAccounts: detail.permed_accounts ?? [],
    permedProtocols: (detail.permed_protocols ?? []).filter((protocol: { name?: string }) => protocol?.name !== "winrm")
  };
}

export function transformAssetsData(rawDataArray: RawAssetData[]): AssetItem[] {
  const data: AssetItem[] = [];

  for (let i = 0; i < rawDataArray.length; i++) {
    const item = rawDataArray[i];
    if (item) {
      const transformedItem = transformAssetData(item);
      data.push(transformedItem);
    }
  }

  return data;
}

/**
 * @description 获取操作系统的语言
 */
export function normalizeLanguageCode(lang: string | null | undefined): LangType {
  const normalized = (lang || "").trim().toLowerCase().replaceAll("_", "-");
  if (!normalized) return "en";

  if (normalized.startsWith("zh")) {
    return /(^|-)hant($|-)|^zh-(tw|hk|mo)(-|$)/.test(normalized) ? "zh_hant" : "zh";
  }

  const primary = normalized.split("-")[0] || "";
  if (primary === "pt") return "pt_br";
  if (["en", "ja", "es", "ru", "ko", "vi"].includes(primary)) return primary as LangType;
  return "en";
}

export function toIntlLocale(lang: string | null | undefined) {
  return INTL_LOCALE_BY_LANGUAGE[normalizeLanguageCode(lang)];
}

export async function resolveLanguageFromSystem(): Promise<LangType> {
  const locale = isDesktopRuntime() ? await desktopOs.locale() : globalThis.navigator?.language;
  if (locale) {
    return normalizeLanguageCode(locale);
  }

  const fallback = globalThis.navigator?.language || globalThis.navigator?.languages?.[0] || "";

  return normalizeLanguageCode(fallback);
}
