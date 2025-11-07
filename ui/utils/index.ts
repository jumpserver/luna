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
 * @description 处理 cooklies 中的 django_language
 * @param cookies
 */
export function resolveLanguageFromCookies(cookies: string | undefined | null): "zh" | "en" {
  if (!cookies) return "en";

  const langEntry = cookies
    .split(";")
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.toLowerCase().startsWith("django_language="));

  if (!langEntry) return "en";

  const value = langEntry.split("=")[1]?.trim().toLowerCase();

  if (!value) return "en";

  return value === "zh-hans" || value.startsWith("zh") ? "zh" : "en";
}
