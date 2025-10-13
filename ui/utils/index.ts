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

export function processConnectionFailure(data: string) {
  // const errorData = JSON.parse(data);
  // const code = errorData.code;
  // console.log(errorData);

  // const { t } = useI18n();
  // const toast = useToast();

  // toast.add({
    // title: t("ConnectError.ConnectFailed"),
    // description: errorData.detail,
    // color: "error",
    // icon: "line-md:close-circle"
  // });

  // switch (code) {
  //   case "perm_account_invalid": {
  //   }
  // }
}
