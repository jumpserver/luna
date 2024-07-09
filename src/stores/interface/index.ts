export interface UserState {
  token: string;
  JMSOrg: string;
  language: string;
  csrfToken: string;
  JMSLunaOra: string;
  userInfo: { name: string };
  interface: OpenSetting;
}

export interface UseLoading {
  isLoading: boolean;
}

export interface OpenSetting {
  favicon?: string;
  footer_content?: string;
  login_image?: string;
  login_title?: string;
  logo_index?: string;
  logo_logout?: string;
  theme?: string;
  theme_info?: {};
}
