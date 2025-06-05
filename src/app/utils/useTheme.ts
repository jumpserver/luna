import { headerTheme } from "@src/sass/theme/header";
import { mainTheme } from "@src/sass/theme/main";
import { menuTheme } from "@src/sass/theme/leftbar";
import { dropdownTheme } from "@src/sass/theme/dropdown";

export const useTheme = () => {
  // 获取主题类型
  const ThemeType = localStorage.getItem("themeType") || "default";
  const html = document.documentElement as HTMLElement;

  // 通用设置主题的方法
  const applyTheme = (theme: Record<string, string>) => {
    Object.entries(theme).forEach(([key, value]) => {
      html.style.setProperty(key, value);
    });
  };

  // 切换主题方法
  const switchTheme = () => {
    if (ThemeType === "darkBlue") {
      html.setAttribute("class", "darkBlue");
    } else {
      html.setAttribute("class", "");
    }

    // 应用所有主题
    initTheme();
  };

  // 初始化并设置所有主题
  const setMenuTheme = () => applyTheme(menuTheme);
  const setMainTheme = () => applyTheme(mainTheme);
  const setHeaderTheme = () => applyTheme(headerTheme);
  const setDropdownTheme = () => applyTheme(dropdownTheme);

  const initTheme = () => {
    setMenuTheme();
    setMainTheme();
    setHeaderTheme();
    setDropdownTheme();
  };

  return {
    initTheme,
    setMenuTheme,
    setMainTheme,
    setHeaderTheme,
    setDropdownTheme,
    switchTheme,
  };
};
