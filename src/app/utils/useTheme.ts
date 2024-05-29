import { Theme } from '@src/sass/theme/interface';
import { headerTheme } from '@src/sass/theme/header';
import { mainTheme } from '@src/sass/theme/main';
import { menuTheme } from '@src/sass/theme/menu';

export const useTheme = () => {
  // 后续若有拓展可在此基础上进行，例如在 Luna 的基础上切换主体颜色等
  // 现阶段可通过手动切换函数中的 type 来查看样式效果
  const setMenuTheme = () => {
    const type: Theme.ThemeType = 'darkBlue';

    // todo)) 从localStorage中获取主题类型

    const theme = menuTheme[type];
    for (const [key, value] of Object.entries(theme)) {
      document.documentElement.style.setProperty(key, value);
    }
  };
  const setMainTheme = () => {
    const type: Theme.ThemeType = 'darkBlue';

    const theme = mainTheme[type];
    for (const [key, value] of Object.entries(theme)) {
      document.documentElement.style.setProperty(key, value);
    }
  };
  const setHeaderTheme = () => {
    const type: Theme.ThemeType = 'darkBlue';

    const theme = headerTheme[type];
    for (const [key, value] of Object.entries(theme)) {
      document.documentElement.style.setProperty(key, value);
    }
  };

  const initTheme = () => {
    setMenuTheme();
    setMainTheme();
    setHeaderTheme();
  };

  return {
    initTheme,
    setMenuTheme,
    setMainTheme,
    setHeaderTheme
  };
};
