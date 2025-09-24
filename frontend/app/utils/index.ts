import type { AssetItem, RawAssetData } from '~/types/index';

export function transformAssetData(rawData: RawAssetData): AssetItem {
  const getProtocolFromPlatform = (platformName?: string): string => {
    if (!platformName) return 'ssh';

    const platform = platformName.toLowerCase();
    if (
      platform.includes('ssh') ||
      platform.includes('linux') ||
      platform.includes('unix')
    ) {
      return 'ssh';
    }
    if (platform.includes('rdp') || platform.includes('windows')) {
      return 'rdp';
    }
    if (platform.includes('telnet')) {
      return 'telnet';
    }
    if (platform.includes('vnc')) {
      return 'vnc';
    }
    if (platform.includes('ftp') || platform.includes('sftp')) {
      return 'sftp';
    }
    return 'ssh';
  };

  return {
    id: rawData.id,
    assetName: rawData.name || '-',
    address: rawData.address || '-',
    zone: rawData.zone?.name || '-',
    comment: rawData.comment || '-',
    isActive: rawData.is_active ?? false,
    platform: rawData.platform?.name || '-',
    permed_accounts: rawData.permed_accounts || [],
    permed_protocols: rawData.permed_protocols || [],
  };
}

export function transformAssetsData(rawDataArray: RawAssetData[]): AssetItem[] {
  return rawDataArray.map(transformAssetData);
}
