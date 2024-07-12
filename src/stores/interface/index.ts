export interface GlobalState {
  isDark: Boolean;
  isFullScreen: Boolean;
  token: string;
  JMSOrg: string;
  primary: string;
  language: string;
  csrfToken: string;
  JMSLunaOra: string;
  HELP_SUPPORT_URL: string;
  HELP_DOCUMENT_URL: string;
  userInfo: { name: string };
  interface: OpenSetting;
}

export interface UseLoading {
  isLoading: boolean;
}

export interface OpenSetting {
  // 页面 ico 图标
  favicon?: string;

  // 页脚信息
  footer_content?: string;

  //
  login_image?: string;

  // tab 标签页标题
  login_title?: string;

  //
  logo_index?: string;

  // logo
  logo_logout?: string;

  //
  theme?: string;

  //
  theme_info?: {};
}

export interface UserState {
  // 用户头像
  avatar_url: string;

  // 用户名
  name: string;

  // 电子邮箱
  email: string;

  // 来源
  source: string;
}

export interface TreeState {
  isAsync: Boolean;
}

export type ObjToKeyValArray<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T];
