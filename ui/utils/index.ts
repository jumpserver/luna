import type { AssetItem, RawAssetData } from "~/types/index";

export function transformAssetData(rawData: RawAssetData): AssetItem {
  const item: AssetItem = {
    id: rawData.id,
    name: rawData.name || "-",
    address: rawData.address || "-",
    zone: rawData.zone?.name || "-",
    comment: rawData.comment || "-",
    isActive: rawData.is_active ?? false,
    platform: rawData.platform?.name || "-",
    permedAccounts: [],
    permedProtocols: [],
    category: rawData.category?.value || "-",
    type: rawData.type?.value || "-"
  };

  console.log("item: ", item);
  return item;
}

export function transformAssetsData(rawDataArray: RawAssetData[]): AssetItem[] {
  const data: AssetItem[] = [];
  console.log("rawDataArray: ", rawDataArray);

  for (let i = 0; i < rawDataArray.length; i++) {
    const item = rawDataArray[i];
    if (item) {
      const transformedItem = transformAssetData(item);
      data.push(transformedItem);
    }
  }

  return data;
}
