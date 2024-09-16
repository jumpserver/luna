import {Theme} from '@src/sass/theme/interface';
import {headerTheme} from '@src/sass/theme/header';
import {mainTheme} from '@src/sass/theme/main';
import {menuTheme} from '@src/sass/theme/menu';

export const useTheme = () => {
  // 获取并设置主题类型
  const ThemeType = localStorage.getItem('themeType') || 'default';
  const html = document.documentElement as HTMLElement;

  // 通用设置主题的方法
  const applyTheme = (theme: Record<string, string>) => {
    Object.entries(theme).forEach(([key, value]) => {
      html.style.setProperty(key, value);
    });
  };

  // 切换主题方法
  const switchTheme = () => {
    if (ThemeType === 'darkBlue') {
      html.setAttribute('class', 'darkBlue');
    } else {
      html.setAttribute('class', '');
    }

    setMenuTheme();
    setMainTheme();
    setHeaderTheme();
  };

  // 初始化并设置菜单、主体和头部主题
  const setMenuTheme = () => applyTheme(menuTheme[ThemeType]);
  const setMainTheme = () => applyTheme(mainTheme[ThemeType]);
  const setHeaderTheme = () => applyTheme(headerTheme[ThemeType]);

  const initTheme = () => {
    setMenuTheme();
    setMainTheme();
    setHeaderTheme();
  };

  return {
    initTheme,
    setMenuTheme,
    setMainTheme,
    setHeaderTheme,
    switchTheme
  };
};

