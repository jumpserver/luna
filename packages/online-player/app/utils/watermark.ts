interface WatermarkFields {
  userId?: string;
  name?: string;
  userName?: string;
  assetId?: string;
  assetName?: string;
  assetAddress?: string;
  currentTime?: string;
}

export function interpolateWatermark(template: string, fields: WatermarkFields) {
  if (!template) return "";

  return template.replace(/\$\{([^}]+)\}/g, (_, rawKey: string) => {
    const key = rawKey.trim() as keyof WatermarkFields;
    const value = fields[key];
    return value == null || value === "" ? "N/A" : String(value);
  });
}
