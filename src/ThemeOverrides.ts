import { GlobalThemeOverrides } from 'naive-ui';

export const lightThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#1ab394'
  },
  Spin: {
    color: '#1ab394',
    textColor: '#292827 '
  }

  // ...
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
    optionColorHover: '#48c2a9'
  }
};
