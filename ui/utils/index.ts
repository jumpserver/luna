import type { AssetItem, RawAssetData } from "~/types/index";

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
export async function resolveLanguageFromCookies(): Promise<"zh" | "en"> {
  const normalize = (lang: string | null | undefined) => {
    if (!lang) return "en" as const;

    const normalized = lang.toLowerCase();
    if (normalized.includes("zh")) return "zh" as const;
    return "en" as const;
  };

  const locale = await useTauriOsLocale();
  if (locale) {
    return normalize(locale);
  }

  const fallback = (typeof navigator !== "undefined" && (navigator.language || navigator.languages?.[0])) || "";

  return normalize(fallback);
}
