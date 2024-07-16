import { GlobalThemeOverrides } from 'naive-ui';

export const lightThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#1ab394'
  },
  Spin: {
    color: '#1ab394',
    textColor: '#292827'
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
  },
  List: {
    textColor: '#1ab394',
    fontSize: '15px',
    fontWeight: '700'
  },
  Tag: {
    color: '#000',
    textColor: '#eee',
    fontSizeLarge: '15px',
    padding: '0 12px'
  },
  Button: {
    textColor: '#fff'
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
  },
  List: {
    color: '#101014',
    textColor: '#fff',
    fontSize: '15px',
    fontWeight: '500'
  },
  Tag: {
    color: '#fff',
    textColor: '#eee',
    fontSizeLarge: '15px',
    padding: '0 12px'
  },
  Button: {
    colorPrimary: '#1ab394',
    textColorPrimary: '#fff',

    // button 悬浮的样式
    colorHoverPrimary: '#1ab394',
    textColorHoverPrimary: '#fff',
    borderHoverPrimary: '#000',

    // button 聚焦的样式
    textColorFocusPrimary: '#fff',
    colorFocusPrimary: '#1ab394',
    borderFocusPrimary: '#000',

    //
    textColorPressedPrimary: '#fff',
    colorPressedPrimary: '#1ab394',
    borderPressedPrimary: '#000'
  }
};
