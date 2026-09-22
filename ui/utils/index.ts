import type { AssetDetail, AssetDetailField, AssetItem, LangType, PermedProtocol, RawAssetData } from "~/types/index";
import { desktopOs } from "~/shared/desktop/bridge";
import { normalizeLanguageCode } from "../../i18n/language";
export { normalizeLanguageCode, toDjangoLanguageCode, toIntlLocale } from "../../i18n/language";

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

const assetDetailFieldValue = (field: AssetDetailField | undefined) => {
  if (typeof field === "string") return field;
  return field?.name || field?.value || "";
};

export function transformAssetDetail(assetId: string, detail: AssetDetail): AssetItem {
  return {
    id: assetId,
    name: detail.name || assetId,
    address: detail.address || "-",
    platform: assetDetailFieldValue(detail.platform),
    zone: assetDetailFieldValue(detail.zone),
    isActive: true,
    category: assetDetailFieldValue(detail.category),
    type: assetDetailFieldValue(detail.type),
    permedAccounts: detail.permed_accounts ?? [],
    permedProtocols: (detail.permed_protocols ?? []).filter((protocol) => protocol?.name !== "winrm")
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

export async function resolveLanguageFromSystem(): Promise<LangType> {
  const locale = isDesktopRuntime() ? await desktopOs.locale() : globalThis.navigator?.language;
  if (locale) {
    return normalizeLanguageCode(locale);
  }

  const fallback = globalThis.navigator?.language || globalThis.navigator?.languages?.[0] || "";

  return normalizeLanguageCode(fallback);
}
