export interface UserState {
  token: string;
  JMSOrg: string;
  language: string;
  csrfToken: string;
  JMSLunaOra: string;
  userInfo: { name: string };
}

export interface UseLoading {
  isLoading: boolean;
}
