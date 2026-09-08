export { interpolateWatermark, softenWatermarkColor } from "#online-player/utils/watermark";

export interface WatermarkTemplateSettings {
  SECURITY_WATERMARK_CONSOLE_CONTENT?: string;
  SECURITY_WATERMARK_SESSION_CONTENT?: string;
}

export function resolveWatermarkTemplate(settings: WatermarkTemplateSettings) {
  const consoleContent = String(settings.SECURITY_WATERMARK_CONSOLE_CONTENT || "").trim();
  if (consoleContent) return consoleContent;
  return String(settings.SECURITY_WATERMARK_SESSION_CONTENT || "");
}

export function isWatermarkSettingEnabled(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

export function shouldShowAppWatermark(params: { loggedIn: boolean; enabled: boolean; path: string }) {
  if (!params.loggedIn || !params.enabled) return false;
  return !params.path.includes("/replay/");
}

export function buildWatermarkViewer(name?: string, username?: string) {
  const displayName = name?.trim() || "";
  const displayUsername = username?.trim() || "";
  if (displayName) return displayUsername ? `${displayName}(${displayUsername})` : displayName;
  return displayUsername;
}
