import type { DropdownMenuItem } from '@nuxt/ui';

type ActionType = 'action' | 'select';

export interface ActionItem {
  key: string;
  iconName: string;
  tooltipLabel: string;
  type: ActionType;
  selectItems?: DropdownMenuItem[];
  onClick?: () => void;
}

export interface ConfigItem {
  name: string;
  display_name: string;
  protocol: string[];
  comment: {
    zh: string;
    en: string;
  };
  download_url: string;
  type: string;
  path: string;
  arg_format: string;
  match_first: string[];
  is_internal: boolean;
  is_default: boolean;
  is_set: boolean;
}

export interface Cookies {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
}

export interface UserData {
  avatar_url: string;

  name: string;

  // headerJson: string;

  // csrf_token: string;
}
