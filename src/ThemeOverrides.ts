import { GlobalThemeOverrides } from 'naive-ui';

export const lightThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#1ab394'
  },
  Spin: {
    color: '#1ab394',
    textColor: '#292827 '
  },
  Dropdown: {
    optionColorHover: '#48c2a9',
    optionTextColorHover: '#fff'
  },
  Select: {
    selectedColor: '#000'
  },
  Switch: {
    // railColor: '#48c2a9'
  }
};

export const darkThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#1ab394'
  },
  Spin: {
    color: '#48c2a9',
    textColor: '#ffffff'
  },
  Dropdown: {
    optionColorHover: '#48c2a9',
    optionTextColorHover: '#101014'
  },
  Switch: {
    railColorActive: '#48c2a9'
  }
};
