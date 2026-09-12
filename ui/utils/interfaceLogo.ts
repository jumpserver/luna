/** Default core assets use local branding; uploaded media remains custom. */
export function isDefaultInterfaceLogo(value?: string) {
  if (!value?.trim()) return true;
  try {
    const pathname = new URL(value.trim(), "https://jumpserver.invalid").pathname;
    return /\/static\/img\/(?:logo\.png|logo_white\.png|logo_text_white\.svg)$/.test(pathname);
  } catch {
    return false;
  }
}
