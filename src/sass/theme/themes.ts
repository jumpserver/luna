export const themes = {
  default: "#483D3D",
  darkBlue: "#21399c",
};

/**
 * 获取当前主题的主色
 * @returns 当前主题的主色
 */
export function getThemeColor(): string {
  const themeType = localStorage.getItem("themeType") || "default";
  return themes[themeType as keyof typeof themes] || themes.default;
}
