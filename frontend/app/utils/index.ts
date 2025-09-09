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
    id: rawData.id || 'unknown',
    assetName: rawData.name || 'Unknown Asset',
    address: rawData.address || '',
    protocol: getProtocolFromPlatform(rawData.platform?.name),
    platform: rawData.platform?.name || 'Unknown Platform',
    zone: rawData.zone?.name || 'Default Zone',
    isActive: rawData.is_active ?? true,
    comment: rawData.comment || undefined,
  };
}

export function transformAssetsData(rawDataArray: RawAssetData[]): AssetItem[] {
  return rawDataArray.map(transformAssetData);
}
